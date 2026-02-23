import { useAiAnalysisLifecycle } from './useAiAnalysisLifecycle';
import { useAnalysisHungGuard } from './useAnalysisHungGuard';
import { useAnalysisSessionRecovery } from './useAnalysisSessionRecovery';
import { useChatIntroMessages } from './useChatIntroMessages';
import { useReportSnapshotRestore } from './useReportSnapshotRestore';
import type { AiAnalysisPassiveFlowsParams } from './useAiAnalysisPassiveFlows.types';

export const useAiAnalysisPassiveStateFlows = ({
  isInterviewMode,
  reportMicroInterviewFirstQuestion,
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
}: AiAnalysisPassiveFlowsParams) => {
  useChatIntroMessages({
    isInterviewMode,
    microInterviewFirstQuestion: reportMicroInterviewFirstQuestion,
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

  useAnalysisSessionRecovery({
    resumeData,
    forcedResumeSelect,
    currentStep,
    jdText,
    setJdText,
    getAnalysisSession: getAnalysisSession as any,
    makeJdKey,
    hasInterviewSessionMessages: hasInterviewSessionMessages as any,
    restoreInterviewSession: restoreInterviewSession as any,
    openChat,
    navigateToStep: navigateToStep as any,
    loadLastAnalysis,
    recoveredSessionKeyRef: recoveredSessionKeyRef as any,
    isInterviewMode,
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
