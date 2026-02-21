import { createMasker, maskChatHistory } from './chat-payload';
import {
  buildInterviewSummaryPrompt,
  buildSummaryRequestBody,
} from './chat-request-builders';
import { buildTimingContextForSummary, type InterviewAnswerTiming } from './chat-session-utils';
import type { ChatMessage } from './types';

export const streamInterviewResponse = async ({
  token,
  requestBody,
  streamingMessageId,
  signal,
  buildApiUrl,
  setStreamingText,
}: {
  token: string;
  requestBody: any;
  streamingMessageId: string;
  signal?: AbortSignal;
  buildApiUrl: (path: string) => string;
  setStreamingText: (text: string) => void;
}) => {
  const streamEndpoint = buildApiUrl('/api/ai/chat/stream');
  const perf = (typeof performance !== 'undefined' && performance && typeof performance.now === 'function')
    ? performance
    : null;
  const traceId = `iv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = perf ? perf.now() : Date.now();
  let firstEventAt: number | null = null;
  let streamedText = '';
  let doneText = '';
  let hasRealChunk = false;

  const response = await fetch(streamEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token.trim()}`,
    },
    signal,
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error((errorData as any).error || 'Backend API failed');
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/event-stream')) {
    const result = await response.json().catch(() => ({} as any));
    const fallbackText = String(result?.response || '').trim();
    const finishedAt = perf ? perf.now() : Date.now();
    const totalMs = Math.max(0, finishedAt - startedAt);
    console.info('[InterviewLatency]', {
      traceId,
      mode: 'json_fallback',
      totalMs: Number(totalMs.toFixed(1)),
      hasText: !!fallbackText,
    });
    if (!fallbackText) {
      throw new Error('empty_ai_response_json');
    }
    return fallbackText;
  }

  if (!response.body) {
    throw new Error('流式响应不可用');
  }

  let chunkCount = 0;
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (firstEventAt === null) {
      firstEventAt = perf ? perf.now() : Date.now();
    }
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf('\n\n');

      const lines = rawEvent.split('\n').map(line => line.trim());
      const dataLines = lines.filter(line => line.startsWith('data:'));
      if (!dataLines.length) continue;
      const dataRaw = dataLines.map(line => line.slice(5).trim()).join('');
      if (!dataRaw) continue;

      try {
        const payload = JSON.parse(dataRaw);
        const type = String(payload?.type || '');
        if (type === 'chunk') {
          const delta = String(payload?.delta || '');
          if (!delta) continue;
          hasRealChunk = true;
          chunkCount += 1;
          streamedText += delta;
          setStreamingText(streamedText);
        } else if (type === 'done') {
          doneText = String(payload?.text || '').trim();
        } else if (type === 'error') {
          throw new Error(String(payload?.message || '流式面试失败'));
        }
      } catch (parseError) {
        console.warn('Failed to parse SSE payload:', parseError);
      }
    }
  }

  const finalText = (doneText || streamedText || '').trim();
  if (finalText && finalText !== streamedText) {
    setStreamingText(finalText);
  }
  const finishedAt = perf ? perf.now() : Date.now();
  const totalMs = Math.max(0, finishedAt - startedAt);
  const firstEventMs = firstEventAt === null ? -1 : Math.max(0, firstEventAt - startedAt);
  console.info('[InterviewLatency]', {
    traceId,
    mode: 'sse',
    firstEventMs: Number(firstEventMs.toFixed(1)),
    totalMs: Number(totalMs.toFixed(1)),
    chunkCount,
    hasDoneText: !!doneText,
    hasRealChunk,
    finalLen: finalText.length,
    streamingMessageId,
  });
  if (finalText) return finalText;
  throw new Error('empty_ai_response_stream');
};

export const generateInterviewSummary = async ({
  baseMessages,
  signal,
  getBackendAuthToken,
  buildApiUrl,
  resumeData,
  jdText,
  score,
  answerTimings,
}: {
  baseMessages: ChatMessage[];
  signal?: AbortSignal;
  getBackendAuthToken: () => Promise<string>;
  buildApiUrl: (path: string) => string;
  resumeData: any;
  jdText: string;
  score: number;
  answerTimings: InterviewAnswerTiming[];
}) => {
  const token = await getBackendAuthToken();
  if (!token) throw new Error('请先登录以使用 AI 功能');

  const apiEndpoint = buildApiUrl('/api/ai/chat');
  const masker = createMasker();
  const maskedResumeData = masker.maskObject(resumeData);
  const maskedJdText = masker.maskText(jdText || '');
  const maskedChatHistory = maskChatHistory(baseMessages || [], masker.maskText);
  const summaryPrompt = masker.maskText(
    buildInterviewSummaryPrompt(buildTimingContextForSummary(answerTimings || []))
  );

  const response = await fetch(apiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token.trim()}`
    },
    signal,
    body: JSON.stringify(buildSummaryRequestBody({
      message: summaryPrompt,
      resumeData: maskedResumeData,
      jobDescription: maskedJdText,
      chatHistory: maskedChatHistory,
      score
    }))
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error((errorData as any)?.error || '总结生成失败');
  }

  const result = await response.json().catch(() => ({} as any));
  const unmaskedText = masker.unmaskText(result?.response || '');
  return String(unmaskedText || '').trim();
};

