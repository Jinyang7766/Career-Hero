import type { ChatMessage } from './types';

export const getEndChatCommand = (isInterviewMode?: boolean) =>
  isInterviewMode ? '结束面试' : '结束微访谈';

const NEXT_QUESTION_PREFIX_RE = /^(下一题|下一道问题|下一道具体问题|下一个问题)\s*[:：]/u;

// Progress should advance only after AI explicitly enters the next question,
// not immediately when user sends a message.
export const countInterviewAnsweredMessages = (messages: ChatMessage[]) =>
  messages.filter((m) => {
    if (m.role !== 'model') return false;
    const txt = String(m.text || '').trim();
    if (!txt) return false;
    if (txt.startsWith('SYSTEM_')) return false;
    return NEXT_QUESTION_PREFIX_RE.test(txt);
  }).length;
