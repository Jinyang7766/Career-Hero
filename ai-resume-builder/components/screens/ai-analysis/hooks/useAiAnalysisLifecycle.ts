import { useEffect } from 'react';

type Params = {
  currentStep: string;
  chatEntrySource: 'internal' | 'preview' | null;
  score: number;
  suggestionsLength: number;
  setChatEntrySource: (v: 'internal' | 'preview' | null) => void;
  setLastChatStep: (v: any) => void;
  setStepHistory: (v: any[]) => void;
  setCurrentStep: (v: any) => void;
  selectedResumeId: string | number | null;
  resumeData: any;
  isInterviewMode?: boolean;
};

export const useAiAnalysisLifecycle = ({
  currentStep,
  chatEntrySource,
  score,
  suggestionsLength,
  setChatEntrySource,
  setLastChatStep,
  setStepHistory,
  setCurrentStep,
  selectedResumeId,
  resumeData,
  isInterviewMode,
}: Params) => {
  const resolveFallbackStep = () => {
    const analysisSessionByJd = (resumeData as any)?.analysisSessionByJd || {};
    const states = Object.values(analysisSessionByJd)
      .filter((item: any) => {
        const chatMode = String(item?.chatMode || '').trim().toLowerCase();
        // Diagnosis lifecycle should only react to non-interview sessions.
        if (chatMode === 'interview') return false;
        return true;
      })
      .map((item: any) => String(item?.state || '').toLowerCase())
      .filter(Boolean);
    if (states.includes('interview_done')) return 'final_report';
    if (states.includes('interview_in_progress') || states.includes('paused')) return 'final_report';
    if (score > 0 || suggestionsLength > 0) return 'final_report';
    return 'jd_input';
  };

  useEffect(() => {
    if (isInterviewMode) return;
    if (currentStep !== 'chat') return;
    if (chatEntrySource === 'internal') return;

    const entrySource = localStorage.getItem('ai_analysis_entry_source');
    if (entrySource !== 'bottom_nav') return;

    localStorage.removeItem('ai_analysis_entry_source');
    if (localStorage.getItem('ai_interview_open') === '1') return;

    const nextStep = resolveFallbackStep();
    setChatEntrySource('internal');
    setLastChatStep(nextStep);
    localStorage.setItem('ai_chat_entry_source', 'internal');
    localStorage.setItem('ai_chat_prev_step', nextStep);
    setStepHistory([]);
    setCurrentStep(nextStep);
  }, [
    currentStep,
    chatEntrySource,
    score,
    suggestionsLength,
    setChatEntrySource,
    setLastChatStep,
    setStepHistory,
    setCurrentStep,
    resumeData,
  ]);

  useEffect(() => {
    if (isInterviewMode) return;
    localStorage.setItem('ai_analysis_step', currentStep);
    if (currentStep !== 'jd_input') {
      localStorage.setItem('ai_analysis_has_activity', '1');
    }
  }, [currentStep, selectedResumeId, resumeData, isInterviewMode]);
};
