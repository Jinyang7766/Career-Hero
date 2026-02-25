import { useDiagnosisSessionRecovery, canApplyDiagnosisStepRecovery } from './useDiagnosisSessionRecovery';
import { useInterviewSessionRecovery, shouldSkipInterviewAutoRecovery as shouldSkipInterviewAutoRecoveryForInterview } from './useInterviewSessionRecovery';

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

export const shouldSkipInterviewAutoRecovery = (
  isInterviewMode: boolean | undefined,
  currentStep: string
) => {
  if (!isInterviewMode) return false;
  return shouldSkipInterviewAutoRecoveryForInterview(currentStep);
};

export const useAnalysisSessionRecovery = (params: Params) => {
  const isInterviewMode = !!params.isInterviewMode;

  useDiagnosisSessionRecovery({
    resumeData: params.resumeData,
    forcedResumeSelect: isInterviewMode ? true : params.forcedResumeSelect,
    currentStep: params.currentStep,
    jdText: params.jdText,
    getAnalysisSession: params.getAnalysisSession,
    makeJdKey: params.makeJdKey,
    hasInterviewSessionMessages: params.hasInterviewSessionMessages,
    navigateToStep: params.navigateToStep,
    loadLastAnalysis: params.loadLastAnalysis,
    recoveredSessionKeyRef: params.recoveredSessionKeyRef,
  });

  useInterviewSessionRecovery({
    resumeData: params.resumeData,
    forcedResumeSelect: isInterviewMode ? params.forcedResumeSelect : true,
    currentStep: params.currentStep,
    jdText: params.jdText,
    setJdText: params.setJdText,
    getAnalysisSession: params.getAnalysisSession,
    makeJdKey: params.makeJdKey,
    hasInterviewSessionMessages: params.hasInterviewSessionMessages,
    restoreInterviewSession: params.restoreInterviewSession,
    openChat: params.openChat,
    navigateToStep: params.navigateToStep,
    recoveredSessionKeyRef: params.recoveredSessionKeyRef,
    interviewEntryConfirmPendingRef: params.interviewEntryConfirmPendingRef,
  });
};

export { canApplyDiagnosisStepRecovery };
