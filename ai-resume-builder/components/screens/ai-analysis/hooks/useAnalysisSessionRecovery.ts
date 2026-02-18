import { useEffect } from 'react';

type Params = {
  resumeData: any;
  forcedResumeSelect: boolean;
  currentStep: string;
  jdText: string;
  setJdText: (v: string) => void;
  getAnalysisSession: (effectiveJdText: string) => any;
  makeJdKey: (text: string) => string;
  hasInterviewSessionMessages: (effectiveJdText: string, interviewType: string) => boolean;
  restoreInterviewSession: (effectiveJdText: string, interviewType: string) => void;
  openChat: (source: 'internal' | 'preview') => void;
  navigateToStep: (step: 'jd_input' | 'analyzing' | 'report' | 'micro_intro' | 'comparison' | 'final_report', replace?: boolean) => void;
  loadLastAnalysis: () => any;
  recoveredSessionKeyRef: { current: string };
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
}: Params) => {
  useEffect(() => {
    if (!resumeData) return;
    if (forcedResumeSelect && currentStep === 'resume_select') return;
    const effectiveJdText = (jdText || resumeData.lastJdText || '').trim();
    if (!effectiveJdText) return;
    const activeInterviewType = String(localStorage.getItem('ai_interview_type') || 'general').toLowerCase();

    const jdKey = makeJdKey(effectiveJdText);
    const marker = `${String(resumeData.id || '')}:${jdKey}:${activeInterviewType}:${currentStep}`;
    if (recoveredSessionKeyRef.current === marker) return;

    const session = getAnalysisSession(effectiveJdText) as any;
    if (!session) return;

    const status = String(session.state || '');
    const sessionStep = String(session.step || '').trim();
    const hasInterviewMessages = hasInterviewSessionMessages(effectiveJdText, activeInterviewType);

    if (
      hasInterviewMessages &&
      (status === 'interview_in_progress' || status === 'paused') &&
      currentStep !== 'chat'
    ) {
      if (!jdText) setJdText(effectiveJdText);
      restoreInterviewSession(effectiveJdText, activeInterviewType);
      openChat('internal');
      recoveredSessionKeyRef.current = marker;
      return;
    }

    if (sessionStep === 'chat' && currentStep !== 'chat') {
      if (!jdText) setJdText(effectiveJdText);
      if (hasInterviewMessages) {
        restoreInterviewSession(effectiveJdText, activeInterviewType);
      }
      openChat('internal');
      recoveredSessionKeyRef.current = marker;
      return;
    }

    if (
      (sessionStep === 'final_report' || sessionStep === 'comparison' || sessionStep === 'micro_intro' || sessionStep === 'report' || sessionStep === 'analyzing' || sessionStep === 'jd_input') &&
      currentStep !== sessionStep
    ) {
      navigateToStep(sessionStep as 'jd_input' | 'analyzing' | 'report' | 'micro_intro' | 'comparison' | 'final_report', true);
      recoveredSessionKeyRef.current = marker;
      return;
    }

    if (
      !hasInterviewMessages &&
      status === 'interview_in_progress' &&
      (currentStep === 'jd_input' || currentStep === 'resume_select' || currentStep === 'report')
    ) {
      navigateToStep('micro_intro', true);
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

    if (
      status === 'interview_done' &&
      (currentStep === 'jd_input' || currentStep === 'resume_select' || currentStep === 'report')
    ) {
      navigateToStep('comparison', true);
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
  ]);
};
