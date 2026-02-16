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

type AudioOverride = { blob: Blob; url: string; mime: string; duration?: number };

type Params = {
  currentStep: string;
  inputMessage: string;
  setInputMessage: (v: string) => void;
  chatMessagesRef: MutableRefObject<ChatMessage[]>;
  setChatMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  persistInterviewSession: (messages: ChatMessage[], overrideJdText?: string) => Promise<void>;
  jdText: string;
  getBackendAuthToken: () => Promise<string>;
  buildApiUrl: (path: string) => string;
  resumeData: any;
  score: number;
  suggestions: any[];
  isAffirmative: (text: string) => boolean;
  isEndInterviewCommand: (text: string) => boolean;
  splitNextQuestion: (text: string) => { cleaned: string; next: string };
  stripMarkdownTableSeparators: (text: string) => string;
  formatInterviewQuestion: (q: string) => string;
  isSelfIntroQuestion: (q: string) => boolean;
};

export const useInterviewChat = ({
  currentStep,
  inputMessage,
  setInputMessage,
  chatMessagesRef,
  setChatMessages,
  persistInterviewSession,
  jdText,
  getBackendAuthToken,
  buildApiUrl,
  resumeData,
  score,
  suggestions,
  isAffirmative,
  isEndInterviewCommand,
  splitNextQuestion,
  stripMarkdownTableSeparators,
  formatInterviewQuestion,
  isSelfIntroQuestion,
}: Params) => {
  const [isSending, setIsSending] = useState(false);
  const sendingCountRef = useRef(0);

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
    opts?: { skipAddUserMessage?: boolean; existingUserMessageId?: string }
  ) => {
    const textToSend = (textOverride ?? inputMessage ?? '').toString();
    const hasText = !!textToSend.trim();
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
      if (!opts?.skipAddUserMessage && currentStep === 'chat' && hasText && isEndInterviewCommand(textToSend)) {
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
        return;
      }

      const token = await getBackendAuthToken();
      if (!token) throw new Error('请先登录以使用 AI 功能');

      const apiEndpoint = buildApiUrl('/api/ai/chat');
      const masker = createMasker();
      const isInterviewChat = currentStep === 'chat';
      const cleanTextForWrap = hasText ? textToSend : (hasAudio ? '（语音回答，见音频附件）' : '');
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

      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token.trim()}`
        },
        body: JSON.stringify(buildChatRequestBody({
          message: maskedMessage,
          audio: audioPayload,
          resumeData: maskedResumeData,
          jobDescription: maskedJdText,
          chatHistory: maskedChatHistory,
          score,
          suggestions,
          isInterviewChat
        }))
      });

      if (response.ok) {
        const result = await response.json();
        const unmaskedText = masker.unmaskText(result.response || '感谢你的回答，我们继续下一题。');
        const safeText = String(unmaskedText || '').replace(/\*/g, '').trim();
        const { cleaned, next } = splitNextQuestion(safeText);
        const aiMessage: ChatMessage = {
          id: `ai-${Date.now()}`,
          role: 'model',
          text: (cleaned || safeText).trim()
        };
        let finalMessages: ChatMessage[] = [...baseMessages, aiMessage];
        if (next) {
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
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error((errorData as any).error || 'Backend API failed');
      }
    } catch (error) {
      console.error('API failed:', error);
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
      endSending();
    }
  };

  return {
    isSending,
    blobToBase64,
    handleSendMessage,
  };
};
