import { useEffect, useMemo, useRef } from 'react';
import type { ResumeData } from '../../../../types';
import type React from 'react';
import { DatabaseService } from '../../../../src/database-service';
import { useFinalDiagnosisReportGenerator } from './useFinalDiagnosisReportGenerator';
import { usePostInterviewFeedback } from './usePostInterviewFeedback';
import { usePostInterviewFinalize } from './usePostInterviewFinalize';
import { usePostInterviewReportData } from './usePostInterviewReportData';
import { persistUserDossierToProfile } from '../dossier-persistence';
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
  consumeUsageQuota?: (kind: QuotaKind) => Promise<boolean>;
  refundUsageQuota?: (kind: QuotaKind, note?: string) => Promise<boolean>;
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

const normalizeText = (value: any) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[，,。.;；:：\-—_()（）\[\]【】'"`]/g, '');

const pickFirstFilled = (...values: any[]) => {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return '';
};

const normalizeContact = (value: unknown) => String(value || '').trim();
const isLikelyEmail = (value: unknown) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeContact(value));
const isLikelyPhone = (value: unknown) => {
  const raw = normalizeContact(value);
  if (!raw) return false;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return false;
  if (!/^[+()\-.\s\d]+$/.test(raw)) return false;
  return true;
};
const isMaskedContactValue = (value: unknown) => {
  const text = normalizeContact(value);
  if (!text) return true;
  const lowered = text.toLowerCase();
  if (
    lowered.includes('[email_') ||
    lowered.includes('[phone_') ||
    lowered.includes('masked') ||
    lowered.includes('脱敏') ||
    lowered.includes('隐私')
  ) {
    return true;
  }
  if (/^\*+$/.test(text)) return true;
  if (/^x+$/i.test(text)) return true;
  if (/^(\*|x|X|-|_|\s){6,}$/.test(text)) return true;
  return false;
};

const repairGeneratedContacts = (generated: any, primarySource: any, fallbackSource: any) => {
  if (!generated || typeof generated !== 'object') return generated;
  const next: any = { ...generated };
  next.personalInfo = { ...(next.personalInfo || {}) };
  const srcPersonal = (primarySource && typeof primarySource === 'object' ? (primarySource.personalInfo || {}) : {});
  const fallbackPersonal = (fallbackSource && typeof fallbackSource === 'object' ? (fallbackSource.personalInfo || {}) : {});
  const sourceEmail = normalizeContact(srcPersonal?.email) || normalizeContact(fallbackPersonal?.email);
  const sourcePhone = normalizeContact(srcPersonal?.phone) || normalizeContact(fallbackPersonal?.phone);
  const sourceName = normalizeContact(srcPersonal?.name) || normalizeContact(fallbackPersonal?.name);
  const validSourceEmail = isLikelyEmail(sourceEmail) ? sourceEmail : '';
  const validSourcePhone = isLikelyPhone(sourcePhone) ? sourcePhone : '';
  if (sourceName) {
    next.personalInfo.name = sourceName;
  }
  // Strong consistency: keep original contacts unchanged.
  if (validSourceEmail) {
    next.personalInfo.email = validSourceEmail;
  }
  if (validSourcePhone) {
    next.personalInfo.phone = validSourcePhone;
  }
  return next;
};

const fillGeneratedResumeTimeline = (generated: any, source: any) => {
  if (!generated || typeof generated !== 'object') return generated;
  const next: any = { ...generated };
  const src = (source && typeof source === 'object') ? source : {};

  if (Array.isArray(next.workExps)) {
    const sourceList = Array.isArray(src.workExps) ? src.workExps : [];
    const used = new Set<number>();
    next.workExps = next.workExps.map((item: any, idx: number) => {
      if (!item || typeof item !== 'object') return item;
      const itemSig = normalizeText([item.company, item.title, item.position, item.subtitle].filter(Boolean).join(' '));
      let hitIndex = -1;
      if (itemSig) {
        hitIndex = sourceList.findIndex((candidate: any, cIdx: number) => {
          if (used.has(cIdx) || !candidate) return false;
          const candidateSig = normalizeText([candidate.company, candidate.title, candidate.position, candidate.subtitle].filter(Boolean).join(' '));
          return !!candidateSig && (candidateSig.includes(itemSig) || itemSig.includes(candidateSig));
        });
      }
      if (hitIndex < 0 && idx < sourceList.length && !used.has(idx)) {
        hitIndex = idx;
      }
      if (hitIndex >= 0) used.add(hitIndex);
      const srcItem: any = hitIndex >= 0 ? (sourceList[hitIndex] || {}) : {};
      return {
        ...item,
        date: pickFirstFilled(item.date, srcItem.date, srcItem.startDate && srcItem.endDate ? `${srcItem.startDate} - ${srcItem.endDate}` : ''),
        startDate: pickFirstFilled(item.startDate, srcItem.startDate),
        endDate: pickFirstFilled(item.endDate, srcItem.endDate),
      };
    });
  }

  if (Array.isArray(next.projects)) {
    const sourceList = Array.isArray(src.projects) ? src.projects : [];
    next.projects = next.projects.map((item: any, idx: number) => {
      if (!item || typeof item !== 'object') return item;
      const srcItem: any = sourceList[idx] || {};
      return {
        ...item,
        date: pickFirstFilled(item.date, srcItem.date, srcItem.startDate && srcItem.endDate ? `${srcItem.startDate} - ${srcItem.endDate}` : ''),
        startDate: pickFirstFilled(item.startDate, srcItem.startDate),
        endDate: pickFirstFilled(item.endDate, srcItem.endDate),
      };
    });
  }

  return next;
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
    if (currentStep !== 'comparison' && currentStep !== 'final_report') return;
    if (!resolvedFinalReport || isFinalReportGenerating) return;
    const resumeId = String((resumeData as any)?.id || '').trim();
    if (!resumeId) return;
    const normalizedSummary = String(resolvedFinalReport.summary || '').trim();
    if (!normalizedSummary) return;
    const existingFinal = (resumeData as any)?.postInterviewFinalReport || {};
    const existingSummary = String(existingFinal?.summary || '').trim();
    const existingScore = Number(existingFinal?.score);
    const incomingScore = Number(resolvedFinalReport.score);
    const existingJdKey = makeJdKey(String(existingFinal?.jdText || '').trim());
    const incomingJdKey = makeJdKey(String(jdText || (resumeData as any)?.lastJdText || '').trim());
    if (
      existingSummary === normalizedSummary &&
      Number.isFinite(existingScore) &&
      Number.isFinite(incomingScore) &&
      Math.round(existingScore) === Math.round(incomingScore) &&
      existingJdKey === incomingJdKey
    ) {
      return;
    }

    const persistKey = [
      resumeId,
      String(resolvedFinalReport.score ?? ''),
      normalizedSummary.slice(0, 160),
      incomingJdKey,
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
          { touchUpdatedAt: false }
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
    currentStep,
    isFinalReportGenerating,
    jdText,
    makeJdKey,
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
