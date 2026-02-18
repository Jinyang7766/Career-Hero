import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import { DatabaseService } from '../../../../src/database-service';
import { buildResumeTitle } from '../../../../src/resume-utils';
import type { ResumeData } from '../../../../types';
import { persistUserDossierToProfile } from '../dossier-persistence';

type Params = {
  currentUserId?: string;
  generatedResume: ResumeData | null;
  sourceResumeIdRef: MutableRefObject<string | number | null>;
  resumeData: ResumeData;
  jdText: string;
  targetCompany: string;
  allResumes: any[] | undefined;
  makeJdKey: (text: string) => string;
  isSameResumeId: (a: any, b: any) => boolean;
  setResumeData: (v: ResumeData) => void;
  setSelectedResumeId: (v: string | number | null) => void;
  setAnalysisResumeId: (v: string | number | null) => void;
  setOptimizedResumeId: (v: string | number | null) => void;
  showToast: (msg: string, type?: 'info' | 'success' | 'error') => void;
  navigateToStep: (step: any, replace?: boolean) => void;
  finalReportScore?: number;
  finalReportSummary?: string;
  finalReportAdvice?: string[];
};

export const usePostInterviewFinalize = ({
  currentUserId,
  generatedResume,
  sourceResumeIdRef,
  resumeData,
  jdText,
  targetCompany,
  allResumes,
  makeJdKey,
  isSameResumeId,
  setResumeData,
  setSelectedResumeId,
  setAnalysisResumeId,
  setOptimizedResumeId,
  showToast,
  navigateToStep,
  finalReportScore,
  finalReportSummary,
  finalReportAdvice,
}: Params) => {
  const handleCompleteAndSavePostInterview = useCallback(async () => {
    if (!currentUserId) {
      showToast('登录已过期，请重新登录', 'error');
      return;
    }
    if (!generatedResume) {
      showToast('未生成可保存的新简历', 'error');
      return;
    }

    const sourceId = String(
      sourceResumeIdRef.current ||
      (resumeData as any)?.optimizedFromId ||
      (resumeData as any)?.id ||
      ''
    ).trim();
    const effectiveJdText = (jdText || (resumeData as any)?.lastJdText || '').trim();
    const optimizationJdKey = makeJdKey(effectiveJdText);
    const baseTitle =
      allResumes?.find((r: any) => isSameResumeId(r.id, (resumeData as any)?.id))?.title ||
      (resumeData as any)?.resumeTitle ||
      '简历';
    const newTitle = buildResumeTitle(baseTitle, resumeData as any, effectiveJdText, true, targetCompany);

    const payload: any = {
      ...(generatedResume as any),
      optimizationStatus: 'optimized',
      optimizedFromId: sourceId || undefined,
      optimizationJdKey,
      lastJdText: effectiveJdText,
      targetCompany: targetCompany || (resumeData as any)?.targetCompany || '',
    };
    delete payload.id;

    const saveResult = await DatabaseService.createResume(currentUserId, newTitle, payload);
    if (!saveResult.success || !saveResult.data) {
      showToast('保存优化简历失败，请重试', 'error');
      return;
    }

    const savedRow = saveResult.data as any;
    const savedResumeData: any = {
      id: savedRow.id,
      ...(savedRow.resume_data || {}),
      resumeTitle: savedRow.title,
    };
    sourceResumeIdRef.current = savedResumeData.optimizedFromId || sourceId || savedRow.id;
    setResumeData(savedResumeData);
    setSelectedResumeId(savedRow.id);
    setAnalysisResumeId(savedRow.id);
    setOptimizedResumeId(savedRow.id);
    try {
      await persistUserDossierToProfile({
        source: 'final_diagnosis',
        score: Number(finalReportScore || 0),
        summary: String(finalReportSummary || '').trim() || '最终诊断已完成',
        jdText: effectiveJdText,
        targetCompany: targetCompany || (resumeData as any)?.targetCompany || '',
        weaknesses: Array.isArray(finalReportAdvice) ? finalReportAdvice : [],
      });
    } catch (dossierErr) {
      console.warn('Failed to persist final diagnosis dossier to user profile:', dossierErr);
    }

    showToast('优化简历已保存', 'success');
    navigateToStep('final_report', true);
  }, [
    currentUserId,
    generatedResume,
    sourceResumeIdRef,
    resumeData,
    jdText,
    makeJdKey,
    allResumes,
    isSameResumeId,
    targetCompany,
    setResumeData,
    setSelectedResumeId,
    setAnalysisResumeId,
    setOptimizedResumeId,
    showToast,
    navigateToStep,
    finalReportScore,
    finalReportSummary,
    finalReportAdvice,
  ]);

  return { handleCompleteAndSavePostInterview };
};
