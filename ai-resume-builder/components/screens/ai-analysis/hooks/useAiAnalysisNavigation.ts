import { useEffect, useRef, useState } from 'react';

type Step =
  | 'resume_select'
  | 'jd_input'
  | 'analyzing'
  | 'chat'
  | 'interview_report_loading'
  | 'interview_report'
  | 'comparison'
  | 'final_report';

export const popHistoryBackTarget = (
  stepHistory: Step[],
  currentStep: Step
): { remainingHistory: Step[]; targetStep: Step | null } => {
  const remainingHistory = [...stepHistory];
  let targetStep: Step | undefined = remainingHistory.pop();

  // Skip accidental duplicate history entries that equal current step,
  // otherwise the first back tap appears to do nothing.
  while (targetStep && targetStep === currentStep && remainingHistory.length > 0) {
    targetStep = remainingHistory.pop();
  }
  // Final report page should never go back to transient steps.
  while (
    currentStep === 'final_report' &&
    targetStep === 'analyzing' &&
    remainingHistory.length > 0
  ) {
    targetStep = remainingHistory.pop();
  }
  if (currentStep === 'final_report' && targetStep === 'analyzing') {
    targetStep = 'jd_input';
  }
  if (!targetStep || targetStep === currentStep) {
    return { remainingHistory, targetStep: null };
  }
  return { remainingHistory, targetStep };
};

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
    const validSteps: Step[] = ['resume_select', 'jd_input', 'analyzing', 'interview_report_loading', 'interview_report', 'comparison', 'final_report'];
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
      // If chat is auto-opened right after analysis, treat final_report as previous
      // step so back navigation returns to final report instead of analyzing.
      const prevStep = currentStep === 'analyzing'
        ? 'final_report'
        : (currentStep !== 'chat' ? currentStep : lastChatStep);
      if (prevStep && prevStep !== 'chat') {
        setLastChatStep(prevStep);
        localStorage.setItem('ai_chat_prev_step', prevStep);
      }
      setChatEntrySource('internal');
      localStorage.setItem('ai_chat_entry_source', 'internal');
      if (!options?.skipRestore) {
        try {
          restoreInterviewSession();
        } catch (error) {
          console.warn('restoreInterviewSession failed, continue opening chat:', error);
        }
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
      const { remainingHistory, targetStep } = popHistoryBackTarget(stepHistory, currentStep);
      setStepHistory(remainingHistory);
      if (targetStep) {
        setCurrentStep(targetStep);
        currentStepRef.current = targetStep;
        return;
      }
      // History may only contain current-step duplicates.
      // Fall through to fallback logic so one tap still navigates back.
    }

    const replacedFrom = replaceBackMapRef.current[currentStep];
    if (replacedFrom && replacedFrom !== currentStep) {
      delete replaceBackMapRef.current[currentStep];
      setCurrentStep(replacedFrom);
      currentStepRef.current = replacedFrom;
      return;
    } else if (currentStep === 'final_report') {
      setCurrentStep('jd_input');
      currentStepRef.current = 'jd_input';
    } else if (goBack) {
      goBack();
      return;
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
