import { useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { ChatMessage } from '../types';
import { createMasker, maskChatHistory } from '../chat-payload';
import {
  buildChatRequestBody,
  buildInterviewSummaryPrompt,
  buildInterviewWrappedMessage,
  buildSummaryRequestBody
} from '../chat-request-builders';
import { persistUserDossierToProfile } from '../dossier-persistence';

type AudioOverride = { blob: Blob; url: string; mime: string; duration?: number };

type Params = {
  currentStep: string;
  inputMessage: string;
  setInputMessage: (v: string) => void;
  chatMessagesRef: MutableRefObject<ChatMessage[]>;
  setChatMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  persistInterviewSession: (messages: ChatMessage[], overrideJdText?: string) => Promise<void>;
  persistAnalysisSessionState: (
    state: 'interview_in_progress' | 'paused' | 'interview_done',
    patch?: Partial<{ jdText: string; targetCompany: string; score: number; step: string; error: string; lastMessageAt: string; force: boolean }>
  ) => Promise<void>;
  jdText: string;
  getBackendAuthToken: () => Promise<string>;
  buildApiUrl: (path: string) => string;
  resumeData: any;
  score: number;
  suggestions: any[];
  interviewPlan?: string[];
  plannedQuestionCount?: number;
  isAffirmative: (text: string) => boolean;
  splitNextQuestion: (text: string) => { cleaned: string; next: string };
  stripMarkdownTableSeparators: (text: string) => string;
  formatInterviewQuestion: (q: string) => string;
  isSelfIntroQuestion: (q: string) => boolean;
  onInterviewCompleted?: (summary: string, finalMessages: ChatMessage[]) => void;
};

export const useInterviewChat = ({
  currentStep,
  inputMessage,
  setInputMessage,
  chatMessagesRef,
  setChatMessages,
  persistInterviewSession,
  persistAnalysisSessionState,
  jdText,
  getBackendAuthToken,
  buildApiUrl,
  resumeData,
  score,
  suggestions,
  interviewPlan = [],
  plannedQuestionCount = 0,
  isAffirmative,
  splitNextQuestion,
  stripMarkdownTableSeparators,
  formatInterviewQuestion,
  isSelfIntroQuestion,
  onInterviewCompleted,
}: Params) => {
  const [isSending, setIsSending] = useState(false);
  const sendingCountRef = useRef(0);
  const endingInterviewRef = useRef(false);
  const interviewEndedRef = useRef(false);

  const beginSending = () => {
    sendingCountRef.current += 1;
    setIsSending(true);
  };

  const endSending = () => {
    sendingCountRef.current = Math.max(0, sendingCountRef.current - 1);
    setIsSending(sendingCountRef.current > 0);
  };

  const blobToBase64 = (blob: Blob) =>
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

  const streamInterviewResponse = async ({
    token,
    requestBody,
    baseMessages,
    streamingMessageId,
  }: {
    token: string;
    requestBody: any;
    baseMessages: ChatMessage[];
    streamingMessageId: string;
  }) => {
    const streamEndpoint = buildApiUrl('/api/ai/chat/stream');
    let streamedText = '';
    let doneText = '';
    let incomingBuffer = '';
    let displayedText = '';
    let streamFinished = false;
    let typingTimer: number | null = null;
    let hasRealChunk = false;
    let typingTickAt = Date.now();

    const setStreamingText = (text: string) => {
      setChatMessages(prev => {
        const has = prev.some(msg => msg.id === streamingMessageId);
        if (!has) {
          const next = [...prev, { id: streamingMessageId, role: 'model' as const, text }];
          chatMessagesRef.current = next as ChatMessage[];
          return next;
        }
        const next = prev.map(msg => (
          msg.id === streamingMessageId ? { ...msg, text } : msg
        ));
        chatMessagesRef.current = next as ChatMessage[];
        return next;
      });
    };

    const pumpTyping = () => {
      if (!incomingBuffer) {
        return;
      }
      const now = Date.now();
      const elapsed = Math.max(1, now - typingTickAt);
      typingTickAt = now;

      // Smooth typing speed: adapt batch size to backlog and frame interval.
      const byBacklog =
        incomingBuffer.length > 180 ? 12 :
          incomingBuffer.length > 120 ? 8 :
            incomingBuffer.length > 60 ? 5 :
              incomingBuffer.length > 24 ? 3 : 2;
      const byElapsed = Math.max(1, Math.floor(elapsed / 16));
      const take = Math.min(incomingBuffer.length, Math.max(byBacklog, byElapsed));
      const delta = incomingBuffer.slice(0, take);
      incomingBuffer = incomingBuffer.slice(take);
      displayedText += delta;
      setStreamingText(displayedText);
    };

    const startTypingLoop = () => {
      if (typingTimer) return;
      typingTickAt = Date.now();
      typingTimer = window.setInterval(() => {
        pumpTyping();
      }, 24);
    };

    const stopTypingLoop = () => {
      if (typingTimer) {
        window.clearInterval(typingTimer);
        typingTimer = null;
      }
    };

    const waitForTypingDrain = async (maxMs: number = 2500) => {
      const started = Date.now();
      while (incomingBuffer.length > 0 && (Date.now() - started) < maxMs) {
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    };

    const response = await fetch(streamEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token.trim()}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error((errorData as any).error || 'Backend API failed');
    }

    const contentType = response.headers.get('content-type') || '';
    // Early-return path from backend keeps JSON semantics.
    if (!contentType.includes('text/event-stream')) {
      const result = await response.json().catch(() => ({} as any));
      const fallbackText = String(result?.response || '').trim();
      return fallbackText || '感谢你的回答，我们继续下一题。';
    }

    if (!response.body) {
      throw new Error('流式响应不可用');
    }

    startTypingLoop();

    try {
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
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
              streamedText += delta;
              incomingBuffer += delta;
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

      streamFinished = true;
      if (doneText) {
        if (!hasRealChunk) {
          incomingBuffer += doneText;
        } else if (doneText.startsWith(displayedText)) {
          incomingBuffer += doneText.slice(displayedText.length);
        } else if (doneText !== displayedText) {
          // Non-prefix correction case: switch to authoritative done text.
          displayedText = '';
          incomingBuffer = doneText;
        }
      }
      await waitForTypingDrain();
      pumpTyping();

      const finalText = (doneText || displayedText || streamedText || '').trim();
      if (finalText) return finalText;
      return '感谢你的回答，我们继续下一题。';
    } finally {
      stopTypingLoop();
    }
  };

  const generateInterviewSummary = async (baseMessages: ChatMessage[]) => {
    const token = await getBackendAuthToken();
    if (!token) throw new Error('请先登录以使用 AI 功能');

    const apiEndpoint = buildApiUrl('/api/ai/chat');
    const masker = createMasker();
    const maskedResumeData = masker.maskObject(resumeData);
    const maskedJdText = masker.maskText(jdText || '');
    const maskedChatHistory = maskChatHistory(baseMessages || [], masker.maskText);
    const summaryPrompt = masker.maskText(buildInterviewSummaryPrompt());

    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token.trim()}`
      },
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

  const handleSendMessage = async (
    textOverride?: string,
    audioOverride?: AudioOverride | null,
    opts?: { skipAddUserMessage?: boolean; existingUserMessageId?: string; forceEnd?: boolean }
  ) => {
    const textToSend = (textOverride ?? inputMessage ?? '').toString();
    const hasText = !!textToSend.trim();
    const isEndCommand =
      currentStep === 'chat' &&
      (String(textOverride || '').trim() === '结束面试' || !!opts?.forceEnd);
    if (isEndCommand && (endingInterviewRef.current || interviewEndedRef.current)) return;
    const audioObj = audioOverride || null;
    const hasAudio = !!audioObj?.blob;
    if (!hasText && !hasAudio) return;

    const getExistingUserMessage = () => {
      const id = opts?.existingUserMessageId;
      if (!id) return null;
      const found = chatMessagesRef.current.find(m => m.id === id);
      return found && found.role === 'user' ? found : null;
    };

    const userMessage: ChatMessage = (opts?.skipAddUserMessage && getExistingUserMessage())
      ? (getExistingUserMessage() as ChatMessage)
      : {
        id: `user-${Date.now()}`,
        role: 'user',
        text: hasText ? textToSend : '',
        audioUrl: hasAudio ? audioObj!.url : undefined,
        audioMime: hasAudio ? audioObj!.mime : undefined,
        audioDuration: hasAudio ? (audioOverride as any)?.duration : undefined,
      };

    const baseMessages = opts?.skipAddUserMessage ? chatMessagesRef.current : [...chatMessagesRef.current, userMessage];
    if (!opts?.skipAddUserMessage) {
      chatMessagesRef.current = baseMessages;
      setChatMessages(baseMessages);
      setInputMessage('');
    }

    beginSending();
    try {
      await persistAnalysisSessionState('interview_in_progress', {
        jdText,
        step: 'chat',
        lastMessageAt: new Date().toISOString(),
      });
    } catch (stateErr) {
      console.warn('Failed to persist interview_in_progress state:', stateErr);
    }

    try {
      if (isEndCommand) {
        endingInterviewRef.current = true;
        const summaryRaw = await generateInterviewSummary(baseMessages);
        const summary = stripMarkdownTableSeparators(summaryRaw);
        const aiMessage: ChatMessage = {
          id: `ai-summary-${Date.now()}`,
          role: 'model',
          text: summary || '已结束面试，但总结生成失败，请稍后重试。'
        };
        const finalMessages = [...baseMessages, aiMessage];
        chatMessagesRef.current = finalMessages;
        setChatMessages(finalMessages);
        await persistInterviewSession(finalMessages, jdText);
        try {
          await persistAnalysisSessionState('interview_done', {
            jdText,
            step: 'comparison',
            lastMessageAt: new Date().toISOString(),
            force: true,
          });
        } catch (stateErr) {
          console.warn('Failed to persist interview_done state:', stateErr);
        }
        try {
          await persistUserDossierToProfile({
            source: 'interview',
            score,
            summary: summary || '面试已结束',
            jdText,
            targetCompany: String((resumeData as any)?.targetCompany || '').trim(),
            suggestionsTotal: Array.isArray(suggestions) ? suggestions.length : 0,
          });
        } catch (dossierErr) {
          console.warn('Failed to persist interview dossier to user profile:', dossierErr);
        }
        if (onInterviewCompleted) {
          try {
            onInterviewCompleted(summary || '', finalMessages);
          } catch (cbErr) {
            console.warn('onInterviewCompleted callback failed:', cbErr);
          }
        }
        interviewEndedRef.current = true;
        return;
      }

      const token = await getBackendAuthToken();
      if (!token) throw new Error('请先登录以使用 AI 功能');

      const masker = createMasker();
      const isInterviewChat = currentStep === 'chat';
      const cleanTextForWrap = hasText ? textToSend : (hasAudio ? '（语音回答，见音频附件）' : '');
      const detectFollowUpNeed = (raw: string) => {
        const text = String(raw || '').trim();
        if (!text) return { shouldFollowUp: false, hint: '' };
        const normalized = text.replace(/\s+/g, '');
        const isShort = normalized.length < 18;
        const hasNumberEvidence = /(\d+(\.\d+)?%?)|(\d+\s*(ms|s|秒|天|周|月|年|人|次|万|百万|亿元|k|K|w|W))/i.test(text);
        const vagueWords = ['负责', '参与', '很多', '一些', '一般', '还行', '差不多', '优化了', '提升了', '做过', '了解'];
        const uncertainWords = ['记不清', '不太清楚', '不确定', '可能', '大概', '应该', '差不多'];
        const vagueHits = vagueWords.filter((w) => text.includes(w)).length;
        const uncertainHits = uncertainWords.filter((w) => text.includes(w)).length;
        const shouldFollowUp = isShort || uncertainHits > 0 || (vagueHits >= 2 && !hasNumberEvidence);
        const reasons: string[] = [];
        if (isShort) reasons.push('回答过短');
        if (uncertainHits > 0) reasons.push('不确定表达较多');
        if (vagueHits >= 2 && !hasNumberEvidence) reasons.push('缺少量化证据');
        return {
          shouldFollowUp,
          hint: reasons.join('、') || '细节不够具体',
        };
      };
      const followUpDecision = isInterviewChat && hasText
        ? detectFollowUpNeed(textToSend)
        : { shouldFollowUp: false, hint: '' };
      const answeredCountAtThisTurn = baseMessages.filter((m) => {
        if (m.role !== 'user') return false;
        const txt = String(m.text || '').trim();
        const hasTextAnswer = !!txt && txt !== '结束面试';
        const hasVoiceAnswer = !!m.audioUrl || !!m.audioPending;
        return hasTextAnswer || hasVoiceAnswer;
      }).length;
      const isClosingPhase = (
        isInterviewChat &&
        plannedQuestionCount > 0 &&
        answeredCountAtThisTurn >= plannedQuestionCount
      );
      const normalizedFollowUpDecision = isClosingPhase
        ? { shouldFollowUp: false, hint: '' }
        : followUpDecision;
      const strictNextQuestion = (
        isInterviewChat &&
        !normalizedFollowUpDecision.shouldFollowUp &&
        Array.isArray(interviewPlan) &&
        interviewPlan.length > answeredCountAtThisTurn
      )
        ? formatInterviewQuestion(String(interviewPlan[answeredCountAtThisTurn] || ''))
        : '';
      const lastMsgBeforeUser = (() => {
        const last = baseMessages[baseMessages.length - 1];
        if (last && last.id === userMessage.id && baseMessages.length >= 2) return baseMessages[baseMessages.length - 2];
        return last;
      })();
      const isStartPhase =
        !!lastMsgBeforeUser &&
        (lastMsgBeforeUser.id === 'ai-ask' || lastMsgBeforeUser.text.includes('准备好'));

      const interviewWrapped = buildInterviewWrappedMessage({
        isInterviewChat,
        isStartPhase,
        cleanTextForWrap,
        isAffirmative,
        hasText,
        textToSend,
        hasAudio,
        shouldFollowUp: normalizedFollowUpDecision.shouldFollowUp,
        followUpHint: normalizedFollowUpDecision.hint,
        forcedNextQuestion: strictNextQuestion,
        shouldEnterClosing: isClosingPhase && !strictNextQuestion,
      });

      const maskedMessage = masker.maskText(interviewWrapped);
      const maskedResumeData = masker.maskObject(resumeData);
      const historyForBackend = baseMessages.filter(m => m.id !== userMessage.id);
      const maskedChatHistory = maskChatHistory(historyForBackend, masker.maskText);
      const maskedJdText = masker.maskText(jdText || '');

      const audioPayload = hasAudio
        ? (() => {
          const durRaw = (audioOverride as any)?.duration ?? userMessage.audioDuration;
          const dur = Number(durRaw);
          const payload: any = {
            mime_type: audioObj!.mime,
            data: null as any,
          };
          if (Number.isFinite(dur) && dur > 0) payload.duration_sec = Math.round(dur);
          return payload;
        })()
        : null;

      if (audioPayload) {
        audioPayload.data = await blobToBase64(audioObj!.blob);
      }

      const requestBody = buildChatRequestBody({
        message: maskedMessage,
        audio: audioPayload,
        resumeData: maskedResumeData,
        diagnosisDossier: null,
        jobDescription: maskedJdText,
        chatHistory: maskedChatHistory,
        score,
        suggestions,
        isInterviewChat,
        interviewType: isInterviewChat ? (localStorage.getItem('ai_interview_type') || 'general') : undefined
      });

      const streamId = `ai-stream-${Date.now()}`;
      const unmaskedText = masker.unmaskText(await streamInterviewResponse({
        token,
        requestBody,
        baseMessages,
        streamingMessageId: streamId,
      }));

      const safeText = String(unmaskedText || '').replace(/\*/g, '').trim();
      if (safeText === '结束面试') {
        await handleSendMessage('结束面试', null, { skipAddUserMessage: true, forceEnd: true });
        return;
      }
      const { cleaned, next } = splitNextQuestion(safeText);
      const aiMessage: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'model',
        text: (cleaned || safeText).trim()
      };
      let finalMessages: ChatMessage[] = [...baseMessages, aiMessage];
      if (strictNextQuestion) {
        const nextMsg: ChatMessage = {
          id: `ai-next-${Date.now()}`,
          role: 'model',
          text: isSelfIntroQuestion(strictNextQuestion) ? strictNextQuestion : `下一题：${strictNextQuestion}`
        };
        finalMessages = [...finalMessages, nextMsg];
      } else if (next) {
        const formattedQ = formatInterviewQuestion(next);
        const nextMsg: ChatMessage = {
          id: `ai-next-${Date.now()}`,
          role: 'model',
          text: isSelfIntroQuestion(formattedQ) ? formattedQ : `下一题：${formattedQ}`
        };
        finalMessages = [...finalMessages, nextMsg];
      }
      chatMessagesRef.current = finalMessages;
      setChatMessages(finalMessages);
      await persistInterviewSession(finalMessages, jdText);
      try {
        await persistAnalysisSessionState('interview_in_progress', {
          jdText,
          step: 'chat',
          lastMessageAt: new Date().toISOString(),
        });
      } catch (stateErr) {
        console.warn('Failed to refresh interview_in_progress state:', stateErr);
      }

    } catch (error) {
      console.error('API failed:', error);
      try {
        await persistAnalysisSessionState('paused', {
          jdText,
          step: 'chat',
          error: (error as any)?.message || 'interview_interrupted',
          force: true,
        });
      } catch (stateErr) {
        console.warn('Failed to persist paused interview state:', stateErr);
      }
      if (hasAudio && !hasText && !opts?.skipAddUserMessage) {
        const filtered = chatMessagesRef.current.filter(m => m.id !== userMessage.id);
        chatMessagesRef.current = filtered;
        setChatMessages(filtered);
        if (audioObj?.url) {
          try { URL.revokeObjectURL(audioObj.url); } catch { }
        }
      }
      alert('AI 连接暂时中断');
    } finally {
      if (isEndCommand) {
        endingInterviewRef.current = false;
      }
      endSending();
    }
  };

  return {
    isSending,
    blobToBase64,
    handleSendMessage,
  };
};
