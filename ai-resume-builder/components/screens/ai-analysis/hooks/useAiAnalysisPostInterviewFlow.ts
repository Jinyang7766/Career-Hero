import { useMemo } from 'react';
import type { MutableRefObject } from 'react';
import type { ResumeData } from '../../../../types';
import { usePostInterviewFeedback } from './usePostInterviewFeedback';
import { usePostInterviewFinalize } from './usePostInterviewFinalize';
import { usePostInterviewReportData } from './usePostInterviewReportData';
import { fillGeneratedResumeTimeline, repairGeneratedContacts } from './postInterviewResumeRepair';
import { sanitizeResumeSkills } from '../../../../src/resume-skill-sanitizer';
import { usePostInterviewFinalReportPersistence } from './usePostInterviewFinalReportPersistence';

type Params = {
  currentStep: string;
  originalResumeData: ResumeData | null;
  resumeData: ResumeData | null;
  suggestions: any[];
  postInterviewSummary: string;
  reportSummary?: string;
  score: number;
  weaknesses: string[];
  reportGeneratedResume?: any;
  jdText: string;
  makeJdKey: (v: string) => string;
  currentUserId?: string;
  showToast: (msg: string, type?: 'info' | 'success' | 'error', ms?: number) => void;
  sourceResumeIdRef: MutableRefObject<string | number | null>;
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
  reportGeneratedResume,
  jdText,
  makeJdKey,
  currentUserId,
  showToast,
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

  const resolvedFinalReport = useMemo(() => {
    const persisted = (resumeData as any)?.postInterviewFinalReport;
    const persistedSummary = String(persisted?.summary || '').trim();
    const persistedJdText = String(persisted?.jdText || '').trim();
    const effectiveJdText = String(jdText || (resumeData as any)?.lastJdText || '').trim();
    const jdMatched =
      !effectiveJdText ||
      makeJdKey(persistedJdText || '') === makeJdKey(effectiveJdText || '');
    if (persistedSummary && jdMatched) {
      const persistedScoreNum = Number(persisted?.score);
      const persistedWeaknesses = Array.isArray(persisted?.weaknesses)
        ? persisted.weaknesses.map((item: any) => String(item || '').trim()).filter(Boolean)
        : [];
      const persistedAdvice = Array.isArray(persisted?.advice)
        ? persisted.advice.map((item: any) => String(item || '').trim()).filter(Boolean)
        : persistedWeaknesses;
      return {
        score: Number.isFinite(persistedScoreNum)
          ? Math.max(0, Math.min(100, Math.round(persistedScoreNum)))
          : baseFinalScore,
        summary: persistedSummary,
        advice: persistedAdvice.slice(0, 8),
        weaknesses: persistedWeaknesses.slice(0, 8),
        suggestions: Array.isArray(persisted?.suggestions) ? persisted.suggestions : (suggestions || []),
        generatedResume:
          persisted?.generatedResume && typeof persisted.generatedResume === 'object'
            ? persisted.generatedResume
            : (reportGeneratedResume && typeof reportGeneratedResume === 'object'
              ? reportGeneratedResume
              : null),
      };
    }

    const fallbackSummary = String(baseSummary || baseFinalSummary || '').trim() || '诊断完成，请查看生成简历。';
    const fallbackAdvice = (Array.isArray(baseFinalAdvice) ? baseFinalAdvice : [])
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .slice(0, 8);
    const fallbackWeaknesses = (Array.isArray(weaknesses) ? weaknesses : [])
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .slice(0, 8);

    return {
      score: Math.max(0, Math.min(100, Math.round(Number(baseFinalScore || 0)))),
      summary: fallbackSummary,
      advice: fallbackAdvice.length > 0 ? fallbackAdvice : fallbackWeaknesses,
      weaknesses: fallbackWeaknesses,
      suggestions: Array.isArray(suggestions) ? suggestions : [],
      generatedResume:
        reportGeneratedResume && typeof reportGeneratedResume === 'object'
          ? reportGeneratedResume
          : null,
    };
  }, [
    baseFinalAdvice,
    baseFinalScore,
    baseFinalSummary,
    baseSummary,
    jdText,
    makeJdKey,
    reportGeneratedResume,
    resumeData,
    suggestions,
    weaknesses,
  ]);

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
      return sanitizeResumeSkills((baseComparisonGeneratedResume || baseGeneratedResume) as any);
    }
    const normalizedSeed = sanitizeResumeSkills({ ...aiGenerated } as any);
    const normalized: any = fillGeneratedResumeTimeline(normalizedSeed, sourceResume);
    const contactRepaired: any = repairGeneratedContacts(normalized, sourceResume, resumeData as any);
    contactRepaired.optimizationStatus = 'optimized';
    contactRepaired.optimizedFromId = String((sourceResume as any)?.id || '');
    delete contactRepaired.id;
    return sanitizeResumeSkills(contactRepaired);
  }, [
    baseComparisonGeneratedResume,
    baseGeneratedResume,
    postInterviewOriginalResume,
    resumeData,
    resolvedFinalReport?.generatedResume,
  ]);

  const finalReportScore = Math.max(
    0,
    Math.min(100, Math.round(Number(resolvedFinalReport?.score || 0)))
  );
  const finalReportSummary = String(resolvedFinalReport?.summary || '').trim();
  const finalReportAdvice = Array.isArray(resolvedFinalReport?.advice)
    ? resolvedFinalReport.advice
    : [];
  const effectivePostInterviewSummary = finalReportSummary;
  const isFinalReportGenerating = false;

  const { handlePostInterviewFeedback } = usePostInterviewFeedback({
    currentUserId,
    showToast,
    effectivePostInterviewSummary,
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
    finalReportSnapshot: {
      score: finalReportScore,
      summary: finalReportSummary,
      advice: finalReportAdvice,
      weaknesses: Array.isArray(resolvedFinalReport?.weaknesses) ? resolvedFinalReport.weaknesses : [],
      suggestions: Array.isArray(resolvedFinalReport?.suggestions) ? resolvedFinalReport.suggestions : [],
      generatedResume: resolvedFinalReport?.generatedResume || null,
    },
    finalAnalysisReady: true,
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
    effectivePostInterviewSummary,
    finalReportScore,
    finalReportSummary,
    finalReportAdvice,
    finalReportOverride: resolvedFinalReport,
    isFinalReportGenerating,
    handlePostInterviewFeedback,
    handleCompleteAndSavePostInterview,
  };
};
