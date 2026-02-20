import type React from 'react';
import { useAiAnalysisLifecycle } from './useAiAnalysisLifecycle';
import { useAnalysisHungGuard } from './useAnalysisHungGuard';
import { useAnalysisSessionRecovery } from './useAnalysisSessionRecovery';
import { useAnalysisStepCheckpoint } from './useAnalysisStepCheckpoint';
import { useAiExternalEntries } from './useAiExternalEntries';
import { useChatIntroMessages } from './useChatIntroMessages';
import { useInterviewPlanLoader } from './useInterviewPlanLoader';
import { useOptimizedResumeListSync } from './useOptimizedResumeListSync';
import { useReportSnapshotRestore } from './useReportSnapshotRestore';

type Params = {
  isInterviewMode?: boolean;
  reportMicroInterviewFirstQuestion?: string;
  currentStep: string;
  chatInitialized: boolean;
  chatMessagesRef: React.MutableRefObject<any[]>;
  chatIntroScheduledRef: React.MutableRefObject<boolean>;
  setChatInitialized: (v: boolean) => void;
  setChatMessages: React.Dispatch<React.SetStateAction<any[]>>;
  resumeData: any;
  jdText: string;

  chatEntrySource: string;
  score: number;
  suggestionsLength: number;
  setChatEntrySource: (v: any) => void;
  setLastChatStep: (v: any) => void;
  setStepHistory: React.Dispatch<React.SetStateAction<any[]>>;
  setCurrentStep: (v: any) => void;
  selectedResumeId: string | number | null;

  forcedResumeSelect: boolean;
  setJdText: (v: string) => void;
  getAnalysisSession: (...args: any[]) => any;
  makeJdKey: (v: string) => string;
  hasInterviewSessionMessages: (...args: any[]) => boolean;
  restoreInterviewSession: (...args: any[]) => any;
  openChat: (source: 'internal' | 'preview', options?: { skipRestore?: boolean }) => void;
  navigateToStep: (...args: any[]) => any;
  loadLastAnalysis: (...args: any[]) => any;
  recoveredSessionKeyRef: React.MutableRefObject<string>;

  optimizedResumeId: string | number | null;
  setAllResumes: (v: any) => void;
  targetCompany: string;
  persistAnalysisSessionState: (...args: any[]) => Promise<void>;

  interviewPlanConfigKey: string;
  buildApiUrl: (path: string) => string;
  currentUserId?: string;
  planFetchTrigger: number;
  setInterviewPlan: React.Dispatch<React.SetStateAction<string[]>>;
  getBackendAuthToken: () => Promise<string>;
  planLoaderMountedRef: React.MutableRefObject<boolean>;

  report: any;
  applyAnalysisSnapshot: (...args: any[]) => any;
  setTargetCompany: (v: string) => void;
  setAnalysisResumeId: (v: string | number | null) => void;
  setResumeData: (v: any) => void;
  sourceResumeIdRef: React.MutableRefObject<string | number | null>;

  isAnalysisStillInProgress: () => boolean;
  inprogressAtKey: string;
  cancelInFlightAnalysis: (...args: any[]) => any;

  setSelectedResumeId: (v: string | number | null) => void;
  setOptimizedResumeId: (v: string | number | null) => void;
  setForceReportEntry: (v: boolean) => void;
  handleResumeSelect: (...args: any[]) => any;
};

export const useAiAnalysisPassiveFlows = ({
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
  optimizedResumeId,
  setAllResumes,
  targetCompany,
  persistAnalysisSessionState,
  interviewPlanConfigKey,
  buildApiUrl,
  currentUserId,
  planFetchTrigger,
  setInterviewPlan,
  getBackendAuthToken,
  planLoaderMountedRef,
  report,
  applyAnalysisSnapshot,
  setTargetCompany,
  setAnalysisResumeId,
  setResumeData,
  sourceResumeIdRef,
  isAnalysisStillInProgress,
  inprogressAtKey,
  cancelInFlightAnalysis,
  setSelectedResumeId,
  setOptimizedResumeId,
  setForceReportEntry,
  handleResumeSelect,
}: Params) => {
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
  });

  useOptimizedResumeListSync({
    optimizedResumeId,
    resumeData,
    currentStep,
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
    interviewPlanConfigKey,
    buildApiUrl,
    makeJdKey,
    currentUserId,
    planFetchTrigger,
    setInterviewPlan,
    getBackendAuthToken,
    planLoaderMountedRef,
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
