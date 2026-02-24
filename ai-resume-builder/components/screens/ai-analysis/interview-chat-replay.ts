import type { ChatMessage } from './types';

export type ReplayCandidate = {
  requestId: string;
  text: string;
  userMessageId: string;
  replayCount: number;
  createdAtMs: number;
  rawPayload: any;
};

export const blobToBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || '');
      const idx = res.indexOf('base64,');
      resolve(idx >= 0 ? res.slice(idx + 7) : res);
    };
    reader.onerror = () => reject(new Error('read failed'));
    reader.readAsDataURL(blob);
  });

export const parseReplayCandidate = (raw: string): ReplayCandidate | null => {
  if (!raw) return null;
  try {
    const pending = JSON.parse(raw);
    const requestId = String(pending?.requestId || '').trim();
    const text = String(pending?.text || '').trim();
    const userMessageId = String(pending?.userMessageId || '').trim();
    const replayCount = Math.max(0, Number(pending?.replayCount) || 0);
    const createdAtMs = Date.parse(String(pending?.createdAt || ''));
    if (!requestId || !text || !userMessageId) return null;
    return {
      requestId,
      text,
      userMessageId,
      replayCount,
      createdAtMs,
      rawPayload: pending,
    };
  } catch {
    return null;
  }
};

export const hasModelReplyAfterUserMessage = (messages: ChatMessage[], userMessageId: string) => {
  const userIdx = messages.findIndex((m) => m.id === userMessageId && m.role === 'user');
  if (userIdx < 0) return null;
  const hasModelAfter = messages
    .slice(userIdx + 1)
    .some((m) => m.role === 'model' && String(m.text || '').trim().length > 0);
  return hasModelAfter;
};
