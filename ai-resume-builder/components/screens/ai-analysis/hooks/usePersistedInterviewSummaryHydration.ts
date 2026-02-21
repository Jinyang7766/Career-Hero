import React from 'react';

type Params = {
  isInterviewMode?: boolean;
  currentStep: string;
  postInterviewSummary: string;
  jdText: string;
  resumeLastJdText?: string;
  getAnalysisSession: (jdText: string) => any;
  setPostInterviewSummary: (value: string) => void;
};

export const usePersistedInterviewSummaryHydration = ({
  isInterviewMode,
  currentStep,
  postInterviewSummary,
  jdText,
  resumeLastJdText,
  getAnalysisSession,
  setPostInterviewSummary,
}: Params) => {
  React.useEffect(() => {
    if (!isInterviewMode) return;
    if (currentStep !== 'interview_report') return;
    if (String(postInterviewSummary || '').trim()) return;
    const effectiveJdText = String(jdText || resumeLastJdText || '').trim();
    const session = getAnalysisSession(effectiveJdText);
    const persistedSummary = String((session as any)?.interviewSummary || '').trim();
    if (!persistedSummary) return;
    setPostInterviewSummary(persistedSummary);
  }, [
    currentStep,
    getAnalysisSession,
    isInterviewMode,
    jdText,
    postInterviewSummary,
    resumeLastJdText,
    setPostInterviewSummary,
  ]);
};

