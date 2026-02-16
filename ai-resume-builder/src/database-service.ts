import { supabase } from './supabase-client';

export class DatabaseService {
  private static normalizeResumeId(id: any) {
    return String(id ?? '').trim();
  }

  private static async findExistingOptimizedResume(userId: string, optimizedFromId: any) {
    const normalizedOriginalId = DatabaseService.normalizeResumeId(optimizedFromId);
    if (!normalizedOriginalId) return { success: true, data: null as any, error: null as any };

    // Try server-side JSON path filtering first.
    const filtered = await supabase
      .from('resumes')
      .select('*')
      .eq('user_id', userId)
      .eq('resume_data->>optimizationStatus', 'optimized')
      .eq('resume_data->>optimizedFromId', normalizedOriginalId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!filtered.error) {
      return { success: true, data: filtered.data, error: null as any };
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
      return status === 'optimized' && fromId === normalizedOriginalId;
    }) || null;

    return { success: true, data: hit, error: null as any };
  }

  // 创建用户记录
  static async createUser(userId: string, email: string, name: string) {
    try {
      const { error } = await supabase
        .from('users')
        .insert({
          id: userId,
          email: email,
          name: name,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (error) {
        console.error('Error creating user record:', error);
        return { success: false, error };
      }

      return { success: true };
    } catch (err) {
      console.error('Database operation failed:', err);
      return { success: false, error: err };
    }
  }

  // 获取用户信息
  static async getUser(userId: string) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Error fetching user:', error);
        return { success: false, error, data: null };
      }

      return { success: true, data };
    } catch (err) {
      console.error('Database operation failed:', err);
      return { success: false, error: err, data: null };
    }
  }

  // 更新用户信息
  static async updateUser(userId: string, updates: any) {
    try {
      const { error } = await supabase
        .from('users')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (error) {
        console.error('Error updating user:', error);
        return { success: false, error };
      }

      return { success: true };
    } catch (err) {
      console.error('Database operation failed:', err);
      return { success: false, error: err };
    }
  }

  // 创建简历记录
  static async createResume(userId: string, title: string, resumeData: any) {
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

      const optimizationStatus = String(resumeData?.optimizationStatus || '').trim().toLowerCase();
      const optimizedFromId = DatabaseService.normalizeResumeId(resumeData?.optimizedFromId);
      if (optimizationStatus === 'optimized' && optimizedFromId) {
        const existing = await DatabaseService.findExistingOptimizedResume(userId, optimizedFromId);
        if (!existing.success) {
          console.error('❌ Error finding existing optimized resume:', existing.error);
          return { success: false, error: existing.error, data: null };
        }
        if (existing.data?.id) {
          const { data: updated, error: updateError } = await supabase
            .from('resumes')
            .update({
              title,
              resume_data: resumeData,
              updated_at: new Date().toISOString()
            })
            .eq('id', existing.data.id)
            .select()
            .single();
          if (updateError) {
            console.error('❌ Error updating existing optimized resume:', updateError);
            return { success: false, error: updateError, data: null };
          }
          return { success: true, data: updated };
        }
      }

      const { data, error } = await supabase
        .from('resumes')
        .insert({
          user_id: userId,
          title: title,
          resume_data: resumeData,
          score: 0,
          has_dot: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

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

      console.log('✅ Resume created successfully:', data);
      return { success: true, data };
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

      return { success: true, data: data || [] };
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

      const normalized = (data || []).map((row: any) => {
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
        .single();

      if (error) {
        console.error('Error fetching resume:', error);
        return { success: false, error, data: null };
      }

      return { success: true, data };
    } catch (err) {
      console.error('Database operation failed:', err);
      return { success: false, error: err, data: null };
    }
  }

  // 更新简历
  static async updateResume(resumeId: string, updates: any) {
    try {
      const { data, error } = await supabase
        .from('resumes')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
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

      return { success: true, data };
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
}
