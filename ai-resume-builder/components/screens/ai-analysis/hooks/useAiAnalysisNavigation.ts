import { useState } from 'react';

type Step =
  | 'resume_select'
  | 'jd_input'
  | 'analyzing'
  | 'report'
  | 'chat'
  | 'comparison';

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
  const [chatEntrySource, setChatEntrySource] = useState<'internal' | 'preview' | null>(() => {
    const stored = localStorage.getItem('ai_chat_entry_source');
    return stored === 'internal' || stored === 'preview' ? stored : null;
  });
  const [lastChatStep, setLastChatStep] = useState<Step | null>(() => {
    const stored = localStorage.getItem('ai_chat_prev_step');
    const validSteps: Step[] = ['resume_select', 'jd_input', 'analyzing', 'report', 'comparison'];
    return stored && validSteps.includes(stored as Step) ? (stored as Step) : null;
  });

  const navigateToStep = (nextStep: Step, replace: boolean = false) => {
    if (nextStep !== currentStep) {
      if (!replace) {
        setStepHistory(prev => [...prev, currentStep]);
      }
      setCurrentStep(nextStep);
    }
  };

  const openChat = (source: 'internal' | 'preview') => {
    if (source === 'internal') {
      setIsInterviewEntry(false);
      const prevStep = currentStep !== 'chat' ? currentStep : lastChatStep;
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
    } else if (currentStep === 'report') {
      // Keep back navigation inside AI flow to avoid route-sync bouncing.
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
