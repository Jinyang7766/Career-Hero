import type React from 'react';
import { useAiAnalysisCommonActions } from './useAiAnalysisCommonActions';
import { useDiagnosisEntryActions } from './useDiagnosisEntryActions';
import { useInterviewEntryActions } from './useInterviewEntryActions';
import { useInterviewVoice } from './useInterviewVoice';
import { countInterviewAnsweredMessages, getEndChatCommand } from '../interview-chat-helpers';
import type { QuotaKind } from './useUsageQuota';

type Params = {
  currentStep: string;
  chatMessagesRef: React.MutableRefObject<any[]>;
  setChatMessages: React.Dispatch<React.SetStateAction<any[]>>;
  handleSendMessage: (...args: any[]) => Promise<void>;
  showToast: (msg: string, type?: 'info' | 'success' | 'error', ms?: number) => void;
  getBackendAuthToken: () => Promise<string>;
  navigateToView: (...args: any[]) => void;
  navigateToStep: (...args: any[]) => void;
  openChat: (...args: any[]) => void;
  jdText: string;
  targetCompany?: string;
  resumeData: any;
  makeJdKey: (v: string) => string;
  consumeUsageQuota?: (kind: QuotaKind, context?: { scenario?: string; mode?: string }) => Promise<boolean>;
  currentUserId?: string;
  setAllResumes?: (updater: (prev: any[]) => any[]) => void;
  setInterviewPlan: React.Dispatch<React.SetStateAction<string[]>>;
  setPlanFetchTrigger: React.Dispatch<React.SetStateAction<number>>;
  clearInterviewSession: (...args: any[]) => Promise<void>;
  clearInterviewSceneState?: (...args: any[]) => Promise<void>;
  setTargetCompany?: (v: string) => void;
  setJdText?: (v: string) => void;
  onRetryAnalysisFromIntro?: () => void;
  isInterviewMode?: boolean;
  chatMessages: any[];
  chatIntroScheduledRef: React.MutableRefObject<boolean>;
  persistAnalysisSessionState?: (
    state: 'interview_in_progress' | 'paused' | 'interview_done',
    patch?: Partial<{ jdText: string; targetCompany: string; step: string; force: boolean }>
  ) => Promise<void>;
};

export const useAiAnalysisInteractionBundle = ({
  currentStep,
  chatMessagesRef,
  setChatMessages,
  handleSendMessage,
  showToast,
  getBackendAuthToken,
  navigateToView,
  navigateToStep,
  openChat,
  jdText,
  targetCompany,
  resumeData,
  makeJdKey,
  consumeUsageQuota,
  currentUserId,
  setAllResumes,
  setInterviewPlan,
  setPlanFetchTrigger,
  clearInterviewSession,
  clearInterviewSceneState,
  persistAnalysisSessionState,
  setTargetCompany,
  setJdText,
  onRetryAnalysisFromIntro,
  isInterviewMode,
  chatMessages,
  chatIntroScheduledRef,
}: Params) => {
  const voice = useInterviewVoice({
    currentStep,
    chatMessagesRef: chatMessagesRef as any,
    setChatMessages: setChatMessages as any,
    handleSendMessage: handleSendMessage as any,
    showToast,
    getBackendAuthToken,
  });

  const {
    getScoreColor,
    handleResumeSelectBack,
    handleRetryAnalysisFromIntro,
  } = useAiAnalysisCommonActions({
    navigateToView,
    navigateToStep: navigateToStep as any,
    onRetryAnalysisFromIntro,
  });

  const {
    handleStartMicroInterview,
    microInterviewActionLabel,
  } = useDiagnosisEntryActions({
    openChat,
    navigateToStep: navigateToStep as any,
    resumeData,
    jdText,
    makeJdKey,
    consumeUsageQuota,
    persistAnalysisSessionState,
  });

  const { handleRestartInterview, handleStartInterviewFromFinalReport } = useInterviewEntryActions({
    isInterviewMode,
    chatIntroScheduledRef,
    clearInterviewSession: clearInterviewSession as any,
    clearInterviewSceneState: clearInterviewSceneState as any,
    persistAnalysisSessionState: persistAnalysisSessionState as any,
    jdText,
    targetCompany,
    resumeData,
    makeJdKey,
    currentUserId,
    setAllResumes,
    setInterviewPlan,
    setPlanFetchTrigger,
    openChat,
    navigateToStep: navigateToStep as any,
    navigateToView: navigateToView as any,
    setTargetCompany,
    setJdText,
  });

  const endInterviewFromChat = () => {
    void handleSendMessage(getEndChatCommand(isInterviewMode), null);
  };
  const skipInterviewQuestionFromChat = () => {
    void handleSendMessage('我选择跳过本题，请给出该题参考回复并进入下一题。', null, {
      skipCurrentQuestion: true,
    });
  };

  const interviewAnsweredCount = countInterviewAnsweredMessages(chatMessages as any);

  return {
    ...voice,
    getScoreColor,
    handleResumeSelectBack,
    handleStartMicroInterview,
    microInterviewActionLabel,
    handleRetryAnalysisFromIntro,
    handleRestartInterview,
    handleStartInterviewFromFinalReport,
    endInterviewFromChat,
    skipInterviewQuestionFromChat,
    interviewAnsweredCount,
  };
};
