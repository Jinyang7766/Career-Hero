import { useEffect } from 'react';
import { getActiveInterviewMode, getActiveInterviewType } from '../interview-plan-utils';

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
}: Params) => {
  useEffect(() => {
    if (!resumeData) return;
    if (currentStep === 'analyzing') return;
    if (forcedResumeSelect && currentStep === 'resume_select') return;
    const effectiveJdText = (jdText || resumeData.lastJdText || '').trim();
    if (!effectiveJdText) return;
    const activeInterviewType = getActiveInterviewType();
    const activeInterviewMode = getActiveInterviewMode();

    const jdKey = makeJdKey(effectiveJdText);
    const marker = `${String(resumeData.id || '')}:${jdKey}:${activeInterviewType}:${activeInterviewMode}:${currentStep}`;
    if (recoveredSessionKeyRef.current === marker) return;

    const session = getAnalysisSession(effectiveJdText) as any;
    if (!session) return;

    const status = String(session.state || '');
    const sessionStep = String(session.step || '').trim();
    const hasInterviewMessages = hasInterviewSessionMessages(effectiveJdText, activeInterviewType, activeInterviewMode);
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
        navigateToStep(completedStep, true);
      }
      recoveredSessionKeyRef.current = marker;
      return;
    }

    if (
      hasInterviewMessages &&
      (status === 'interview_in_progress' || status === 'paused')
    ) {
      if (!jdText) setJdText(effectiveJdText);
      restoreInterviewSession(effectiveJdText, activeInterviewType, activeInterviewMode);
      if (currentStep !== 'chat') {
        openChat('internal', { skipRestore: true });
      }
      recoveredSessionKeyRef.current = marker;
      return;
    }

    if (sessionStep === 'chat') {
      if (!jdText) setJdText(effectiveJdText);
      // Always restore (or clear) chat history for the active scene before opening chat,
      // otherwise stale messages from previous mode can leak into current mode.
      restoreInterviewSession(effectiveJdText, activeInterviewType, activeInterviewMode);
      if (currentStep !== 'chat') {
        openChat('internal', { skipRestore: true });
      }
      recoveredSessionKeyRef.current = marker;
      return;
    }

    if (
      (sessionStep === 'final_report' || sessionStep === 'interview_report' || sessionStep === 'comparison' || sessionStep === 'micro_intro' || sessionStep === 'report' || sessionStep === 'analyzing' || sessionStep === 'jd_input') &&
      currentStep !== sessionStep
    ) {
      const normalizedStep = sessionStep === 'micro_intro' ? 'report' : sessionStep;
      navigateToStep(normalizedStep as 'jd_input' | 'analyzing' | 'report' | 'micro_intro' | 'interview_report' | 'comparison' | 'final_report', true);
      recoveredSessionKeyRef.current = marker;
      return;
    }

    if (
      !hasInterviewMessages &&
      status === 'interview_in_progress' &&
      (currentStep === 'jd_input' || currentStep === 'resume_select' || currentStep === 'report')
    ) {
      navigateToStep('report', true);
      recoveredSessionKeyRef.current = marker;
      return;
    }

    if (
      status === 'report_ready' &&
      (currentStep === 'jd_input' || currentStep === 'resume_select') &&
      (resumeData.analysisSnapshot || loadLastAnalysis())
    ) {
      navigateToStep('report', true);
      recoveredSessionKeyRef.current = marker;
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
  ]);
};
