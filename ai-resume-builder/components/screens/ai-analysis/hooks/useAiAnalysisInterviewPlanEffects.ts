import { useEffect } from 'react';
import {
  getActiveInterviewFocus,
  getActiveInterviewMode,
  getActiveInterviewType,
} from '../interview-plan-utils';
import type { AiAnalysisPageEffectsParams } from './useAiAnalysisPageEffects.types';

export const useAiAnalysisInterviewPlanEffects = ({
  currentStep,
  setInterviewPlan,
  interviewPlanLength,
  isInterviewMode,
  resumeId,
  jdText,
  resumeLastJdText,
  makeJdKey,
  planAutoHealRef,
  setPlanFetchTrigger,
}: AiAnalysisPageEffectsParams) => {
  useEffect(() => {
    if (!isInterviewMode) return;
    if (currentStep !== 'chat') return;
    const mode = getActiveInterviewMode();
    const minExpected = mode === 'simple' ? 3 : 4;
    const maxAllowed = mode === 'simple' ? 3 : 12;
    const signature = `${String(resumeId || '')}|${makeJdKey(String(jdText || resumeLastJdText || '').trim() || '__no_jd__')}|${getActiveInterviewType()}|${mode}|${getActiveInterviewFocus()}`;

    if (mode === 'simple' && interviewPlanLength > maxAllowed) {
      setInterviewPlan((prev) => prev.slice(0, maxAllowed));
      return;
    }

    if (mode === 'comprehensive' && interviewPlanLength > 0 && interviewPlanLength < minExpected) {
      if (planAutoHealRef.current === signature) return;
      planAutoHealRef.current = signature;
      setInterviewPlan([]);
      setPlanFetchTrigger((v) => v + 1);
      return;
    }

    if (interviewPlanLength >= minExpected) {
      planAutoHealRef.current = '';
    }
  }, [
    currentStep,
    interviewPlanLength,
    isInterviewMode,
    jdText,
    makeJdKey,
    planAutoHealRef,
    resumeId,
    resumeLastJdText,
    setInterviewPlan,
    setPlanFetchTrigger,
  ]);
};

