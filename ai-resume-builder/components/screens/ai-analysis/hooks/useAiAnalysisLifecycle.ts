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
  navigate: (to: string, options?: { replace?: boolean }) => void;
  locationPathname: string;
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
  navigate,
  locationPathname,
}: Params) => {
  useEffect(() => {
    if (currentStep !== 'chat') return;
    if (chatEntrySource === 'internal') return;

    const entrySource = localStorage.getItem('ai_analysis_entry_source');
    if (entrySource !== 'bottom_nav') return;

    localStorage.removeItem('ai_analysis_entry_source');
    if (localStorage.getItem('ai_interview_open') === '1') return;

    const nextStep = score > 0 || suggestionsLength > 0 ? 'report' : 'resume_select';
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
  ]);

  useEffect(() => {
    localStorage.setItem('ai_analysis_step', currentStep);
    if (currentStep !== 'resume_select') {
      localStorage.setItem('ai_analysis_has_activity', '1');
    }

    try {
      const base = '/ai-analysis';
      const resumeIdHint =
        (localStorage.getItem('ai_analysis_resume_id') || '').trim() ||
        (selectedResumeId !== null && selectedResumeId !== undefined ? String(selectedResumeId) : '').trim() ||
        (resumeData && resumeData.id ? String(resumeData.id) : '').trim();

      const targetPath = (() => {
        switch (currentStep) {
          case 'resume_select': return base;
          case 'jd_input': return `${base}/jd`;
          case 'analyzing': return `${base}/analyzing`;
          case 'chat': return `${base}/chat`;
          case 'comparison': return resumeIdHint ? `${base}/comparison/${encodeURIComponent(resumeIdHint)}` : `${base}/comparison`;
          case 'report': return resumeIdHint ? `${base}/report/${encodeURIComponent(resumeIdHint)}` : `${base}/report`;
          default: return base;
        }
      })();

      if (locationPathname !== targetPath) {
        navigate(targetPath, { replace: true });
      }
    } catch {
      // ignore URL sync errors
    }
  }, [currentStep, selectedResumeId, resumeData, navigate, locationPathname]);
};

