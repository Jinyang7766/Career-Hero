import type { GuidedFlowAnalysisMode } from './types';

type ModeSource = 'resume' | 'guided_state' | 'none';

export type AnalysisModeSyncDecision = {
  effectiveMode?: GuidedFlowAnalysisMode;
  source: ModeSource;
  shouldCorrectGuidedState: boolean;
};

const normalizeMode = (value: any): GuidedFlowAnalysisMode | undefined => {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'generic' || raw === 'targeted') return raw;
  return undefined;
};

export const resolveAnalysisModeSync = ({
  resumeMode,
  guidedStateMode,
}: {
  resumeMode: any;
  guidedStateMode: any;
}): AnalysisModeSyncDecision => {
  const normalizedResumeMode = normalizeMode(resumeMode);
  const normalizedGuidedMode = normalizeMode(guidedStateMode);

  if (normalizedResumeMode) {
    return {
      effectiveMode: normalizedResumeMode,
      source: 'resume',
      shouldCorrectGuidedState:
        Boolean(normalizedGuidedMode) && normalizedGuidedMode !== normalizedResumeMode,
    };
  }

  if (normalizedGuidedMode) {
    return {
      effectiveMode: normalizedGuidedMode,
      source: 'guided_state',
      shouldCorrectGuidedState: false,
    };
  }

  return {
    source: 'none',
    shouldCorrectGuidedState: false,
  };
};
