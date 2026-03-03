import type { ChatMessage } from '../types';

export const AI_AVATAR_FALLBACK =
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Hiroshi&top=shortHair&clothing=blazerAndShirt';

export const shouldShowMessageFeedback = (msg: ChatMessage) => {
  if (msg.role !== 'model') return false;
  const id = String(msg.id || '').trim();
  const text = String(msg.text || '').trim();
  if (!text) return false;
  if (id === 'ai-summary') return false;
  const greetingLike =
    /您好|你好/.test(text) &&
    /我是您的\s*AI|我是你的\s*AI|模拟面试官|压力面试官|HR面试官|复试深挖面试官/.test(text);
  return !greetingLike;
};

export const formatElapsedTime = (sec: number) => {
  const safe = Math.max(0, Number(sec) || 0);
  const mm = Math.floor(safe / 60).toString().padStart(2, '0');
  const ss = Math.floor(safe % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
};
