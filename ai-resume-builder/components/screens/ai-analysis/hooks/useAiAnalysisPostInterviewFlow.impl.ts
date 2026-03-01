import { useMemo } from 'react';
import type { ResumeData } from '../../../../types';
import type React from 'react';
import { useFinalDiagnosisReportGenerator } from './useFinalDiagnosisReportGenerator';
import { usePostInterviewFeedback } from './usePostInterviewFeedback';
import { usePostInterviewFinalize } from './usePostInterviewFinalize';
import { usePostInterviewReportData } from './usePostInterviewReportData';
import { fillGeneratedResumeTimeline, repairGeneratedContacts } from './postInterviewResumeRepair';
import { usePostInterviewFinalReportPersistence } from './usePostInterviewFinalReportPersistence';
import type { QuotaKind } from './useUsageQuota';

type Params = {
  currentStep: string;
  originalResumeData: ResumeData | null;
  resumeData: ResumeData | null;
  suggestions: any[];
  postInterviewSummary: string;
  reportSummary?: string;
  score: number;
  weaknesses: string[];
  jdText: string;
  makeJdKey: (v: string) => string;
  userProfile: any;
  getRagEnabledFlag: () => boolean;
  getBackendAuthToken: () => Promise<string>;
  buildApiUrl: (path: string) => string;
  chatMessagesRef: React.MutableRefObject<any[]>;
  currentUserId?: string;
  showToast: (msg: string, type?: 'info' | 'success' | 'error', ms?: number) => void;
  consumeUsageQuota?: (kind: QuotaKind, context?: { scenario?: string; mode?: string }) => Promise<boolean>;
  refundUsageQuota?: (kind: QuotaKind, note?: string) => Promise<boolean>;
  sourceResumeIdRef: React.MutableRefObject<string | number | null>;
  targetCompany: string;
  allResumes: any[];
  isSameResumeId: (a: any, b: any) => boolean;
  setResumeData: (v: any) => void;
  setSelectedResumeId: (v: string | number | null) => void;
  setAnalysisResumeId: (v: string | number | null) => void;
  setOptimizedResumeId: (v: string | number | null) => void;
};

export const useAiAnalysisPostInterviewFlow = ({
  currentStep,
  originalResumeData,
  resumeData,
  suggestions,
  postInterviewSummary,
  reportSummary,
  score,
  weaknesses,
  jdText,
  makeJdKey,
  userProfile,
  getRagEnabledFlag,
  getBackendAuthToken,
  buildApiUrl,
  chatMessagesRef,
  currentUserId,
  showToast,
  consumeUsageQuota,
  refundUsageQuota,
  sourceResumeIdRef,
  targetCompany,
  allResumes,
  isSameResumeId,
  setResumeData,
  setSelectedResumeId,
  setAnalysisResumeId,
  setOptimizedResumeId,
}: Params) => {
  const baseData = usePostInterviewReportData({
    originalResumeData,
    resumeData: resumeData as ResumeData,
    suggestions,
    postInterviewSummary,
    reportSummary,
    baseScore: score,
    weaknesses,
  });

  const {
    postInterviewGeneratedResume: baseGeneratedResume,
    effectivePostInterviewSummary: baseSummary,
    finalReportSummary: baseFinalSummary,
    finalReportScore: baseFinalScore,
    finalReportAdvice: baseFinalAdvice,
  } = baseData;

  const { override: finalReportOverride, isGenerating: isFinalReportGenerating } = useFinalDiagnosisReportGenerator({
    currentUserId,
    currentStep,
    resumeData,
    postInterviewGeneratedResume: baseGeneratedResume,
    jdText,
    effectivePostInterviewSummary: baseSummary,
    finalReportSummary: baseFinalSummary,
    finalReportScore: baseFinalScore,
    finalReportAdvice: baseFinalAdvice,
    makeJdKey,
    userProfile,
    getRagEnabledFlag,
    getBackendAuthToken,
    buildApiUrl,
    chatMessagesRef: chatMessagesRef as any,
    consumeUsageQuota,
    refundUsageQuota,
  });

  const resolvedFinalReport = finalReportOverride
    ? {
      score: finalReportOverride.score,
      summary: finalReportOverride.summary,
      advice: finalReportOverride.advice,
      weaknesses: finalReportOverride.weaknesses,
      suggestions: finalReportOverride.suggestions,
      generatedResume: finalReportOverride.generatedResume || null,
    }
    : null;

  const comparisonData = usePostInterviewReportData({
    originalResumeData,
    resumeData: resumeData as ResumeData,
    suggestions: (resolvedFinalReport?.suggestions || []) as any,
    postInterviewSummary: '',
    reportSummary: '',
    baseScore: 0,
    weaknesses: (resolvedFinalReport?.weaknesses || []) as any,
  });

  const {
    postInterviewOriginalResume,
    postInterviewGeneratedResume: baseComparisonGeneratedResume,
    postInterviewAnnotations,
  } = comparisonData;
  const postInterviewGeneratedResume = useMemo(() => {
    const sourceResume = ((postInterviewOriginalResume as any) || (resumeData as any));
    const aiGenerated = resolvedFinalReport?.generatedResume;
    if (!aiGenerated || typeof aiGenerated !== 'object') {
      return baseComparisonGeneratedResume;
    }
    const normalized: any = fillGeneratedResumeTimeline({ ...aiGenerated }, sourceResume);
    const contactRepaired: any = repairGeneratedContacts(normalized, sourceResume, resumeData as any);
    contactRepaired.optimizationStatus = 'optimized';
    contactRepaired.optimizedFromId = String((sourceResume as any)?.id || '');
    delete contactRepaired.id;
    return contactRepaired;
  }, [resolvedFinalReport?.generatedResume, postInterviewOriginalResume, resumeData, baseComparisonGeneratedResume]);

  const finalReportScore = resolvedFinalReport?.score ?? 0;
  const finalReportSummary = String(resolvedFinalReport?.summary || '').trim();
  const finalReportAdvice = Array.isArray(resolvedFinalReport?.advice) ? resolvedFinalReport!.advice : [];
  const effectivePostInterviewSummary = finalReportSummary;

  const { handlePostInterviewFeedback } = usePostInterviewFeedback({
    currentUserId,
    showToast,
    effectivePostInterviewSummary: resolvedFinalReport
      ? effectivePostInterviewSummary
      : '分析报告生成中，请稍候…',
    postInterviewGeneratedResume,
    postInterviewOriginalResume,
    resumeId: resumeData?.id,
  });

  const { handleCompleteAndSavePostInterview } = usePostInterviewFinalize({
    currentUserId,
    generatedResume: postInterviewGeneratedResume as any,
    sourceResumeIdRef: sourceResumeIdRef as any,
    resumeData: resumeData as any,
    jdText,
    targetCompany,
    allResumes: allResumes as any,
    makeJdKey,
    isSameResumeId,
    setResumeData: setResumeData as any,
    setSelectedResumeId,
    setAnalysisResumeId,
    setOptimizedResumeId,
    showToast,
    finalReportSnapshot: resolvedFinalReport
      ? {
        score: resolvedFinalReport.score,
        summary: resolvedFinalReport.summary,
        advice: resolvedFinalReport.advice,
        weaknesses: resolvedFinalReport.weaknesses,
        suggestions: resolvedFinalReport.suggestions,
        generatedResume: resolvedFinalReport.generatedResume || null,
      }
      : null,
    finalAnalysisReady: !!resolvedFinalReport && !isFinalReportGenerating,
  });

  usePostInterviewFinalReportPersistence({
    currentStep,
    jdText,
    makeJdKey,
    resumeData,
    setResumeData,
    targetCompany,
    resolvedFinalReport,
    isFinalReportGenerating,
  });

  return {
    postInterviewOriginalResume,
    postInterviewGeneratedResume,
    postInterviewAnnotations,
    effectivePostInterviewSummary: resolvedFinalReport
      ? effectivePostInterviewSummary
      : '',
    finalReportScore: resolvedFinalReport ? finalReportScore : 0,
    finalReportSummary: resolvedFinalReport ? finalReportSummary : '报告生成中，请稍候…',
    finalReportAdvice: resolvedFinalReport ? finalReportAdvice : [],
    finalReportOverride: resolvedFinalReport,
    isFinalReportGenerating,
    handlePostInterviewFeedback,
    handleCompleteAndSavePostInterview,
  };
};
