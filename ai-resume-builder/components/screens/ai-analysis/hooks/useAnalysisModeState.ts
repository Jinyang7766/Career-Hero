import React from 'react';
import type { ResumeData } from '../../../../types';
import {
  DEFAULT_ANALYSIS_MODE,
  normalizeAnalysisMode,
  type AnalysisMode,
} from '../analysis-mode';

type Params = {
  resumeData: ResumeData | null | undefined;
  setResumeData?: (value: ResumeData | ((prev: ResumeData) => ResumeData)) => void;
  isInterviewMode?: boolean;
};

const readModeFromResume = (resumeData: ResumeData | null | undefined): AnalysisMode =>
  normalizeAnalysisMode((resumeData as any)?.analysisMode, DEFAULT_ANALYSIS_MODE);

export const useAnalysisModeState = ({
  resumeData,
  setResumeData,
  isInterviewMode,
}: Params) => {
  const [analysisMode, setAnalysisModeState] = React.useState<AnalysisMode>(() =>
    readModeFromResume(resumeData)
  );
  const syncSignatureRef = React.useRef('');

  React.useEffect(() => {
    if (isInterviewMode) return;
    const resumeId = String((resumeData as any)?.id || '').trim();
    const incomingMode = readModeFromResume(resumeData);
    const signature = `${resumeId}|${incomingMode}`;
    if (syncSignatureRef.current === signature) return;
    syncSignatureRef.current = signature;
    setAnalysisModeState(incomingMode);
  }, [isInterviewMode, resumeData]);

  const setAnalysisMode = React.useCallback(
    (nextMode: AnalysisMode) => {
      if (isInterviewMode) return;
      const normalized = normalizeAnalysisMode(nextMode, DEFAULT_ANALYSIS_MODE);
      setAnalysisModeState((prev) => (prev === normalized ? prev : normalized));
      if (!setResumeData) return;

      setResumeData((prev) => {
        if (!prev || typeof prev !== 'object') return prev;
        const current = normalizeAnalysisMode((prev as any)?.analysisMode, DEFAULT_ANALYSIS_MODE);
        if (current === normalized) return prev;
        return {
          ...prev,
          analysisMode: normalized,
        };
      });
    },
    [isInterviewMode, setResumeData]
  );

  return {
    analysisMode,
    setAnalysisMode,
    isGenericMode: analysisMode === 'generic',
    isTargetedMode: analysisMode === 'targeted',
  };
};
