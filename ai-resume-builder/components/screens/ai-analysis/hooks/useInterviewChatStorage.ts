import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { getActiveInterviewMode, getActiveInterviewType } from '../interview-plan-utils';
import {
  buildPendingReplyKey,
  buildTimingStorageKey,
  type InterviewAnswerTiming,
} from '../chat-session-utils';

type Params = {
  currentUserId?: string;
  resumeData: any;
  jdText: string;
  isInterviewMode: boolean;
  answerTimingsRef: MutableRefObject<InterviewAnswerTiming[]>;
  activeQuestionMessageIdRef: MutableRefObject<string>;
  activeQuestionStartAtRef: MutableRefObject<number>;
  setCurrentQuestionElapsedSec: Dispatch<SetStateAction<number>>;
  setHasPendingReply: Dispatch<SetStateAction<boolean>>;
};

export const useInterviewChatStorage = ({
  currentUserId,
  resumeData,
  jdText,
  isInterviewMode,
  answerTimingsRef,
  activeQuestionMessageIdRef,
  activeQuestionStartAtRef,
  setCurrentQuestionElapsedSec,
  setHasPendingReply,
}: Params) => {
  const getPendingReplyKey = () =>
    buildPendingReplyKey({
      currentUserId,
      resumeId: (resumeData as any)?.id,
      jdText,
      lastJdText: (resumeData as any)?.lastJdText,
      isInterviewMode,
    });

  const getTimingStorageKey = () =>
    buildTimingStorageKey({
      currentUserId,
      resumeId: (resumeData as any)?.id,
      jdText,
      lastJdText: (resumeData as any)?.lastJdText,
      isInterviewMode,
      interviewType: getActiveInterviewType(),
      interviewMode: getActiveInterviewMode(),
    });

  const persistTimingSnapshot = () => {
    if (!isInterviewMode) return;
    try {
      localStorage.setItem(getTimingStorageKey(), JSON.stringify({
        entries: answerTimingsRef.current,
        activeQuestionMessageId: activeQuestionMessageIdRef.current || '',
        activeQuestionStartedAt: activeQuestionStartAtRef.current || 0,
      }));
    } catch (err) {
      console.warn('Failed to persist interview timing snapshot:', err);
    }
  };

  const clearTimingSnapshot = () => {
    answerTimingsRef.current = [];
    activeQuestionMessageIdRef.current = '';
    activeQuestionStartAtRef.current = 0;
    setCurrentQuestionElapsedSec(0);
    try {
      localStorage.removeItem(getTimingStorageKey());
    } catch {}
  };

  const setPendingReply = (payload: {
    requestId: string;
    text: string;
    userMessageId: string;
    createdAt: string;
    replayCount?: number;
  }) => {
    try {
      localStorage.setItem(getPendingReplyKey(), JSON.stringify(payload));
      setHasPendingReply(true);
    } catch (err) {
      console.warn('Failed to persist pending chat reply marker:', err);
    }
  };

  const clearPendingReply = () => {
    try {
      localStorage.removeItem(getPendingReplyKey());
      setHasPendingReply(false);
    } catch {}
  };

  return {
    getPendingReplyKey,
    getTimingStorageKey,
    persistTimingSnapshot,
    clearTimingSnapshot,
    setPendingReply,
    clearPendingReply,
  };
};

