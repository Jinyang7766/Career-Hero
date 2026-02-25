import { useEffect } from 'react';
import { getActiveInterviewMode, getActiveInterviewType } from '../interview-plan-utils';
import { pushRuntimeTrace } from '../../../../src/runtime-diagnostics';

type Params = {
  resumeData: any;
  forcedResumeSelect: boolean;
  currentStep: string;
  jdText: string;
  setJdText: (v: string) => void;
  getAnalysisSession: (effectiveJdText: string) => any;
  makeJdKey: (text: string) => string;
  hasInterviewSessionMessages: (effectiveJdText: string, interviewType: string, interviewMode?: string) => boolean;
  restoreInterviewSession: (effectiveJdText: string, interviewType: string, interviewMode?: string) => void;
  openChat: (source: 'internal' | 'preview', options?: { skipRestore?: boolean }) => void;
  navigateToStep: (step: 'jd_input' | 'analyzing' | 'report' | 'micro_intro' | 'interview_report' | 'comparison' | 'final_report', replace?: boolean) => void;
  recoveredSessionKeyRef: { current: string };
  interviewEntryConfirmPendingRef?: { current: boolean };
};

export const shouldSkipInterviewAutoRecovery = (currentStep: string) => {
  const normalizedStep = String(currentStep || '').trim().toLowerCase();
  return normalizedStep === 'resume_select' || normalizedStep === 'jd_input';
};

export const useInterviewSessionRecovery = ({
  resumeData,
  forcedResumeSelect,
  currentStep,
  jdText,
  setJdText,
  getAnalysisSession,
  makeJdKey,
  hasInterviewSessionMessages,
  restoreInterviewSession,
  openChat,
  navigateToStep,
  recoveredSessionKeyRef,
  interviewEntryConfirmPendingRef,
}: Params) => {
  useEffect(() => {
    if (!resumeData) return;
    if (currentStep === 'analyzing') return;

    let forceResumeSelectActive = forcedResumeSelect;
    try {
      if (localStorage.getItem('ai_interview_force_resume_select') === '1') {
        forceResumeSelectActive = true;
      }
    } catch {
      // ignore storage failures
    }
    if (forceResumeSelectActive) return;
    if (interviewEntryConfirmPendingRef?.current) return;
    if (shouldSkipInterviewAutoRecovery(currentStep)) return;

    const effectiveJdText = (jdText || resumeData.lastJdText || '').trim();
    if (!effectiveJdText) return;
    const activeInterviewType = getActiveInterviewType();
    const activeInterviewMode = getActiveInterviewMode();

    const jdKey = makeJdKey(effectiveJdText);
    const sceneMarker = `${String(resumeData.id || '')}:${jdKey}:${activeInterviewType}:${activeInterviewMode}`;
    const session = getAnalysisSession(effectiveJdText) as any;
    if (!session) return;

    const status = String(session.state || '');
    const sessionStep = String(session.step || '').trim();
    const hasInterviewMessages = hasInterviewSessionMessages(effectiveJdText, activeInterviewType, activeInterviewMode);
    const actionMarker = `${sceneMarker}:${String(status || '').toLowerCase()}:${String(sessionStep || '').toLowerCase()}:${hasInterviewMessages ? '1' : '0'}`;
    if (recoveredSessionKeyRef.current === actionMarker) return;

    const isOnCompletedFlow =
      currentStep === 'interview_report' ||
      currentStep === 'comparison' ||
      currentStep === 'final_report';

    if (status === 'interview_done') {
      if (!isOnCompletedFlow) {
        pushRuntimeTrace('ai_analysis.recovery', 'goto_completed', {
          from: currentStep,
          to: 'interview_report',
          actionMarker,
        });
        navigateToStep('interview_report', true);
      }
      recoveredSessionKeyRef.current = actionMarker;
      return;
    }

    if (
      hasInterviewMessages &&
      (status === 'interview_in_progress' || status === 'paused')
    ) {
      if (!jdText && effectiveJdText && String(jdText || '').trim() !== effectiveJdText) {
        setJdText(effectiveJdText);
      }
      restoreInterviewSession(effectiveJdText, activeInterviewType, activeInterviewMode);
      if (currentStep !== 'chat') {
        pushRuntimeTrace('ai_analysis.recovery', 'open_chat_from_in_progress', {
          from: currentStep,
          actionMarker,
          status: String(status || '').toLowerCase(),
        });
        openChat('internal', { skipRestore: true });
      }
      recoveredSessionKeyRef.current = actionMarker;
      return;
    }

    if (sessionStep === 'chat') {
      if (!jdText && effectiveJdText && String(jdText || '').trim() !== effectiveJdText) {
        setJdText(effectiveJdText);
      }
      if (currentStep !== 'chat' || hasInterviewMessages) {
        restoreInterviewSession(effectiveJdText, activeInterviewType, activeInterviewMode);
      }
      if (currentStep !== 'chat') {
        pushRuntimeTrace('ai_analysis.recovery', 'open_chat_from_session_step', {
          from: currentStep,
          actionMarker,
          sessionStep: String(sessionStep || '').toLowerCase(),
        });
        openChat('internal', { skipRestore: true });
      }
      recoveredSessionKeyRef.current = actionMarker;
      return;
    }

    if (
      (sessionStep === 'final_report' || sessionStep === 'interview_report' || sessionStep === 'comparison' || sessionStep === 'micro_intro' || sessionStep === 'report' || sessionStep === 'analyzing' || sessionStep === 'jd_input') &&
      currentStep !== sessionStep
    ) {
      const normalizedStep = sessionStep === 'micro_intro' ? 'report' : sessionStep;
      if (!normalizedStep) return;
      pushRuntimeTrace('ai_analysis.recovery', 'goto_session_step', {
        from: currentStep,
        to: normalizedStep,
        actionMarker,
      });
      navigateToStep(normalizedStep as 'jd_input' | 'analyzing' | 'report' | 'micro_intro' | 'interview_report' | 'comparison' | 'final_report', true);
      recoveredSessionKeyRef.current = actionMarker;
    }
  }, [
    currentStep,
    forcedResumeSelect,
    getAnalysisSession,
    hasInterviewSessionMessages,
    interviewEntryConfirmPendingRef,
    jdText,
    makeJdKey,
    navigateToStep,
    openChat,
    recoveredSessionKeyRef,
    restoreInterviewSession,
    resumeData,
    setJdText,
  ]);
};
