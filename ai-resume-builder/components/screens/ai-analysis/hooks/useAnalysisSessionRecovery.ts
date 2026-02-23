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
  loadLastAnalysis: () => any;
  recoveredSessionKeyRef: { current: string };
  isInterviewMode?: boolean;
  interviewEntryConfirmPendingRef?: { current: boolean };
};

export const useAnalysisSessionRecovery = ({
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
  loadLastAnalysis,
  recoveredSessionKeyRef,
  isInterviewMode,
  interviewEntryConfirmPendingRef,
}: Params) => {
  useEffect(() => {
    if (!resumeData) return;
    if (currentStep === 'analyzing') return;
    const forceKey = isInterviewMode ? 'ai_interview_force_resume_select' : 'ai_analysis_force_resume_select';
    let forceResumeSelectActive = forcedResumeSelect;
    try {
      if (localStorage.getItem(forceKey) === '1') {
        forceResumeSelectActive = true;
      }
    } catch {
      // ignore storage failures
    }
    // Navigation entry from bottom nav should always land on resume_select first.
    if (forceResumeSelectActive) return;
    if (isInterviewMode && interviewEntryConfirmPendingRef?.current) return;
    if (isInterviewMode && currentStep === 'jd_input') {
      // Scene setup page should never auto-enter chat/report.
      // Entry must be explicit via "开始面试/继续面试".
      return;
    }
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
    const completedStep = isInterviewMode ? 'interview_report' : 'comparison';
    const isOnCompletedFlow =
      currentStep === completedStep ||
      currentStep === 'interview_report' ||
      currentStep === 'comparison' ||
      currentStep === 'final_report';

    // Priority rule: once interview is done, always pin to completed flow.
    // Ignore stale `session.step` (e.g. still "report") to avoid step oscillation loops.
    if (status === 'interview_done') {
      if (!isOnCompletedFlow) {
        pushRuntimeTrace('ai_analysis.recovery', 'goto_completed', {
          from: currentStep,
          to: completedStep,
          actionMarker,
        });
        navigateToStep(completedStep, true);
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
      // Restore before opening chat to avoid stale cross-scene content.
      // When already in chat and no persisted messages are available, skip restore to
      // avoid clearing freshly injected intro messages in the same render cycle.
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
      pushRuntimeTrace('ai_analysis.recovery', 'goto_session_step', {
        from: currentStep,
        to: normalizedStep,
        actionMarker,
      });
      navigateToStep(normalizedStep as 'jd_input' | 'analyzing' | 'report' | 'micro_intro' | 'interview_report' | 'comparison' | 'final_report', true);
      recoveredSessionKeyRef.current = actionMarker;
      return;
    }

    if (
      !hasInterviewMessages &&
      status === 'interview_in_progress' &&
      (currentStep === 'jd_input' || currentStep === 'resume_select' || currentStep === 'report')
    ) {
      pushRuntimeTrace('ai_analysis.recovery', 'goto_report_from_in_progress', {
        from: currentStep,
        actionMarker,
      });
      navigateToStep('report', true);
      recoveredSessionKeyRef.current = actionMarker;
      return;
    }

    if (
      status === 'report_ready' &&
      (currentStep === 'jd_input' || currentStep === 'resume_select') &&
      (resumeData.analysisSnapshot || loadLastAnalysis())
    ) {
      pushRuntimeTrace('ai_analysis.recovery', 'goto_report_from_ready', {
        from: currentStep,
        actionMarker,
      });
      navigateToStep('report', true);
      recoveredSessionKeyRef.current = actionMarker;
      return;
    }

  }, [
    currentStep,
    getAnalysisSession,
    jdText,
    loadLastAnalysis,
    makeJdKey,
    navigateToStep,
    openChat,
    resumeData,
    hasInterviewSessionMessages,
    restoreInterviewSession,
    setJdText,
    forcedResumeSelect,
    recoveredSessionKeyRef,
    isInterviewMode,
    interviewEntryConfirmPendingRef,
  ]);
};
