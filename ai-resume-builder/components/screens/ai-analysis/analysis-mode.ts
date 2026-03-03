export type AnalysisMode = 'generic' | 'targeted';

export const DEFAULT_ANALYSIS_MODE: AnalysisMode = 'targeted';

export const normalizeAnalysisMode = (
  value: any,
  fallback: AnalysisMode = DEFAULT_ANALYSIS_MODE
): AnalysisMode => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'generic') return 'generic';
  if (normalized === 'targeted') return 'targeted';
  return fallback;
};

export const isJdRequiredForAnalysisMode = (mode: AnalysisMode): boolean =>
  mode === 'targeted';

export const getAnalysisModeLabel = (mode: AnalysisMode): string =>
  mode === 'generic' ? '通用优化' : '定向优化';

export const shouldPromptForMissingJd = ({
  isInterviewMode,
  jdText,
  analysisMode,
}: {
  isInterviewMode?: boolean;
  jdText: string;
  analysisMode: AnalysisMode;
}): boolean => {
  if (isInterviewMode) return false;
  if (!isJdRequiredForAnalysisMode(analysisMode)) return false;
  return !String(jdText || '').trim();
};
