import type React from 'react';
import { useAiAnalysisActions } from './useAiAnalysisActions';
import { useInterviewEntryActions } from './useInterviewEntryActions';
import { useInterviewVoice } from './useInterviewVoice';
import { countInterviewAnsweredMessages, getEndChatCommand } from '../interview-chat-helpers';

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
  resumeData: any;
  makeJdKey: (v: string) => string;
  currentUserId?: string;
  setInterviewPlan: React.Dispatch<React.SetStateAction<string[]>>;
  setPlanFetchTrigger: React.Dispatch<React.SetStateAction<number>>;
  clearInterviewSession: (...args: any[]) => Promise<void>;
  isInterviewMode?: boolean;
  chatMessages: any[];
  chatIntroScheduledRef: React.MutableRefObject<boolean>;
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
  resumeData,
  makeJdKey,
  currentUserId,
  setInterviewPlan,
  setPlanFetchTrigger,
  clearInterviewSession,
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
    handleStartMicroInterview,
    handleRetryAnalysisFromIntro,
  } = useAiAnalysisActions({
    navigateToView,
    navigateToStep: navigateToStep as any,
    openChat,
    currentStep,
  });

  const { handleRestartInterview, handleStartInterviewFromFinalReport } = useInterviewEntryActions({
    chatIntroScheduledRef,
    clearInterviewSession: clearInterviewSession as any,
    jdText,
    resumeData,
    makeJdKey,
    currentUserId,
    setInterviewPlan,
    setPlanFetchTrigger,
    openChat,
  });

  const endInterviewFromChat = () => {
    void handleSendMessage(getEndChatCommand(isInterviewMode), null);
  };

  const interviewAnsweredCount = countInterviewAnsweredMessages(chatMessages as any);

  return {
    ...voice,
    getScoreColor,
    handleResumeSelectBack,
    handleStartMicroInterview,
    handleRetryAnalysisFromIntro,
    handleRestartInterview,
    handleStartInterviewFromFinalReport,
    endInterviewFromChat,
    interviewAnsweredCount,
  };
};
