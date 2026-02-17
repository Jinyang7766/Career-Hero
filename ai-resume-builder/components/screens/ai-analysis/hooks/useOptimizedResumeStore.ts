import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { DatabaseService } from '../../../../src/database-service';
import { supabase } from '../../../../src/supabase-client';
import { buildResumeTitle } from '../../../../src/resume-utils';
import type { ResumeData } from '../../../../types';
import { buildAnalysisReportId, makeJdKey } from '../id-utils';

type Params = {
  optimizedResumeId: string | number | null;
  setOptimizedResumeId: (id: string | number | null) => void;
  sourceResumeIdRef: MutableRefObject<string | number | null>;
  selectedResumeId: string | number | null;
  resumeData: ResumeData;
  allResumes: any[] | undefined;
  jdText: string;
  targetCompany: string;
  isSameResumeId: (a: any, b: any) => boolean;
  normalizeResumeId: (id: any) => string;
};

export const useOptimizedResumeStore = ({
  optimizedResumeId,
  setOptimizedResumeId,
  sourceResumeIdRef,
  selectedResumeId,
  resumeData,
  allResumes,
  jdText,
  targetCompany,
  isSameResumeId,
  normalizeResumeId,
}: Params) => {
  const optimizedResumeIdRef = useRef<string | number | null>(null);
  const creatingOptimizedResumeRef = useRef<Promise<string | number | null> | null>(null);
  const creatingOptimizedForKeyRef = useRef<string | null>(null);

  useEffect(() => {
    optimizedResumeIdRef.current = optimizedResumeId;
  }, [optimizedResumeId]);

  const resolveOriginalResumeIdForOptimization = () => {
    // Highest priority: if current resume is already optimized, always bind back to its source resume.
    if (resumeData?.optimizationStatus === 'optimized' && resumeData?.optimizedFromId) {
      return resumeData.optimizedFromId;
    }
    if (sourceResumeIdRef.current) return sourceResumeIdRef.current;
    if (selectedResumeId) return selectedResumeId;
    if (!resumeData?.id) return null;
    if (resumeData.optimizationStatus === 'optimized') {
      return resumeData.optimizedFromId || resumeData.id;
    }
    return resumeData.id;
  };

  const resolveCanonicalOriginalResumeId = async (candidateId: string | number) => {
    const direct = normalizeResumeId(candidateId);
    if (!direct) return direct;
    const row = await DatabaseService.getResume(candidateId);
    if (!row.success || !row.data?.resume_data) return direct;
    const rowData = row.data.resume_data || {};
    if (rowData.optimizationStatus === 'optimized' && rowData.optimizedFromId) {
      return normalizeResumeId(rowData.optimizedFromId);
    }
    return direct;
  };

  const isValidOptimizedMatch = (rowData: any, normalizedOriginalId: string, jdKey?: string) => {
    const rowJdKey = String(rowData?.optimizationJdKey || '').trim();
    const keyMatches = !jdKey || rowJdKey === jdKey || !rowJdKey;
    return (
      rowData?.optimizationStatus === 'optimized' &&
      isSameResumeId(rowData?.optimizedFromId, normalizedOriginalId) &&
      keyMatches
    );
  };

  const findExistingOptimizedResumeId = async (
    userId: string,
    originalResumeId: string | number,
    jdKey?: string
  ) => {
    const normalizedOriginalId = normalizeResumeId(originalResumeId);
    const list = await DatabaseService.getUserResumes(userId);
    if (!list.success || !Array.isArray(list.data)) return null;
    const hit = list.data.find((r: any) => {
      const data = r?.resume_data || {};
      return isValidOptimizedMatch(data, normalizedOriginalId, jdKey);
    });
    return hit?.id ? hit.id : null;
  };

  const ensureSingleOptimizedResume = async (
    userId: string,
    originalResumeId: string | number,
    baseResumeData: ResumeData,
    jdKeyOverride?: string
  ): Promise<string | number> => {
    const normalizedOriginalId = await resolveCanonicalOriginalResumeId(originalResumeId);
    const jdKey = jdKeyOverride || makeJdKey(jdText || baseResumeData.lastJdText || '');

    const current = optimizedResumeIdRef.current;
    if (current) {
      const currentRow = await DatabaseService.getResume(current);
      const currentData = currentRow.success ? currentRow.data?.resume_data : null;
      const isValidCurrent =
        !!currentRow.success &&
        !!currentRow.data &&
        isValidOptimizedMatch(currentData, normalizedOriginalId, jdKey);
      if (isValidCurrent) {
        return currentRow.data.id;
      }
      setOptimizedResumeId(null);
      optimizedResumeIdRef.current = null;
    }

    const originalRow = await DatabaseService.getResume(originalResumeId);
    const mappedOptimizedId = originalRow.success
      ? (originalRow.data?.resume_data || {}).optimizedResumeId
      : null;
    if (mappedOptimizedId) {
      const mappedRow = await DatabaseService.getResume(mappedOptimizedId);
      const mappedData = mappedRow.success ? (mappedRow.data?.resume_data || {}) : null;
      const mappedValid =
        !!mappedRow.success &&
        !!mappedRow.data &&
        isValidOptimizedMatch(mappedData, normalizedOriginalId, jdKey);
      if (mappedValid) {
        setOptimizedResumeId(mappedRow.data.id);
        optimizedResumeIdRef.current = mappedRow.data.id;
        return mappedRow.data.id;
      }
    }

    const existingId = await findExistingOptimizedResumeId(userId, normalizedOriginalId, jdKey);
    if (existingId) {
      setOptimizedResumeId(existingId);
      optimizedResumeIdRef.current = existingId;
      return existingId;
    }

    const dedupeKey = `${normalizedOriginalId}::${jdKey}`;
    if (creatingOptimizedResumeRef.current && creatingOptimizedForKeyRef.current === dedupeKey) {
      const pendingId = await creatingOptimizedResumeRef.current;
      if (!pendingId) throw new Error('创建优化简历失败');
      return pendingId;
    }

    creatingOptimizedForKeyRef.current = dedupeKey;
    creatingOptimizedResumeRef.current = (async () => {
      const baseTitle = allResumes?.find(r => isSameResumeId(r.id, baseResumeData.id))?.title || '简历';
      const newTitle = buildResumeTitle(baseTitle, baseResumeData, jdText, true, targetCompany);
      const createResult = await DatabaseService.createResume(userId, newTitle, {
        ...baseResumeData,
        optimizationStatus: 'optimized' as const,
        optimizedFromId: normalizedOriginalId,
        optimizationJdKey: jdKey,
        lastJdText: jdText || baseResumeData.lastJdText || '',
        targetCompany: targetCompany || baseResumeData.targetCompany || ''
      });

      if (!createResult.success || !createResult.data?.id) {
        console.error('ensureSingleOptimizedResume create failed:', createResult.error);
        const fallbackId = await findExistingOptimizedResumeId(userId, normalizedOriginalId, jdKey);
        if (fallbackId) return fallbackId;
        const errMsg =
          (createResult.error as any)?.message ||
          (createResult.error as any)?.details ||
          (createResult.error as any)?.code ||
          '创建优化简历失败';
        throw new Error(errMsg);
      }
      return createResult.data.id;
    })().finally(() => {
      creatingOptimizedResumeRef.current = null;
      creatingOptimizedForKeyRef.current = null;
    });

    const createdId = await creatingOptimizedResumeRef.current;
    if (!createdId) throw new Error('创建优化简历失败');

    setOptimizedResumeId(createdId);
    optimizedResumeIdRef.current = createdId;
    return createdId;
  };

  const resolveAnalysisBinding = async (originalResumeId: string | number, analysisJdText: string) => {
    const canonicalOriginalId = await resolveCanonicalOriginalResumeId(originalResumeId);
    const originalRow = await DatabaseService.getResume(canonicalOriginalId);
    if (!originalRow.success || !originalRow.data?.resume_data) return null;

    const originalData = originalRow.data.resume_data || {};
    const effectiveJdText = (analysisJdText || originalData.lastJdText || '').trim();
    const jdKey = makeJdKey(effectiveJdText);

    // Backward compatibility: old binding stored on original resume.
    const bindings = originalData.analysisBindings || {};
    const currentBinding = bindings[jdKey];
    if (currentBinding) {
      return {
        analysisReportId: String(currentBinding.analysisReportId || '').trim() || buildAnalysisReportId(canonicalOriginalId, effectiveJdText),
        optimizedResumeId: currentBinding.optimizedResumeId ?? null,
        jdKey,
      };
    }

    // New path: derive from optimized resume record keyed by original + JD.
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return null;

    const hitId = await findExistingOptimizedResumeId(user.id, canonicalOriginalId, jdKey);
    if (!hitId) return null;
    const hitRow = await DatabaseService.getResume(hitId);
    if (!hitRow.success || !hitRow.data?.resume_data) return null;
    const hitData = hitRow.data.resume_data || {};

    return {
      analysisReportId: String(hitData.analysisReportId || '').trim() || buildAnalysisReportId(canonicalOriginalId, effectiveJdText),
      optimizedResumeId: hitRow.data.id,
      jdKey,
    };
  };

  const ensureAnalysisBinding = async (
    originalResumeId: string | number,
    baseResumeData: ResumeData,
    analysisJdText: string
  ) => {
    const canonicalOriginalId = await resolveCanonicalOriginalResumeId(originalResumeId);
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('登录已过期，请重新登录后再分析');
    }

    const originalRow = await DatabaseService.getResume(canonicalOriginalId);
    if (!originalRow.success || !originalRow.data?.resume_data) {
      throw new Error('未找到原始简历，无法建立分析绑定');
    }

    const originalData = originalRow.data.resume_data || {};
    const effectiveJdText = (analysisJdText || originalData.lastJdText || '').trim();
    const jdKey = makeJdKey(effectiveJdText);
    const analysisReportId = buildAnalysisReportId(canonicalOriginalId, effectiveJdText);

    let optimizedResumeId: string | number | null = null;
    const resolved = await resolveAnalysisBinding(canonicalOriginalId, effectiveJdText);
    if (resolved?.optimizedResumeId) {
      const mappedRow = await DatabaseService.getResume(resolved.optimizedResumeId);
      const mappedData = mappedRow.success ? (mappedRow.data?.resume_data || {}) : null;
      if (mappedRow.success && mappedRow.data && isValidOptimizedMatch(mappedData, normalizeResumeId(canonicalOriginalId), jdKey)) {
        optimizedResumeId = mappedRow.data.id;
      }
    }

    if (!optimizedResumeId) {
      optimizedResumeId = await ensureSingleOptimizedResume(user.id, canonicalOriginalId, baseResumeData, jdKey);
    }

    const nextBinding = {
      analysisReportId,
      optimizedResumeId,
      jdKey,
      jdText: effectiveJdText,
      updatedAt: new Date().toISOString(),
    };

    const optimizedRow = await DatabaseService.getResume(optimizedResumeId);
    if (!optimizedRow.success || !optimizedRow.data?.resume_data) {
      throw new Error('未找到已分析简历，无法建立分析绑定');
    }
    const optimizedData = optimizedRow.data.resume_data || {};
    const needsPatch =
      String(optimizedData.analysisReportId || '') !== String(nextBinding.analysisReportId) ||
      String(optimizedData.optimizationJdKey || '') !== String(jdKey) ||
      String(optimizedData.lastJdText || '') !== String(effectiveJdText || '') ||
      String(optimizedData.targetCompany || '') !== String(targetCompany || optimizedData.targetCompany || '');

    if (needsPatch) {
      await DatabaseService.updateResume(String(optimizedResumeId), {
        resume_data: {
          ...optimizedData,
          optimizationStatus: 'optimized',
          optimizedFromId: normalizeResumeId(canonicalOriginalId),
          optimizationJdKey: jdKey,
          analysisReportId: nextBinding.analysisReportId,
          optimizedResumeId,
          lastJdText: effectiveJdText || optimizedData.lastJdText || '',
          targetCompany: targetCompany || optimizedData.targetCompany || '',
        },
      });
    }

    setOptimizedResumeId(optimizedResumeId);
    optimizedResumeIdRef.current = optimizedResumeId;
    return nextBinding;
  };

  const resetOptimizedCreationState = () => {
    optimizedResumeIdRef.current = null;
    creatingOptimizedResumeRef.current = null;
    creatingOptimizedForKeyRef.current = null;
  };

  return {
    optimizedResumeIdRef,
    resolveOriginalResumeIdForOptimization,
    ensureSingleOptimizedResume,
    resolveAnalysisBinding,
    ensureAnalysisBinding,
    resetOptimizedCreationState,
  };
};
