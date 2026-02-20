import { useEffect, useRef, useState } from 'react';

type Step =
  | 'resume_select'
  | 'jd_input'
  | 'analyzing'
  | 'report'
  | 'micro_intro'
  | 'chat'
  | 'interview_report_loading'
  | 'interview_report'
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
  const replaceBackMapRef = useRef<Partial<Record<Step, Step>>>({});
  const [chatEntrySource, setChatEntrySource] = useState<'internal' | 'preview' | null>(() => {
    const stored = localStorage.getItem('ai_chat_entry_source');
    return stored === 'internal' || stored === 'preview' ? stored : null;
  });
  const [lastChatStep, setLastChatStep] = useState<Step | null>(() => {
    const stored = localStorage.getItem('ai_chat_prev_step');
    const validSteps: Step[] = ['resume_select', 'jd_input', 'analyzing', 'report', 'micro_intro', 'interview_report_loading', 'interview_report', 'comparison', 'final_report'];
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
      } else {
        replaceBackMapRef.current[nextStep] = nowStep;
      }
      setCurrentStep(nextStep);
      currentStepRef.current = nextStep;
    }
  };

  const openChat = (source: 'internal' | 'preview', options?: { skipRestore?: boolean }) => {
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
      if (!options?.skipRestore) {
        restoreInterviewSession();
      }
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
    if (currentStep === 'interview_report') {
      setCurrentStep('jd_input');
      currentStepRef.current = 'jd_input';
      return;
    }
    if (currentStep === 'chat') {
      if (chatEntrySource === 'preview' && stepHistory.length === 0) {
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
      let lastStep: Step | undefined = prev.pop();
      // Skip accidental duplicate history entries that equal current step,
      // otherwise the first back tap appears to do nothing.
      while (lastStep && lastStep === currentStep && prev.length > 0) {
        lastStep = prev.pop();
      }
      // Report page should never go back to transient analyzing screen.
      while (currentStep === 'report' && lastStep === 'analyzing' && prev.length > 0) {
        lastStep = prev.pop();
      }
      if (currentStep === 'report' && lastStep === 'analyzing') {
        lastStep = 'jd_input';
      }
      setStepHistory(prev);
      if (lastStep && lastStep !== currentStep) {
        setCurrentStep(lastStep);
        currentStepRef.current = lastStep;
      }
      return;
    }

    const replacedFrom = replaceBackMapRef.current[currentStep];
    if (replacedFrom && replacedFrom !== currentStep) {
      delete replaceBackMapRef.current[currentStep];
      setCurrentStep(replacedFrom);
      currentStepRef.current = replacedFrom;
      return;
    } else if (currentStep === 'final_report') {
      setCurrentStep('comparison');
      currentStepRef.current = 'comparison';
    } else if (currentStep === 'micro_intro') {
      setCurrentStep('report');
      currentStepRef.current = 'report';
    } else if (currentStep === 'report') {
      if (goBack) {
        goBack();
        return;
      }
      setCurrentStep('resume_select');
      currentStepRef.current = 'resume_select';
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
