import type { ChatMessage } from './types';
import {
  detectFollowUpNeed,
  resolveReverseQaState,
  type FollowUpDecision,
  type ReverseQaResolution,
} from './interview-chat-decision';

type BuildInterviewTurnPipelineParams = {
  baseMessages: ChatMessage[];
  userMessageId: string;
  textToSend: string;
  hasText: boolean;
  isInterviewChat: boolean;
  isSkipCurrentQuestion: boolean;
  plannedQuestionCount: number;
  interviewPlan: string[];
  formatInterviewQuestion: (q: string) => string;
  reverseQaActive: boolean;
  reverseQaAskedCount: number;
  reverseQaMax: number;
};

export type InterviewTurnPipelineResult = {
  answeredCountAtThisTurn: number;
  isClosingPhase: boolean;
  normalizedFollowUpDecision: FollowUpDecision;
  reverseQaResolution: ReverseQaResolution;
  strictNextQuestion: string;
  isStartPhase: boolean;
};

const NO_FOLLOW_UP: FollowUpDecision = {
  shouldFollowUp: false,
  hint: '',
};

const countAnsweredUserMessages = (messages: ChatMessage[]): number =>
  messages.filter((message) => {
    if (message.role !== 'user') return false;
    const text = String(message.text || '').trim();
    const hasTextAnswer = !!text && text !== '结束面试';
    const hasVoiceAnswer = !!message.audioUrl || !!message.audioPending;
    return hasTextAnswer || hasVoiceAnswer;
  }).length;

const findLastMessageBeforeUser = (
  messages: ChatMessage[],
  userMessageId: string
): ChatMessage | undefined => {
  const last = messages[messages.length - 1];
  if (last && last.id === userMessageId && messages.length >= 2) {
    return messages[messages.length - 2];
  }
  return last;
};

export const buildInterviewTurnPipeline = ({
  baseMessages,
  userMessageId,
  textToSend,
  hasText,
  isInterviewChat,
  isSkipCurrentQuestion,
  plannedQuestionCount,
  interviewPlan,
  formatInterviewQuestion,
  reverseQaActive,
  reverseQaAskedCount,
  reverseQaMax,
}: BuildInterviewTurnPipelineParams): InterviewTurnPipelineResult => {
  const followUpDecision = isInterviewChat && hasText && !isSkipCurrentQuestion
    ? detectFollowUpNeed(textToSend)
    : NO_FOLLOW_UP;
  const answeredCountAtThisTurn = countAnsweredUserMessages(baseMessages);
  const isClosingPhase = (
    isInterviewChat &&
    plannedQuestionCount > 0 &&
    answeredCountAtThisTurn >= plannedQuestionCount
  );
  const normalizedFollowUpDecision = isClosingPhase
    ? NO_FOLLOW_UP
    : followUpDecision;
  const reverseQaResolution = resolveReverseQaState({
    isInterviewChat,
    isClosingPhase,
    hasText,
    textToSend,
    reverseQaActive,
    reverseQaAskedCount,
    reverseQaMax,
  });
  const inReverseQa = reverseQaResolution.inReverseQa;
  const strictNextQuestion = (
    isInterviewChat &&
    !inReverseQa &&
    !normalizedFollowUpDecision.shouldFollowUp &&
    interviewPlan.length > answeredCountAtThisTurn
  )
    ? formatInterviewQuestion(String(interviewPlan[answeredCountAtThisTurn] || ''))
    : '';
  const lastMsgBeforeUser = findLastMessageBeforeUser(baseMessages, userMessageId);
  const isStartPhase = !!lastMsgBeforeUser &&
    (lastMsgBeforeUser.id === 'ai-ask' || String(lastMsgBeforeUser.text || '').includes('准备好'));

  return {
    answeredCountAtThisTurn,
    isClosingPhase,
    normalizedFollowUpDecision,
    reverseQaResolution,
    strictNextQuestion,
    isStartPhase,
  };
};
