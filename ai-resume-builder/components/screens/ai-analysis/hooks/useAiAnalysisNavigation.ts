import { useEffect, useRef, useState } from 'react';

type Step =
  | 'resume_select'
  | 'jd_input'
  | 'analyzing'
  | 'report'
  | 'micro_intro'
  | 'chat'
  | 'comparison'
  | 'final_report';

type Params = {
  currentStep: Step;
  setCurrentStep: (step: Step) => void;
  restoreInterviewSession: () => void;
  setIsInterviewEntry: (v: boolean) => void;
  goBack?: () => void;
};

export const useAiAnalysisNavigation = ({
  currentStep,
  setCurrentStep,
  restoreInterviewSession,
  setIsInterviewEntry,
  goBack,
}: Params) => {
  const [stepHistory, setStepHistory] = useState<Step[]>([]);
  const currentStepRef = useRef<Step>(currentStep);
  const [chatEntrySource, setChatEntrySource] = useState<'internal' | 'preview' | null>(() => {
    const stored = localStorage.getItem('ai_chat_entry_source');
    return stored === 'internal' || stored === 'preview' ? stored : null;
  });
  const [lastChatStep, setLastChatStep] = useState<Step | null>(() => {
    const stored = localStorage.getItem('ai_chat_prev_step');
    const validSteps: Step[] = ['resume_select', 'jd_input', 'analyzing', 'report', 'micro_intro', 'comparison', 'final_report'];
    return stored && validSteps.includes(stored as Step) ? (stored as Step) : null;
  });

  useEffect(() => {
    currentStepRef.current = currentStep;
  }, [currentStep]);

  const navigateToStep = (nextStep: Step, replace: boolean = false) => {
    const nowStep = currentStepRef.current;
    if (nextStep !== nowStep) {
      if (!replace) {
        setStepHistory(prev => [...prev, nowStep]);
      }
      setCurrentStep(nextStep);
      currentStepRef.current = nextStep;
    }
  };

  const openChat = (source: 'internal' | 'preview') => {
    if (source === 'internal') {
      setIsInterviewEntry(false);
      // If chat is auto-opened right after analysis, treat report as previous step
      // so back navigation returns to report instead of the transient analyzing screen.
      const prevStep = currentStep === 'analyzing'
        ? 'report'
        : (currentStep !== 'chat' ? currentStep : lastChatStep);
      if (prevStep && prevStep !== 'chat') {
        setLastChatStep(prevStep);
        localStorage.setItem('ai_chat_prev_step', prevStep);
      }
      setChatEntrySource('internal');
      localStorage.setItem('ai_chat_entry_source', 'internal');
      restoreInterviewSession();
      navigateToStep('chat');
      return;
    }

    setIsInterviewEntry(true);
    setChatEntrySource('preview');
    localStorage.setItem('ai_chat_entry_source', 'preview');
    localStorage.removeItem('ai_chat_prev_step');
    setLastChatStep(null);
    navigateToStep('chat', true);
  };

  const handleStepBack = () => {
    if (currentStep === 'chat') {
      if (chatEntrySource === 'preview') {
        if (goBack) {
          goBack();
        }
        return;
      }
      if (stepHistory.length === 0 && lastChatStep && lastChatStep !== 'chat') {
        setCurrentStep(lastChatStep);
        return;
      }
    }
    if (stepHistory.length > 0) {
      const prev = [...stepHistory];
      const lastStep = prev.pop()!;
      setStepHistory(prev);
      setCurrentStep(lastStep);
    } else if (currentStep === 'final_report') {
      setCurrentStep('comparison');
    } else if (currentStep === 'micro_intro') {
      setCurrentStep('report');
    } else if (currentStep === 'report') {
      if (goBack) {
        goBack();
        return;
      }
      setCurrentStep('resume_select');
    } else if (goBack) {
      goBack();
    }
  };

  return {
    stepHistory,
    setStepHistory,
    chatEntrySource,
    setChatEntrySource,
    lastChatStep,
    setLastChatStep,
    navigateToStep,
    openChat,
    handleStepBack,
  };
};
