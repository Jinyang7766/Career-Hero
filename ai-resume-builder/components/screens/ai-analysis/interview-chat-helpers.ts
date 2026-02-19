import type { ChatMessage } from './types';

export const getEndChatCommand = (isInterviewMode?: boolean) =>
  isInterviewMode ? '结束面试' : '结束微访谈';

export const countInterviewAnsweredMessages = (messages: ChatMessage[]) =>
  messages.filter((m) => {
    if (m.role !== 'user') return false;
    const txt = String(m.text || '').trim();
    const hasTextAnswer = !!txt && txt !== '结束面试' && txt !== '结束微访谈';
    const hasVoiceAnswer = !!m.audioUrl || !!m.audioPending;
    return hasTextAnswer || hasVoiceAnswer;
  }).length;

