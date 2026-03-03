import {
  isEquivalentJdKey,
  makeNormalizedJdKey,
  normalizeStoredJdKey,
} from './id-utils';
import type { AnalysisMode } from './analysis-mode';
import { resolveAnalysisTargetValue } from './target-role';

export type ReusableAnalysisSnapshot = {
  score: number;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  missingKeywords: string[];
  suggestions: any[];
  scoreBreakdown: {
    experience: number;
    skills: number;
    format: number;
  };
  targetCompany: string;
  targetRole: string;
  jdText: string;
};

const normalizeText = (value: any): string => String(value || '').trim();

const normalizeJdKey = (jdText: any): string => makeNormalizedJdKey(normalizeText(jdText));

const isNonEmptyArray = (value: any): boolean => Array.isArray(value) && value.length > 0;

const normalizeScore = (value: any): number => {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(100, Math.round(num)));
};

const normalizeScoreBreakdown = (value: any): ReusableAnalysisSnapshot['scoreBreakdown'] => ({
  experience: Number(value?.experience || 0),
  skills: Number(value?.skills || 0),
  format: Number(value?.format || 0),
});

const hasRenderableResult = (candidate: any): boolean => {
  const summary = normalizeText(candidate?.summary);
  const score = normalizeScore(candidate?.score);
  return !!summary || score > 0;
};

const normalizeArray = (value: any): string[] =>
  Array.isArray(value) ? value.map((item) => normalizeText(item)).filter(Boolean) : [];

const deriveSessionJdKey = (session: any): string =>
  normalizeText(session?.jdKey)
    ? normalizeStoredJdKey(session?.jdKey)
    : normalizeJdKey(session?.jdText);

export const hasReadyAnalysisSessionForJd = ({
  resumeData,
  jdText,
}: {
  resumeData: any;
  jdText: string;
}): boolean => {
  const expectedJdKey = normalizeJdKey(jdText || resumeData?.lastJdText || '');
  const sessions = (resumeData as any)?.analysisSessionByJd || {};
  return Object.values(sessions || {}).some((session: any) => {
    if (!session) return false;
    if (!isEquivalentJdKey(deriveSessionJdKey(session), expectedJdKey)) return false;
    const state = normalizeText(session?.state).toLowerCase();
    const step = normalizeText(session?.step).toLowerCase();
    return (
      state === 'report_ready' ||
      state === 'interview_done' ||
      step === 'final_report' ||
      step === 'comparison' ||
      step === 'chat' ||
      step === 'interview_report'
    );
  });
};

export const extractReusableAnalysisSnapshotForJd = ({
  resumeData,
  jdText,
  targetCompany,
  analysisMode,
}: {
  resumeData: any;
  jdText: string;
  targetCompany?: string;
  analysisMode?: AnalysisMode;
}): ReusableAnalysisSnapshot | null => {
  const expectedJdText = normalizeText(jdText || resumeData?.lastJdText || '');
  const expectedJdKey = normalizeJdKey(expectedJdText);

  const snapshot = (resumeData as any)?.analysisSnapshot;
  const snapshotJdText = normalizeText(snapshot?.jdText || resumeData?.lastJdText || '');
  const snapshotJdKey = normalizeJdKey(snapshotJdText);
  if (snapshot && isEquivalentJdKey(snapshotJdKey, expectedJdKey) && hasRenderableResult(snapshot)) {
    const resolvedTarget = resolveAnalysisTargetValue({
      analysisMode: analysisMode || resumeData?.analysisMode,
      stateTargetCompany: snapshot?.targetRole || '',
      resumeTargetCompany: '',
      resumeTargetRole: resumeData?.targetRole,
      resumeHasTargetRole: Object.prototype.hasOwnProperty.call(resumeData || {}, 'targetRole'),
    });
    return {
      score: normalizeScore(snapshot?.score),
      summary: normalizeText(snapshot?.summary),
      strengths: normalizeArray(snapshot?.strengths),
      weaknesses: normalizeArray(snapshot?.weaknesses),
      missingKeywords: normalizeArray(snapshot?.missingKeywords),
      suggestions: Array.isArray(snapshot?.suggestions) ? snapshot.suggestions : [],
      scoreBreakdown: normalizeScoreBreakdown(snapshot?.scoreBreakdown),
      targetCompany: resolvedTarget,
      targetRole: String(resolvedTarget || resumeData?.targetRole || '').trim(),
      jdText: snapshotJdText || expectedJdText,
    };
  }

  const finalReport = (resumeData as any)?.postInterviewFinalReport;
  const finalReportJdText = normalizeText(finalReport?.jdText || resumeData?.lastJdText || '');
  const finalReportJdKey = normalizeJdKey(finalReportJdText);
  if (finalReport && isEquivalentJdKey(finalReportJdKey, expectedJdKey) && hasRenderableResult(finalReport)) {
    const resolvedTarget = resolveAnalysisTargetValue({
      analysisMode: analysisMode || resumeData?.analysisMode,
      stateTargetCompany: finalReport?.targetRole || '',
      resumeTargetCompany: '',
      resumeTargetRole: resumeData?.targetRole,
      resumeHasTargetRole: Object.prototype.hasOwnProperty.call(resumeData || {}, 'targetRole'),
    });
    return {
      score: normalizeScore(finalReport?.score),
      summary: normalizeText(finalReport?.summary),
      strengths: normalizeArray(finalReport?.strengths),
      weaknesses: normalizeArray(finalReport?.weaknesses),
      missingKeywords: normalizeArray(finalReport?.missingKeywords),
      suggestions: Array.isArray(finalReport?.suggestions) ? finalReport.suggestions : [],
      scoreBreakdown: normalizeScoreBreakdown(finalReport?.scoreBreakdown),
      targetCompany: resolvedTarget,
      targetRole: String(resolvedTarget || resumeData?.targetRole || '').trim(),
      jdText: finalReportJdText || expectedJdText,
    };
  }

  return null;
};

export const hasReusableAnalysisResultForJd = ({
  resumeData,
  jdText,
  targetCompany,
  analysisMode,
}: {
  resumeData: any;
  jdText: string;
  targetCompany?: string;
  analysisMode?: AnalysisMode;
}): boolean => {
  const snapshot = extractReusableAnalysisSnapshotForJd({
    resumeData,
    jdText,
    targetCompany,
    analysisMode,
  });
  if (snapshot) return true;
  return hasReadyAnalysisSessionForJd({ resumeData, jdText });
};

export const hasReusableSuggestionPayload = (snapshot: ReusableAnalysisSnapshot): boolean =>
  isNonEmptyArray(snapshot?.suggestions);
