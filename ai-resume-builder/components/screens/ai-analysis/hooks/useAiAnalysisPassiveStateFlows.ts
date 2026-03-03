import { useAiAnalysisLifecycle } from './useAiAnalysisLifecycle';
import { useAnalysisHungGuard } from './useAnalysisHungGuard';
import { useDiagnosisSessionRecovery } from './useDiagnosisSessionRecovery';
import { useInterviewSessionRecovery } from './useInterviewSessionRecovery';
import { useChatIntroMessages } from './useChatIntroMessages';
import { useReportSnapshotRestore } from './useReportSnapshotRestore';
import type { AiAnalysisPassiveFlowsParams } from './useAiAnalysisPassiveFlows.types';

export const useAiAnalysisPassiveStateFlows = ({
  isInterviewMode,
  currentStep,
  chatInitialized,
  chatMessagesRef,
  chatIntroScheduledRef,
  setChatInitialized,
  setChatMessages,
  resumeData,
  jdText,
  chatEntrySource,
  score,
  suggestionsLength,
  setChatEntrySource,
  setLastChatStep,
  setStepHistory,
  setCurrentStep,
  selectedResumeId,
  forcedResumeSelect,
  setJdText,
  getAnalysisSession,
  makeJdKey,
  hasInterviewSessionMessages,
  restoreInterviewSession,
  openChat,
  navigateToStep,
  loadLastAnalysis,
  recoveredSessionKeyRef,
  interviewEntryConfirmPendingRef,
  report,
  applyAnalysisSnapshot,
  setTargetCompany,
  setAnalysisResumeId,
  setResumeData,
  sourceResumeIdRef,
  isAnalysisStillInProgress,
  inprogressAtKey,
  cancelInFlightAnalysis,
  suppressDiagnosisSessionRecoveryRef,
}: AiAnalysisPassiveFlowsParams) => {
  useChatIntroMessages({
    isInterviewMode,
    currentStep,
    chatInitialized,
    chatMessagesRef: chatMessagesRef as any,
    chatIntroScheduledRef: chatIntroScheduledRef as any,
    setChatInitialized,
    setChatMessages: setChatMessages as any,
    resumeData,
    jdText,
  });

  useAiAnalysisLifecycle({
    currentStep,
    chatEntrySource,
    score,
    suggestionsLength,
    setChatEntrySource,
    setLastChatStep,
    setStepHistory,
    setCurrentStep,
    selectedResumeId,
    resumeData,
    isInterviewMode,
  });

  useDiagnosisSessionRecovery({
    resumeData,
    forcedResumeSelect: isInterviewMode ? true : forcedResumeSelect,
    currentStep,
    jdText,
    getAnalysisSession: getAnalysisSession as any,
    makeJdKey,
    hasInterviewSessionMessages: hasInterviewSessionMessages as any,
    navigateToStep: navigateToStep as any,
    loadLastAnalysis,
    recoveredSessionKeyRef: recoveredSessionKeyRef as any,
    suppressAutoRecoveryRef: suppressDiagnosisSessionRecoveryRef as any,
  });

  useInterviewSessionRecovery({
    resumeData,
    forcedResumeSelect: isInterviewMode ? forcedResumeSelect : true,
    currentStep,
    jdText,
    setJdText,
    getAnalysisSession: getAnalysisSession as any,
    makeJdKey,
    hasInterviewSessionMessages: hasInterviewSessionMessages as any,
    restoreInterviewSession: restoreInterviewSession as any,
    openChat,
    navigateToStep: navigateToStep as any,
    recoveredSessionKeyRef: recoveredSessionKeyRef as any,
    interviewEntryConfirmPendingRef: interviewEntryConfirmPendingRef as any,
  });

  useReportSnapshotRestore({
    currentStep,
    score,
    suggestionsLength,
    report,
    resumeData,
    loadLastAnalysis,
    applyAnalysisSnapshot,
    setJdText,
    setTargetCompany,
    setAnalysisResumeId,
    setResumeData: setResumeData as any,
    sourceResumeIdRef: sourceResumeIdRef as any,
  });

  useAnalysisHungGuard({
    currentStep,
    setCurrentStep: setCurrentStep as any,
    isAnalysisStillInProgress,
    inprogressAtKey,
    cancelInFlightAnalysis,
  });
};
