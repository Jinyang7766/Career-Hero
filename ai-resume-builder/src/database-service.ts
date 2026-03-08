import { supabase } from './supabase-client';
import { sanitizeResumeSkills } from './resume-skill-sanitizer';
import {
  isResumeEligibleForLibrary,
  shouldPersistResumeRecord,
  withLocalOnlyDraftMeta,
} from './resume-storage-policy';
import {
  createUserRecord,
  getUserRecord,
  updateUserRecord,
} from './database/user-repository';
import {
  createPointsLedgerEntry,
  listPointsLedgerEntries,
} from './database/points-repository';

type CreateResumeOptions = {
  optimizedDuplicateStrategy?: 'reuse' | 'overwrite' | 'create_new';
  touchUpdatedAtOnOptimizedOverwrite?: boolean;
};

export class DatabaseService {
  private static normalizeResumeId(id: any) {
    return String(id ?? '').trim();
  }

  private static stripLocationFromResumeData(resumeData: any) {
    if (!resumeData || typeof resumeData !== 'object') return resumeData;
    return sanitizeResumeSkills({ ...resumeData });
  }

  private static sanitizeResumeRecord(record: any) {
    if (!record || typeof record !== 'object') return record;
    if (!record.resume_data || typeof record.resume_data !== 'object') return record;
    return {
      ...record,
      resume_data: DatabaseService.stripLocationFromResumeData(record.resume_data),
    };
  }

  private static sanitizeResumeRecords(records: any[] | null | undefined) {
    if (!Array.isArray(records)) return [];
    return records.map((record) => DatabaseService.sanitizeResumeRecord(record));
  }

  private static normalizeExportHistory(entries: any): Array<{
    filename: string;
    size: number;
    type: 'PDF' | 'IMAGE';
    exportedAt: string;
  }> {
    if (!Array.isArray(entries)) return [];
    return entries
      .map((entry) => {
        const filename = String(entry?.filename || '').trim() || '导出文件';
        const size = Math.max(0, Number(entry?.size) || 0);
        const type: 'PDF' | 'IMAGE' =
          String(entry?.type || '').trim().toUpperCase() === 'IMAGE' ? 'IMAGE' : 'PDF';
        const exportedAtRaw = String(entry?.exportedAt || '').trim();
        const exportedAt = exportedAtRaw || new Date().toISOString();
        return { filename, size, type, exportedAt };
      })
      .slice(0, 400);
  }

  private static mergeExportHistory(currentEntries: any, nextEntries: any) {
    const merged = [
      ...DatabaseService.normalizeExportHistory(nextEntries),
      ...DatabaseService.normalizeExportHistory(currentEntries),
    ];
    merged.sort((a, b) => {
      const aTime = Date.parse(String(a?.exportedAt || ''));
      const bTime = Date.parse(String(b?.exportedAt || ''));
      const aSafe = Number.isFinite(aTime) ? aTime : 0;
      const bSafe = Number.isFinite(bTime) ? bTime : 0;
      return bSafe - aSafe;
    });

    const deduped: typeof merged = [];
    const seen = new Set<string>();
    for (const item of merged) {
      const key = `${item.exportedAt}|${item.type}|${item.filename}|${item.size}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(item);
      if (deduped.length >= 200) break;
    }
    return deduped;
  }

  private static async getCurrentExportHistory(resumeId: string) {
    const queries = [
      'id,exportHistory:resume_data->exportHistory',
      'id,resume_data',
    ];
    for (const sel of queries) {
      const { data, error } = await supabase
        .from('resumes')
        .select(sel)
        .eq('id', resumeId)
        .maybeSingle();
      if (error) continue;
      if (!data || typeof data !== 'object') return [];
      const aliased = (data as any).exportHistory;
      if (aliased !== undefined) return DatabaseService.normalizeExportHistory(aliased);
      return DatabaseService.normalizeExportHistory((data as any)?.resume_data?.exportHistory);
    }
    return [];
  }

  private static isNoRowsError(error: any) {
    const code = String(error?.code || '').trim().toUpperCase();
    const msg = String(error?.message || '').toLowerCase();
    return code === 'PGRST116' || msg.includes('contains 0 rows') || msg.includes('single json object');
  }

  private static async findExistingOptimizedResume(userId: string, optimizedFromId: any, optimizationJdKey?: any) {
    const normalizedOriginalId = DatabaseService.normalizeResumeId(optimizedFromId);
    const normalizedJdKey = String(optimizationJdKey ?? '').trim();
    if (!normalizedOriginalId) return { success: true, data: null as any, error: null as any };

    // Try server-side JSON path filtering first.
    let filtered = await supabase
      .from('resumes')
      .select('*')
      .eq('user_id', userId)
      .eq('resume_data->>optimizationStatus', 'optimized')
      .eq('resume_data->>optimizedFromId', normalizedOriginalId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (normalizedJdKey) {
      filtered = await supabase
        .from('resumes')
        .select('*')
        .eq('user_id', userId)
        .eq('resume_data->>optimizationStatus', 'optimized')
        .eq('resume_data->>optimizedFromId', normalizedOriginalId)
        .eq('resume_data->>optimizationJdKey', normalizedJdKey)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    }

    if (!filtered.error) {
      return { success: true, data: DatabaseService.sanitizeResumeRecord(filtered.data), error: null as any };
    }

    // Fallback for environments where JSON path filter is unavailable.
    const all = await supabase
      .from('resumes')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    if (all.error) {
      return { success: false, data: null as any, error: all.error };
    }

    const hit = (all.data || []).find((r: any) => {
      const resumeData = r?.resume_data || {};
      const status = String(resumeData?.optimizationStatus || '').trim().toLowerCase();
      const fromId = DatabaseService.normalizeResumeId(resumeData?.optimizedFromId);
      const rowJdKey = String(resumeData?.optimizationJdKey ?? '').trim();
      const jdMatches = !normalizedJdKey || rowJdKey === normalizedJdKey || !rowJdKey;
      return status === 'optimized' && fromId === normalizedOriginalId && jdMatches;
    }) || null;

    return { success: true, data: DatabaseService.sanitizeResumeRecord(hit), error: null as any };
  }

  // 创建用户记录
  static async createUser(userId: string, email: string, name: string) {
    return createUserRecord(userId, email, name);
  }

  // 获取用户信息
  static async getUser(userId: string) {
    return getUserRecord(userId);
  }

  // 更新用户信息
  static async updateUser(userId: string, updates: any) {
    return updateUserRecord(userId, updates);
  }

  // 创建简历记录
  static async createResume(
    userId: string,
    title: string,
    resumeData: any,
    options?: CreateResumeOptions
  ) {
    try {
      console.log('=== DatabaseService.createResume 调试信息 ===');
      console.log('Creating resume:', { userId, title });
      console.log('Resume data validation:', {
        isObject: typeof resumeData === 'object',
        isNull: resumeData === null,
        isUndefined: resumeData === undefined,
        keys: resumeData ? Object.keys(resumeData) : [],
        size: resumeData ? JSON.stringify(resumeData).length : 0,
        hasPersonalInfo: resumeData?.personalInfo,
        hasWorkExps: resumeData?.workExps,
        hasEducations: resumeData?.educations,
        hasSkills: resumeData?.skills
      });

      // 验证简历数据
      if (!resumeData || typeof resumeData !== 'object') {
        console.error('❌ Invalid resume data: not an object');
        return { success: false, error: new Error('简历数据无效'), data: null };
      }

      if (Object.keys(resumeData).length === 0) {
        console.error('❌ Invalid resume data: empty object');
        return { success: false, error: new Error('简历数据为空'), data: null };
      }

      const sanitizedResumeData = DatabaseService.stripLocationFromResumeData(resumeData);
      if (!shouldPersistResumeRecord(sanitizedResumeData)) {
        const nowIso = new Date().toISOString();
        const localOnlyResumeData = withLocalOnlyDraftMeta(sanitizedResumeData);
        const localOnlyRecord = {
          id: null,
          user_id: userId,
          title,
          resume_data: localOnlyResumeData,
          score: 0,
          has_dot: false,
          created_at: nowIso,
          updated_at: nowIso,
          skipped_persist: true,
        };
        console.log('ℹ️ Skip remote persistence for non-analysis resume draft');
        return { success: true, data: DatabaseService.sanitizeResumeRecord(localOnlyRecord) };
      }
      const optimizationStatus = String(sanitizedResumeData?.optimizationStatus || '').trim().toLowerCase();
      const optimizedFromId = DatabaseService.normalizeResumeId(sanitizedResumeData?.optimizedFromId);
      const optimizationJdKey = String(sanitizedResumeData?.optimizationJdKey ?? '').trim();
      const strategy = options?.optimizedDuplicateStrategy || 'reuse';
      const shouldSkipDuplicateLookup = strategy === 'create_new';
      if (optimizationStatus === 'optimized' && optimizedFromId && !shouldSkipDuplicateLookup) {
        const existing = await DatabaseService.findExistingOptimizedResume(userId, optimizedFromId, optimizationJdKey);
        if (!existing.success) {
          console.error('❌ Error finding existing optimized resume:', existing.error);
          return { success: false, error: existing.error, data: null };
        }
        if (existing.data?.id) {
          if (strategy === 'reuse') {
            return { success: true, data: existing.data };
          }
          const touchUpdatedAt = options?.touchUpdatedAtOnOptimizedOverwrite === true;
          const overwritePayload = touchUpdatedAt
            ? {
                title,
                resume_data: sanitizedResumeData,
                updated_at: new Date().toISOString(),
              }
            : {
                title,
                resume_data: sanitizedResumeData,
              };
          const { data: updated, error: updateError } = await supabase
            .from('resumes')
            .update(overwritePayload)
            .eq('id', existing.data.id)
            .select()
            .maybeSingle();
          if (updateError) {
            console.error('❌ Error updating existing optimized resume:', updateError);
            return { success: false, error: updateError, data: null };
          }
          if (updated) return { success: true, data: updated };
          // Row may have been deleted/changed between lookup and update; continue with insert path.
        }
      }

      const { data, error } = await supabase
        .from('resumes')
        .insert({
          user_id: userId,
          title: title,
          resume_data: sanitizedResumeData,
          score: 0,
          has_dot: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .maybeSingle();

      console.log('Supabase insert result:', { data, error });

      if (error) {
        console.error('❌ Error creating resume:', error);
        console.error('Error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        return { success: false, error, data: null };
      }

      if (!data) {
        const fallback = await supabase
          .from('resumes')
          .select('*')
          .eq('user_id', userId)
          .eq('title', title)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!fallback.error && fallback.data) {
          return { success: true, data: DatabaseService.sanitizeResumeRecord(fallback.data) };
        }
        return { success: false, error: { code: 'RESUME_CREATE_EMPTY', message: '创建后未返回简历数据' }, data: null };
      }

      console.log('✅ Resume created successfully:', data);
      return { success: true, data: DatabaseService.sanitizeResumeRecord(data) };
    } catch (err) {
      console.error('❌ Database operation failed:', err);
      return { success: false, error: err, data: null };
    }
  }

  // 获取用户的所有简历
  static async getUserResumes(userId: string) {
    try {
      console.log('=== DatabaseService.getUserResumes 调试信息 ===');
      console.log('Querying resumes for user:', userId);

      const { data, error } = await supabase
        .from('resumes')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      console.log('Supabase query result:', { data, error });

      if (error) {
        console.error('❌ Error fetching resumes:', error);
        console.error('Error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        return { success: false, error, data: [] };
      }

      console.log('✅ Successfully fetched resumes:', {
        count: data?.length || 0,
        resumeIds: data?.map(r => r.id) || [],
        resumeTitles: data?.map(r => r.title) || [],
        resumeDataStatus: data?.map(r => ({
          id: r.id,
          title: r.title,
          hasResumeData: !!r.resume_data,
          resumeDataKeys: r.resume_data ? Object.keys(r.resume_data) : [],
          resumeDataSize: r.resume_data ? JSON.stringify(r.resume_data).length : 0
        })) || []
      });
      const sanitizedRows = DatabaseService.sanitizeResumeRecords(data);
      const visibleRows = sanitizedRows.filter((row: any) => isResumeEligibleForLibrary(row?.resume_data || {}));
      return { success: true, data: visibleRows };
    } catch (err) {
      console.error('❌ Database operation failed:', err);
      return { success: false, error: err, data: [] };
    }
  }

  // 仅获取导出历史所需的轻量字段，避免拉取完整 resume_data 导致页面卡顿
  static async getUserResumesExportHistory(userId: string) {
    try {
      const selects = [
        // Prefer json-path selection if PostgREST supports it (fast, minimal payload)
        'id,title,created_at,updated_at,exportHistory:resume_data->exportHistory',
        // Fallback: still avoid '*' but may include full json
        'id,title,created_at,updated_at,resume_data'
      ];

      let data: any[] | null = null;
      let error: any = null;

      for (const sel of selects) {
        const res = await supabase
          .from('resumes')
          .select(sel)
          .eq('user_id', userId)
          .order('created_at', { ascending: false });
        data = res.data as any[] | null;
        error = res.error;
        if (!error) break;
      }

      if (error) {
        console.error('Error fetching export history index:', error);
        return { success: false, error, data: [] as any[] };
      }

      const normalized = DatabaseService.sanitizeResumeRecords(data)
        .filter((row: any) => isResumeEligibleForLibrary(row?.resume_data || {}))
        .map((row: any) => {
        if (row && row.exportHistory !== undefined) return row;
        return { ...row, exportHistory: row?.resume_data?.exportHistory || [] };
      });
      return { success: true, data: normalized };
    } catch (err) {
      console.error('Database operation failed:', err);
      return { success: false, error: err, data: [] as any[] };
    }
  }

  // 获取单个简历
  static async getResume(resumeId: string | number) {
    try {
      const { data, error } = await supabase
        .from('resumes')
        .select('*')
        .eq('id', resumeId)
        .maybeSingle();

      if (error) {
        if (DatabaseService.isNoRowsError(error)) {
          return { success: false, error: null, data: null };
        }
        console.error('Error fetching resume:', error);
        return { success: false, error, data: null };
      }

      if (!data) {
        return { success: false, error: null, data: null };
      }

      return { success: true, data: DatabaseService.sanitizeResumeRecord(data) };
    } catch (err) {
      console.error('Database operation failed:', err);
      return { success: false, error: err, data: null };
    }
  }

  // 更新简历
  static async updateResume(
    resumeId: string,
    updates: any,
    options?: { touchUpdatedAt?: boolean; preserveExportHistory?: boolean }
  ) {
    try {
      const touchUpdatedAt = options?.touchUpdatedAt !== false;
      const preserveExportHistory = options?.preserveExportHistory !== false;
      const nextUpdates = updates && typeof updates === 'object' ? { ...updates } : updates;
      if (nextUpdates?.resume_data && typeof nextUpdates.resume_data === 'object') {
        const nextResumeData = {
          ...DatabaseService.stripLocationFromResumeData(nextUpdates.resume_data),
        } as any;
        if (preserveExportHistory) {
          const currentExportHistory = await DatabaseService.getCurrentExportHistory(String(resumeId || ''));
          const hasExplicitExportHistory = Object.prototype.hasOwnProperty.call(nextResumeData, 'exportHistory');
          if (!hasExplicitExportHistory) {
            nextResumeData.exportHistory = currentExportHistory;
          } else {
            nextResumeData.exportHistory = DatabaseService.mergeExportHistory(
              currentExportHistory,
              nextResumeData.exportHistory
            );
          }
        }
        nextUpdates.resume_data = nextResumeData;
      }
      const payload = touchUpdatedAt
        ? { ...nextUpdates, updated_at: new Date().toISOString() }
        : { ...nextUpdates };
      const { data, error } = await supabase
        .from('resumes')
        .update(payload)
        .eq('id', resumeId)
        .select()
        .maybeSingle();

      if (error) {
        console.error('Error updating resume:', error);
        return { success: false, error, data: null };
      }

      if (!data) {
        const notFoundError = {
          code: 'RESUME_NOT_FOUND_OR_NO_ACCESS',
          message: '未找到可更新的简历，或当前用户无权限更新该简历'
        };
        console.error('Error updating resume:', notFoundError, { resumeId });
        return { success: false, error: notFoundError, data: null };
      }

      return { success: true, data: DatabaseService.sanitizeResumeRecord(data) };
    } catch (err) {
      console.error('Database operation failed:', err);
      return { success: false, error: err, data: null };
    }
  }

  // 删除简历
  static async deleteResume(resumeId: string) {
    try {
      const { error } = await supabase
        .from('resumes')
        .delete()
        .eq('id', resumeId);

      if (error) {
        console.error('Error deleting resume:', error);
        return { success: false, error };
      }

      return { success: true };
    } catch (err) {
      console.error('Database operation failed:', err);
      return { success: false, error: err };
    }
  }

  // 记录 AI 建议评分
  static async createSuggestionFeedback(feedback: {
    userId: string;
    resumeId?: string | number | null;
    suggestionId: string;
    rating: 'up' | 'down';
    title?: string;
    reasonMasked?: string;
    originalValueMasked?: any;
    suggestedValueMasked?: any;
  }) {
    try {
      const { error } = await supabase
        .from('ai_suggestion_feedback')
        .insert({
          user_id: feedback.userId,
          resume_id: feedback.resumeId ?? null,
          suggestion_id: feedback.suggestionId,
          rating: feedback.rating,
          title: feedback.title,
          reason_masked: feedback.reasonMasked ?? null,
          original_value_masked: feedback.originalValueMasked ?? null,
          suggested_value_masked: feedback.suggestedValueMasked ?? null,
          created_at: new Date().toISOString()
        });

      if (error) {
        console.error('Error creating suggestion feedback:', error);
        return { success: false, error };
      }

      return { success: true };
    } catch (err) {
      console.error('Database operation failed:', err);
      return { success: false, error: err };
    }
  }

  // 记录积分流水（正数=增加，负数=扣减）
  static async createPointsLedger(entry: {
    userId: string;
    delta: number;
    action: string;
    sourceType?: string | null;
    sourceId?: string | number | null;
    note?: string | null;
    balanceAfter?: number | null;
    metadata?: any;
  }) {
    return createPointsLedgerEntry(entry);
  }

  static async listPointsLedger(userId: string, limit: number = 200) {
    return listPointsLedgerEntries(userId, limit);
  }
}
