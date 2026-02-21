import { makeJdKey } from './id-utils';

export const isSessionModeMatchedForQuota = (session: any, normalizedInterviewMode: string) => {
  const mode = String(session?.interviewMode || '').trim().toLowerCase();
  if (!mode) return true;
  return mode === normalizedInterviewMode;
};

export const isSessionTypeMatchedForQuota = (session: any, normalizedInterviewType: string) => {
  const sessionType = String(session?.interviewType || '').trim().toLowerCase();
  if (!sessionType) return true;
  return sessionType === normalizedInterviewType;
};

export const hasInterruptedSessionForJdKey = (
  analysisSessionByJd: Record<string, any>,
  jdKey: string,
  normalizedInterviewMode: string,
  normalizedInterviewType: string,
) => {
  const matchingStates = Object.values(analysisSessionByJd || {}).filter((session: any) => {
    if (!session) return false;
    const state = String(session?.state || '').toLowerCase();
    if (state !== 'paused' && state !== 'interview_in_progress') return false;
    const stateJdKey = String(session?.jdKey || '').trim() || makeJdKey(String(session?.jdText || '').trim() || '__no_jd__');
    if (stateJdKey !== jdKey) return false;
    if (!isSessionModeMatchedForQuota(session, normalizedInterviewMode)) return false;
    if (!isSessionTypeMatchedForQuota(session, normalizedInterviewType)) return false;
    return true;
  });
  return matchingStates.length > 0;
};

export const checkInterviewContinuationState = ({
  analysisSessionByJd,
  jdText,
  resumeData,
  isInterviewMode,
  normalizedInterviewMode,
  normalizedInterviewType,
}: {
  analysisSessionByJd: Record<string, any>;
  jdText: string;
  resumeData: any;
  isInterviewMode?: boolean;
  normalizedInterviewMode: string;
  normalizedInterviewType: string;
}) => {
  const effectiveJdText = (jdText || resumeData?.lastJdText || '').trim();
  const effectiveJdKey = makeJdKey(effectiveJdText);
  const hasInterruptedOnEffectiveJd = !!effectiveJdText && hasInterruptedSessionForJdKey(
    analysisSessionByJd,
    effectiveJdKey,
    normalizedInterviewMode,
    normalizedInterviewType
  );
  const hasAnyInterruptedInterview = Object.values(analysisSessionByJd || {}).some((session: any) => {
    if (!session) return false;
    const state = String(session?.state || '').toLowerCase();
    if (state !== 'paused' && state !== 'interview_in_progress') return false;
    if (!isSessionModeMatchedForQuota(session, normalizedInterviewMode)) return false;
    if (!isSessionTypeMatchedForQuota(session, normalizedInterviewType)) return false;
    return true;
  });
  const isContinuingInterview = Boolean(
    isInterviewMode &&
    (hasInterruptedOnEffectiveJd || hasAnyInterruptedInterview)
  );

  return {
    effectiveJdText,
    isContinuingInterview,
  };
};

export const decideMicroInterviewNeeded = ({
  isInterviewMode,
  aiAnalysisResult,
  totalScore,
  appliedSuggestions,
  weaknesses,
  missingKeywords,
  summary,
}: {
  isInterviewMode?: boolean;
  aiAnalysisResult: any;
  totalScore: number;
  appliedSuggestions: any[];
  weaknesses: string[];
  missingKeywords: string[];
  summary: string;
}) => {
  if (isInterviewMode) return true;

  const backendDecisionRaw =
    aiAnalysisResult?.microInterviewNeeded ??
    aiAnalysisResult?.needsMicroInterview ??
    aiAnalysisResult?.followUpRequired;
  if (typeof backendDecisionRaw === 'boolean') {
    return backendDecisionRaw;
  }

  const pendingSuggestions = (appliedSuggestions || []).length;
  const weaknessCount = (weaknesses || [])
    .filter((w) => String(w || '').trim() && !/需要进一步优化/.test(String(w))).length;
  const missingKeywordCount = (missingKeywords || [])
    .filter((k) => String(k || '').trim()).length;
  const summaryText = String(summary || '').toLowerCase();
  const strongSummarySignal = /(非常完善|可直接投递|匹配度高|无明显短板|无明显问题)/.test(summaryText);

  const looksComplete =
    totalScore >= 92 &&
    pendingSuggestions <= 1 &&
    weaknessCount <= 1 &&
    missingKeywordCount <= 2;

  return !(looksComplete || strongSummarySignal);
};

