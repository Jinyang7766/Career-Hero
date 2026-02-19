import { useEffect, useMemo, useRef } from 'react';
import type { ResumeData } from '../../../../types';
import type React from 'react';
import { DatabaseService } from '../../../../src/database-service';
import { useFinalDiagnosisReportGenerator } from './useFinalDiagnosisReportGenerator';
import { usePostInterviewFeedback } from './usePostInterviewFeedback';
import { usePostInterviewFinalize } from './usePostInterviewFinalize';
import { usePostInterviewReportData } from './usePostInterviewReportData';
import { persistUserDossierToProfile } from '../dossier-persistence';

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
  sourceResumeIdRef: React.MutableRefObject<string | number | null>;
  targetCompany: string;
  allResumes: any[];
  isSameResumeId: (a: any, b: any) => boolean;
  setResumeData: (v: any) => void;
  setSelectedResumeId: (v: string | number | null) => void;
  setAnalysisResumeId: (v: string | number | null) => void;
  setOptimizedResumeId: (v: string | number | null) => void;
  navigateToStep: (...args: any[]) => any;
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
  sourceResumeIdRef,
  targetCompany,
  allResumes,
  isSameResumeId,
  setResumeData,
  setSelectedResumeId,
  setAnalysisResumeId,
  setOptimizedResumeId,
  navigateToStep,
}: Params) => {
  const persistedFinalReportKeyRef = useRef<string>('');
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
    const normalized: any = { ...aiGenerated };
    normalized.optimizationStatus = 'optimized';
    normalized.optimizedFromId = String((sourceResume as any)?.id || '');
    delete normalized.id;
    return normalized;
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
      : '最终分析报告生成中，请稍候…',
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
    navigateToStep: navigateToStep as any,
    finalReportScore: resolvedFinalReport?.score,
    finalReportSummary: resolvedFinalReport?.summary,
    finalReportAdvice: resolvedFinalReport?.advice,
    finalAnalysisReady: !!resolvedFinalReport && !isFinalReportGenerating,
  });

  useEffect(() => {
    if (!resolvedFinalReport || isFinalReportGenerating) return;
    const resumeId = String((resumeData as any)?.id || '').trim();
    if (!resumeId) return;
    const normalizedSummary = String(resolvedFinalReport.summary || '').trim();
    if (!normalizedSummary) return;

    const persistKey = [
      resumeId,
      String(resolvedFinalReport.score ?? ''),
      normalizedSummary.slice(0, 160),
      String((resumeData as any)?.lastJdText || jdText || '').trim().slice(0, 160),
    ].join('|');
    if (persistedFinalReportKeyRef.current === persistKey) return;
    persistedFinalReportKeyRef.current = persistKey;

    let cancelled = false;
    const run = async () => {
      try {
        const latest = await DatabaseService.getResume(resumeId);
        if (!latest.success || !latest.data) return;
        const baseResumeData = (latest.data.resume_data || {}) as any;
        const now = new Date().toISOString();
        const effectiveJdText = String(jdText || baseResumeData.lastJdText || '').trim();
        const effectiveTargetCompany = String(targetCompany || baseResumeData.targetCompany || '').trim();
        const weaknesses = Array.isArray(resolvedFinalReport.weaknesses)
          ? resolvedFinalReport.weaknesses.map((x: any) => String(x || '').trim()).filter(Boolean).slice(0, 10)
          : [];
        const suggestionsList = Array.isArray(resolvedFinalReport.suggestions)
          ? resolvedFinalReport.suggestions
          : [];
        const nextDossier = {
          id: `dossier_final_diagnosis_${Date.now()}`,
          createdAt: now,
          score: Number.isFinite(Number(resolvedFinalReport.score))
            ? Math.max(0, Math.min(100, Math.round(Number(resolvedFinalReport.score))))
            : 0,
          summary: normalizedSummary,
          targetCompany: effectiveTargetCompany,
          jdText: effectiveJdText,
          scoreBreakdown: baseResumeData?.analysisDossierLatest?.scoreBreakdown || {
            experience: 0,
            skills: 0,
            format: 0,
          },
          suggestionsOverview: {
            total: suggestionsList.length,
            actionable: suggestionsList.length,
          },
          strengths: Array.isArray(baseResumeData?.analysisDossierLatest?.strengths)
            ? baseResumeData.analysisDossierLatest.strengths
            : [],
          weaknesses,
          missingKeywords: Array.isArray(baseResumeData?.analysisDossierLatest?.missingKeywords)
            ? baseResumeData.analysisDossierLatest.missingKeywords
            : [],
        };
        const prevHistory = Array.isArray(baseResumeData?.analysisDossierHistory)
          ? baseResumeData.analysisDossierHistory
          : [];
        const updatedResumeData = {
          ...baseResumeData,
          analysisDossierLatest: nextDossier,
          analysisDossierHistory: [nextDossier, ...prevHistory].slice(0, 20),
          postInterviewFinalReport: {
            score: nextDossier.score,
            summary: normalizedSummary,
            advice: Array.isArray(resolvedFinalReport.advice) ? resolvedFinalReport.advice : weaknesses,
            weaknesses,
            suggestions: suggestionsList,
            generatedResume: resolvedFinalReport.generatedResume || null,
            updatedAt: now,
            jdText: effectiveJdText,
            targetCompany: effectiveTargetCompany,
          },
          lastJdText: effectiveJdText || baseResumeData.lastJdText || '',
          targetCompany: effectiveTargetCompany || baseResumeData.targetCompany || '',
        };
        const write = await DatabaseService.updateResume(
          resumeId,
          { resume_data: updatedResumeData },
          { touchUpdatedAt: true }
        );
        if (!write.success) {
          persistedFinalReportKeyRef.current = '';
          return;
        }
        if (!cancelled) {
          setResumeData({
            id: latest.data.id,
            ...updatedResumeData,
            resumeTitle: latest.data.title,
          });
        }
        await persistUserDossierToProfile({
          source: 'final_diagnosis',
          score: nextDossier.score,
          summary: nextDossier.summary,
          jdText: effectiveJdText,
          targetCompany: effectiveTargetCompany,
          weaknesses,
          suggestionsTotal: suggestionsList.length,
        });
      } catch {
        persistedFinalReportKeyRef.current = '';
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [
    isFinalReportGenerating,
    jdText,
    resumeData,
    resolvedFinalReport,
    setResumeData,
    targetCompany,
  ]);

  return {
    postInterviewOriginalResume,
    postInterviewGeneratedResume,
    postInterviewAnnotations,
    effectivePostInterviewSummary: resolvedFinalReport
      ? effectivePostInterviewSummary
      : '',
    finalReportScore: resolvedFinalReport ? finalReportScore : 0,
    finalReportSummary: resolvedFinalReport ? finalReportSummary : '最终报告生成中，请稍候…',
    finalReportAdvice: resolvedFinalReport ? finalReportAdvice : [],
    finalReportOverride: resolvedFinalReport,
    isFinalReportGenerating,
    handlePostInterviewFeedback,
    handleCompleteAndSavePostInterview,
  };
};
