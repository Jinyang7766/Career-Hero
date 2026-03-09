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
  navigateToStep: (step: 'interview_scene' | 'analyzing' | 'interview_report' | 'comparison' | 'final_report', replace?: boolean) => void;
  recoveredSessionKeyRef: { current: string };
  interviewEntryConfirmPendingRef?: { current: boolean };
};

export const shouldSkipInterviewAutoRecovery = (currentStep: string) => {
  const normalizedStep = String(currentStep || '').trim().toLowerCase();
  return normalizedStep === 'resume_select' || normalizedStep === 'interview_scene';
};

export type InterviewRecoveryStep =
  | 'interview_scene'
  | 'analyzing'
  | 'interview_report'
  | 'comparison'
  | 'final_report';

export const normalizeInterviewRecoveryStep = (sessionStep: string): InterviewRecoveryStep | null => {
  const normalized = String(sessionStep || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'report') return 'final_report';
  if (
    normalized === 'interview_scene' ||
    normalized === 'analyzing' ||
    normalized === 'interview_report' ||
    normalized === 'comparison' ||
    normalized === 'final_report'
  ) {
    return normalized as InterviewRecoveryStep;
  }
  return null;
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

    const normalizedStep = normalizeInterviewRecoveryStep(sessionStep);
    if (normalizedStep) {
      if (currentStep === normalizedStep) return;
      pushRuntimeTrace('ai_analysis.recovery', 'goto_session_step', {
        from: currentStep,
        to: normalizedStep,
        actionMarker,
      });
      navigateToStep(normalizedStep, true);
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
