import { useEffect } from 'react';
import { getActiveInterviewMode, getActiveInterviewType } from '../interview-plan-utils';
import { pushRuntimeTrace } from '../../../../src/runtime-diagnostics';

type Params = {
  resumeData: any;
  forcedResumeSelect: boolean;
  currentStep: string;
  jdText: string;
  getAnalysisSession: (effectiveJdText: string) => any;
  makeJdKey: (text: string) => string;
  hasInterviewSessionMessages: (effectiveJdText: string, interviewType: string, interviewMode?: string) => boolean;
  navigateToStep: (step: 'jd_input' | 'analyzing' | 'interview_report' | 'comparison' | 'final_report', replace?: boolean) => void;
  loadLastAnalysis: () => any;
  recoveredSessionKeyRef: { current: string };
  suppressAutoRecoveryRef?: { current: boolean };
};

export const canApplyDiagnosisStepRecovery = (
  fromStep: string,
  toStep: string
) => {
  const normalizedFrom = String(fromStep || '').trim().toLowerCase();
  const normalizedTo = String(toStep || '').trim().toLowerCase();
  if (!normalizedTo || normalizedFrom === normalizedTo) return false;
  if (normalizedTo === 'jd_input') return false;
  if (normalizedTo === 'final_report') {
    // Do not auto-recover from comparison to final_report.
    // comparison is an explicit user action from report page ("查看优化简历"),
    // and forcing back to final_report makes the button appear broken.
    return (
      normalizedFrom === 'jd_input' ||
      normalizedFrom === 'analyzing' ||
      normalizedFrom === 'chat' ||
      normalizedFrom === 'report' ||
      normalizedFrom === 'interview_report'
    );
  }
  return false;
};

export const consumeDiagnosisAutoRecoverySuppression = (
  suppressAutoRecoveryRef?: { current: boolean }
) => {
  if (!suppressAutoRecoveryRef?.current) return false;
  suppressAutoRecoveryRef.current = false;
  return true;
};

export const useDiagnosisSessionRecovery = ({
  resumeData,
  forcedResumeSelect,
  currentStep,
  jdText,
  getAnalysisSession,
  makeJdKey,
  hasInterviewSessionMessages,
  navigateToStep,
  loadLastAnalysis,
  recoveredSessionKeyRef,
  suppressAutoRecoveryRef,
}: Params) => {
  useEffect(() => {
    if (consumeDiagnosisAutoRecoverySuppression(suppressAutoRecoveryRef)) {
      return;
    }
    if (!resumeData) return;
    if (currentStep === 'analyzing') return;
    if (forcedResumeSelect) return;

    const effectiveJdText = String(jdText || '').trim();
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

    const isOnCompletedFlow = currentStep === 'final_report';
    if (status === 'interview_done') {
      if (!isOnCompletedFlow) {
        pushRuntimeTrace('ai_analysis.recovery', 'goto_completed', {
          from: currentStep,
          to: 'final_report',
          actionMarker,
        });
        navigateToStep('final_report', true);
      }
      recoveredSessionKeyRef.current = actionMarker;
      return;
    }

    if (
      (hasInterviewMessages && (status === 'interview_in_progress' || status === 'paused')) ||
      sessionStep === 'chat'
    ) {
      if (currentStep !== 'final_report') {
        pushRuntimeTrace('ai_analysis.recovery', 'goto_final_report_from_chat_diagnosis', {
          from: currentStep,
          actionMarker,
        });
        navigateToStep('final_report', true);
      }
      recoveredSessionKeyRef.current = actionMarker;
      return;
    }

    if (
      (sessionStep === 'final_report' || sessionStep === 'interview_report' || sessionStep === 'comparison' || sessionStep === 'report' || sessionStep === 'chat' || sessionStep === 'analyzing' || sessionStep === 'jd_input') &&
      currentStep !== sessionStep
    ) {
      const normalizedStep =
        sessionStep === 'final_report' || sessionStep === 'interview_report'
          ? 'final_report'
          : sessionStep === 'comparison' || sessionStep === 'report' || sessionStep === 'chat'
            ? 'final_report'
            : sessionStep === 'jd_input' || sessionStep === 'analyzing'
              ? 'jd_input'
              : '';
      if (!normalizedStep) return;
      if (!canApplyDiagnosisStepRecovery(currentStep, normalizedStep)) return;
      pushRuntimeTrace('ai_analysis.recovery', 'goto_session_step', {
        from: currentStep,
        to: normalizedStep,
        actionMarker,
      });
      navigateToStep(normalizedStep as 'jd_input' | 'analyzing' | 'interview_report' | 'comparison' | 'final_report', true);
      recoveredSessionKeyRef.current = actionMarker;
      return;
    }

    if (
      !hasInterviewMessages &&
      status === 'interview_in_progress' &&
      (currentStep === 'jd_input' || currentStep === 'final_report')
    ) {
      pushRuntimeTrace('ai_analysis.recovery', 'goto_final_report_from_in_progress', {
        from: currentStep,
        actionMarker,
      });
      navigateToStep('final_report', true);
      recoveredSessionKeyRef.current = actionMarker;
      return;
    }

    if (
      status === 'report_ready' &&
      currentStep === 'jd_input' &&
      (resumeData.analysisSnapshot || loadLastAnalysis())
    ) {
      pushRuntimeTrace('ai_analysis.recovery', 'goto_final_report_from_ready', {
        from: currentStep,
        actionMarker,
      });
      navigateToStep('final_report', true);
      recoveredSessionKeyRef.current = actionMarker;
    }
  }, [
    currentStep,
    forcedResumeSelect,
    getAnalysisSession,
    hasInterviewSessionMessages,
    jdText,
    loadLastAnalysis,
    makeJdKey,
    navigateToStep,
    suppressAutoRecoveryRef,
    recoveredSessionKeyRef,
    resumeData,
  ]);
};
