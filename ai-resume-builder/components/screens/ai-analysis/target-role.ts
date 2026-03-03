import { normalizeAnalysisMode, type AnalysisMode } from './analysis-mode';

const normalizeText = (value: any): string => String(value || '').trim();

export const resolveAnalysisTargetValue = ({
  isInterviewMode,
  analysisMode,
  stateTargetCompany,
  resumeTargetCompany,
  resumeTargetRole,
  resumeHasTargetRole,
}: {
  isInterviewMode?: boolean;
  analysisMode?: AnalysisMode;
  stateTargetCompany?: string;
  resumeTargetCompany?: string;
  resumeTargetRole?: string;
  resumeHasTargetRole?: boolean;
}): string => {
  if (isInterviewMode) {
    return normalizeText(stateTargetCompany || resumeTargetCompany || '');
  }
  const mode = normalizeAnalysisMode(analysisMode);
  if (mode === 'generic' || mode === 'targeted') {
    const normalizedState = normalizeText(stateTargetCompany);
    if (normalizedState) return normalizedState;
    if (resumeHasTargetRole) {
      return normalizeText(resumeTargetRole || '');
    }
    return normalizeText(resumeTargetRole || '');
  }
  return normalizeText(stateTargetCompany || resumeTargetRole || '');
};

export const resolveStep3TargetInputValue = ({
  isInterviewMode,
  analysisMode,
  stateTargetCompany,
  resumeTargetCompany,
  resumeTargetRole,
  resumeHasTargetRole,
}: {
  isInterviewMode?: boolean;
  analysisMode: AnalysisMode;
  stateTargetCompany: string;
  resumeTargetCompany?: string;
  resumeTargetRole?: string;
  resumeHasTargetRole?: boolean;
}): string => {
  return resolveAnalysisTargetValue({
    isInterviewMode,
    analysisMode,
    stateTargetCompany,
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
