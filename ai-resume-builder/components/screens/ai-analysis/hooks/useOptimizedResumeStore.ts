import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { DatabaseService } from '../../../../src/database-service';
import { buildResumeTitle } from '../../../../src/resume-utils';
import type { ResumeData } from '../../../../types';

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
  const creatingOptimizedForOriginalIdRef = useRef<string | null>(null);

  useEffect(() => {
    optimizedResumeIdRef.current = optimizedResumeId;
  }, [optimizedResumeId]);

  const resolveOriginalResumeIdForOptimization = () => {
    if (sourceResumeIdRef.current) {
      return sourceResumeIdRef.current;
    }
    if (selectedResumeId) {
      return selectedResumeId;
    }
    if (!resumeData?.id) return null;
    if (resumeData.optimizationStatus === 'optimized') {
      return resumeData.optimizedFromId || resumeData.id;
    }
    return resumeData.id;
  };

  const findExistingOptimizedResumeId = async (userId: string, originalResumeId: string | number) => {
    const normalizedOriginalId = normalizeResumeId(originalResumeId);
    const list = await DatabaseService.getUserResumes(userId);
    if (!list.success || !Array.isArray(list.data)) return null;
    const hit = list.data.find((r: any) => {
      const data = r?.resume_data || {};
      const isOptimized = data?.optimizationStatus === 'optimized';
      return isOptimized && isSameResumeId(data?.optimizedFromId, normalizedOriginalId);
    });
    return hit?.id ? hit.id : null;
  };

  const ensureSingleOptimizedResume = async (
    userId: string,
    originalResumeId: string | number,
    baseResumeData: ResumeData
  ): Promise<string | number> => {
    const normalizedOriginalId = normalizeResumeId(originalResumeId);
    const current = optimizedResumeIdRef.current;
    if (current) {
      const currentRow = await DatabaseService.getResume(current);
      const currentData = currentRow.success ? currentRow.data?.resume_data : null;
      const isValidCurrent =
        !!currentRow.success &&
        !!currentRow.data &&
        currentData?.optimizationStatus === 'optimized' &&
        isSameResumeId(currentData?.optimizedFromId, normalizedOriginalId);
      if (isValidCurrent) {
        return currentRow.data.id;
      }
      setOptimizedResumeId(null);
      optimizedResumeIdRef.current = null;
    }

    const existingId = await findExistingOptimizedResumeId(userId, normalizedOriginalId);
    if (existingId) {
      setOptimizedResumeId(existingId);
      optimizedResumeIdRef.current = existingId;
      return existingId;
    }

    if (
      creatingOptimizedResumeRef.current &&
      creatingOptimizedForOriginalIdRef.current === normalizedOriginalId
    ) {
      const pendingId = await creatingOptimizedResumeRef.current;
      if (!pendingId) {
        throw new Error('创建优化简历失败');
      }
      return pendingId;
    }

    creatingOptimizedForOriginalIdRef.current = normalizedOriginalId;
    creatingOptimizedResumeRef.current = (async () => {
      const baseTitle = allResumes?.find(r => isSameResumeId(r.id, baseResumeData.id))?.title || '简历';
      const newTitle = buildResumeTitle(baseTitle, baseResumeData, jdText, true, targetCompany);
      const createResult = await DatabaseService.createResume(userId, newTitle, {
        ...baseResumeData,
        optimizationStatus: 'optimized' as const,
        optimizedFromId: normalizedOriginalId,
        lastJdText: jdText || baseResumeData.lastJdText || '',
        targetCompany: targetCompany || baseResumeData.targetCompany || ''
      });
      if (!createResult.success || !createResult.data?.id) {
        console.error('ensureSingleOptimizedResume create failed:', createResult.error);
        const fallbackId = await findExistingOptimizedResumeId(userId, normalizedOriginalId);
        if (fallbackId) {
          return fallbackId;
        }
        const errMsg =
          (createResult.error as any)?.message ||
          (createResult.error as any)?.details ||
          (createResult.error as any)?.code ||
          '创建优化简历失败';
        throw new Error(errMsg);
      }
      return createResult.data.id;
    })()
      .finally(() => {
        creatingOptimizedResumeRef.current = null;
        creatingOptimizedForOriginalIdRef.current = null;
      });

    const createdId = await creatingOptimizedResumeRef.current;
    if (!createdId) {
      throw new Error('创建优化简历失败');
    }
    setOptimizedResumeId(createdId);
    optimizedResumeIdRef.current = createdId;
    return createdId;
  };

  const resetOptimizedCreationState = () => {
    optimizedResumeIdRef.current = null;
    creatingOptimizedResumeRef.current = null;
    creatingOptimizedForOriginalIdRef.current = null;
  };

  return {
    optimizedResumeIdRef,
    resolveOriginalResumeIdForOptimization,
    ensureSingleOptimizedResume,
    resetOptimizedCreationState,
  };
};
