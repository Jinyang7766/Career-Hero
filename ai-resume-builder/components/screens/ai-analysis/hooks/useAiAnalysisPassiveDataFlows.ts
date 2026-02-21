import { useAnalysisStepCheckpoint } from './useAnalysisStepCheckpoint';
import { useAiExternalEntries } from './useAiExternalEntries';
import { useInterviewPlanLoader } from './useInterviewPlanLoader';
import { useOptimizedResumeListSync } from './useOptimizedResumeListSync';
import type { AiAnalysisPassiveFlowsParams } from './useAiAnalysisPassiveFlows.types';

export const useAiAnalysisPassiveDataFlows = ({
  optimizedResumeId,
  resumeData,
  currentStep,
  setAllResumes,
  jdText,
  targetCompany,
  score,
  isInterviewMode,
  persistAnalysisSessionState,
  interviewPlanConfigKey,
  buildApiUrl,
  makeJdKey,
  currentUserId,
  planFetchTrigger,
  setInterviewPlan,
  getBackendAuthToken,
  planLoaderMountedRef,
  setResumeData,
  sourceResumeIdRef,
  setSelectedResumeId,
  setAnalysisResumeId,
  setOptimizedResumeId,
  setTargetCompany,
  setJdText,
  setChatMessages,
  setChatInitialized,
  openChat,
  setStepHistory,
  setChatEntrySource,
  setLastChatStep,
  setCurrentStep,
  setForceReportEntry,
  handleResumeSelect,
}: AiAnalysisPassiveFlowsParams) => {
  useOptimizedResumeListSync({
    optimizedResumeId,
    resumeData,
    setAllResumes,
  });

  useAnalysisStepCheckpoint({
    currentStep,
    jdText,
    resumeData,
    targetCompany,
    score,
    isInterviewMode,
    persistAnalysisSessionState: persistAnalysisSessionState as any,
  });

  useInterviewPlanLoader({
    isInterviewMode,
    resumeData,
    jdText,
    targetCompany,
    interviewPlanConfigKey,
    buildApiUrl,
    makeJdKey,
    currentUserId,
    planFetchTrigger,
    setInterviewPlan,
    getBackendAuthToken,
    planLoaderMountedRef,
  });

  useAiExternalEntries({
    currentUserId,
    currentStep,
    isInterviewMode,
    setResumeData: setResumeData as any,
    sourceResumeIdRef: sourceResumeIdRef as any,
    setSelectedResumeId,
    setAnalysisResumeId,
    setOptimizedResumeId,
    setTargetCompany,
    setJdText,
    makeJdKey,
    setChatMessages: setChatMessages as any,
    setChatInitialized,
    openChat,
    setStepHistory: setStepHistory as any,
    setChatEntrySource: setChatEntrySource as any,
    setLastChatStep: setLastChatStep as any,
    setCurrentStep: setCurrentStep as any,
    setForceReportEntry,
    handleResumeSelect: handleResumeSelect as any,
  });
};
