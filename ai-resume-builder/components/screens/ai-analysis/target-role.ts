import { normalizeAnalysisMode, type AnalysisMode } from './analysis-mode';

const normalizeText = (value: any): string => String(value || '').trim();

export const resolveAnalysisTargetValue = ({
  isInterviewMode,
  analysisMode,
  stateTargetCompany,
  stateTargetRole,
  resumeTargetCompany,
  resumeTargetRole,
  resumeHasTargetRole,
}: {
  isInterviewMode?: boolean;
  analysisMode?: AnalysisMode;
  stateTargetCompany?: string;
  stateTargetRole?: string;
  resumeTargetCompany?: string;
  resumeTargetRole?: string;
  resumeHasTargetRole?: boolean;
}): string => {
  const normalizedState = normalizeText(stateTargetRole || stateTargetCompany);
  if (isInterviewMode) {
    return normalizeText(normalizedState || resumeTargetCompany || resumeTargetRole || '');
  }
  const mode = normalizeAnalysisMode(analysisMode);
  if (mode === 'generic' || mode === 'targeted') {
    if (normalizedState) return normalizedState;
    if (resumeHasTargetRole) {
      return normalizeText(resumeTargetRole || '');
    }
    return normalizeText(resumeTargetRole || resumeTargetCompany || '');
  }
  return normalizeText(normalizedState || resumeTargetRole || resumeTargetCompany || '');
};

export const resolveStep3TargetInputValue = ({
  isInterviewMode,
  analysisMode,
  stateTargetCompany,
  stateTargetRole,
  resumeTargetCompany,
  resumeTargetRole,
  resumeHasTargetRole,
}: {
  isInterviewMode?: boolean;
  analysisMode: AnalysisMode;
  stateTargetCompany?: string;
  stateTargetRole?: string;
  resumeTargetCompany?: string;
  resumeTargetRole?: string;
  resumeHasTargetRole?: boolean;
}): string => {
  return resolveAnalysisTargetValue({
    isInterviewMode,
    analysisMode,
    stateTargetCompany,
    stateTargetRole,
    resumeTargetCompany,
    resumeTargetRole,
    resumeHasTargetRole,
  });
};

export const shouldPersistTargetRole = ({
  isInterviewMode,
  analysisMode,
}: {
  isInterviewMode?: boolean;
  analysisMode: AnalysisMode;
}): boolean => {
  void analysisMode;
  return !isInterviewMode;
};
