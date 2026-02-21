import { useEffect, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { ChatMessage } from '../types';
import { createMasker, maskChatHistory } from '../chat-payload';
import {
  buildChatRequestBody,
  buildInterviewWrappedMessage,
} from '../chat-request-builders';
import { persistUserDossierToProfile } from '../dossier-persistence';
import { getActiveInterviewType } from '../interview-plan-utils';
import { generateInterviewSummary, streamInterviewResponse } from '../interview-chat-api';
import { normalizeInterviewReplyText, shouldTreatAsFollowUpSignal } from '../interview-chat-text';
import { useInterviewChatStorage } from './useInterviewChatStorage';
import {
  buildFallbackInterviewSummary,
  countUserAnswers,
  findPendingQuestion,
  isUnusableInterviewSummary,
  type InterviewAnswerTiming,
} from '../chat-session-utils';

type AudioOverride = { blob: Blob; url: string; mime: string; duration?: number };

type Params = {
  currentUserId?: string;
  isInterviewMode?: boolean;
  currentStep: string;
  inputMessage: string;
  setInputMessage: (v: string) => void;
  chatMessagesRef: MutableRefObject<ChatMessage[]>;
  setChatMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  persistInterviewSession: (messages: ChatMessage[], overrideJdText?: string) => Promise<void>;
  persistAnalysisSessionState: (
    state: 'interview_in_progress' | 'paused' | 'interview_done',
    patch?: Partial<{ jdText: string; targetCompany: string; score: number; step: string; error: string; lastMessageAt: string; interviewSummary: string; force: boolean }>
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
  onInterviewCompleted?: (
    summary: string,
    finalMessages: ChatMessage[],
    options?: { skipSummary?: boolean }
  ) => void;
  onInterviewReportGenerating?: () => void;
  onInterviewReportFailed?: () => void;
};

export const useInterviewChat = ({
  currentUserId,
  isInterviewMode = false,
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
  onInterviewReportGenerating,
  onInterviewReportFailed,
}: Params) => {
  const [isSending, setIsSending] = useState(false);
  const [hasPendingReply, setHasPendingReply] = useState(false);
  const [currentQuestionElapsedSec, setCurrentQuestionElapsedSec] = useState(0);
  const sendingCountRef = useRef(0);
  const endingInterviewRef = useRef(false);
  const interviewEndedRef = useRef(false);
  const pendingReplayRef = useRef<string>('');
  const activeRequestAbortRef = useRef<AbortController | null>(null);
  const activeRequestKeyRef = useRef<string>('');
  const suppressedAbortKeysRef = useRef<Set<string>>(new Set());
  const activeQuestionMessageIdRef = useRef<string>('');
  const activeQuestionStartAtRef = useRef<number>(0);
  const answerTimingsRef = useRef<InterviewAnswerTiming[]>([]);
  const {
    getPendingReplyKey,
    getTimingStorageKey,
    persistTimingSnapshot,
    clearTimingSnapshot,
    setPendingReply,
    clearPendingReply,
  } = useInterviewChatStorage({
    currentUserId,
    resumeData,
    jdText,
    isInterviewMode,
    answerTimingsRef,
    activeQuestionMessageIdRef,
    activeQuestionStartAtRef,
    setCurrentQuestionElapsedSec,
    setHasPendingReply,
  });

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

  const handleSendMessage = async (
    textOverride?: string,
    audioOverride?: AudioOverride | null,
    opts?: { skipAddUserMessage?: boolean; existingUserMessageId?: string; forceEnd?: boolean; skipCurrentQuestion?: boolean; suppressErrorAlert?: boolean }
  ) => {
    const requestKey = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const requestAbortController = new AbortController();
    activeRequestAbortRef.current = requestAbortController;
    activeRequestKeyRef.current = requestKey;
    const textToSend = (textOverride ?? inputMessage ?? '').toString();
    const hasText = !!textToSend.trim();
    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const normalizedTextOverride = String(textOverride || '').trim();
    const isManualEndCommand = normalizedTextOverride === '结束面试' || normalizedTextOverride === '结束微访谈';
    const isEndCommand =
      isManualEndCommand || !!opts?.forceEnd;
    const isSkipCurrentQuestion = !!opts?.skipCurrentQuestion;
    const suppressErrorAlert = !!opts?.suppressErrorAlert;
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
    if (isInterviewMode && !isEndCommand && !opts?.skipAddUserMessage) {
      const answeredBefore = countUserAnswers(chatMessagesRef.current || []);
      const questionNo = answeredBefore + 1;
      const elapsedSec = activeQuestionStartAtRef.current > 0
        ? Math.max(1, Math.round((Date.now() - activeQuestionStartAtRef.current) / 1000))
        : 0;
      const question = findPendingQuestion(chatMessagesRef.current || [], isSelfIntroQuestion);
      answerTimingsRef.current = [
        ...answerTimingsRef.current,
        {
          questionNo,
          seconds: elapsedSec,
          questionText: question?.text || '',
          recordedAt: new Date().toISOString(),
        },
      ];
      activeQuestionMessageIdRef.current = '';
      activeQuestionStartAtRef.current = 0;
      setCurrentQuestionElapsedSec(0);
      persistTimingSnapshot();
    }

    const baseMessages = opts?.skipAddUserMessage ? chatMessagesRef.current : [...chatMessagesRef.current, userMessage];
    if (!opts?.skipAddUserMessage) {
      chatMessagesRef.current = baseMessages;
      setChatMessages(baseMessages);
      setInputMessage('');
      try {
        await persistInterviewSession(baseMessages, jdText);
      } catch (persistErr) {
        console.warn('Failed to persist interview session after user message:', persistErr);
      }
    }
    if (!isEndCommand && hasText && !hasAudio) {
      setPendingReply({
        requestId,
        text: String(textToSend || '').trim(),
        userMessageId: userMessage.id,
        createdAt: new Date().toISOString(),
      });
    }

    beginSending();
    if (!isEndCommand) {
      try {
        await persistAnalysisSessionState('interview_in_progress', {
          jdText,
          step: 'chat',
          lastMessageAt: new Date().toISOString(),
        });
      } catch (stateErr) {
        console.warn('Failed to persist interview_in_progress state:', stateErr);
      }
    }

    try {
      if (isEndCommand) {
        endingInterviewRef.current = true;
        if (isInterviewMode) {
          // Enter loading state immediately so "end interview" click always has visible feedback.
          onInterviewReportGenerating?.();
        }
        if (!isInterviewMode) {
          const finalMessages = [...baseMessages];
          chatMessagesRef.current = finalMessages;
          setChatMessages(finalMessages);
          clearPendingReply();
          await persistInterviewSession(finalMessages, jdText);
          try {
            await persistAnalysisSessionState('interview_done', {
              jdText,
              step: 'final_report',
              lastMessageAt: new Date().toISOString(),
              force: true,
            });
          } catch (stateErr) {
            console.warn('Failed to persist interview_done state for micro interview:', stateErr);
          }
          if (onInterviewCompleted) {
            try {
              onInterviewCompleted('', finalMessages, { skipSummary: true });
            } catch (cbErr) {
              console.warn('onInterviewCompleted callback failed:', cbErr);
            }
          }
          interviewEndedRef.current = true;
          clearTimingSnapshot();
          return;
        }
        let summary = '';
        try {
          const summaryRaw = await generateInterviewSummary({
            baseMessages,
            signal: requestAbortController.signal,
            getBackendAuthToken,
            buildApiUrl,
            resumeData,
            jdText,
            score,
            answerTimings: answerTimingsRef.current || [],
          });
          const cleaned = stripMarkdownTableSeparators(summaryRaw);
          summary = isUnusableInterviewSummary(cleaned)
            ? buildFallbackInterviewSummary(baseMessages, answerTimingsRef.current || [])
            : cleaned;
        } catch (summaryErr) {
          console.warn('Interview summary generation failed, using fallback summary:', summaryErr);
          summary = buildFallbackInterviewSummary(baseMessages, answerTimingsRef.current || []);
        }
        const finalMessages = [...baseMessages];
        chatMessagesRef.current = finalMessages;
        setChatMessages(finalMessages);
        clearPendingReply();
        await persistInterviewSession(finalMessages, jdText);
        try {
          await persistAnalysisSessionState('interview_done', {
            jdText,
            step: 'interview_report',
            lastMessageAt: new Date().toISOString(),
            interviewSummary: summary || '',
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
        clearTimingSnapshot();
        return;
      }

      const token = await getBackendAuthToken();
      if (!token) throw new Error('请先登录以使用 AI 功能');

      const masker = createMasker();
      const isInterviewChat = !!isInterviewMode;
      const isMicroInterview = !isInterviewChat && currentStep === 'chat';
      const cleanTextForWrap = hasText ? textToSend : (hasAudio ? '（语音回答，见音频附件）' : '');
      const detectFollowUpNeed = (raw: string) => {
        const text = String(raw || '').trim();
        if (!text) return { shouldFollowUp: false, hint: '' };
        const normalized = text.replace(/\s+/g, '');
        const isShort = normalized.length < 18;
        const hasNumberEvidence = /(\d+(\.\d+)?%?)|(\d+\s*(ms|s|秒|天|周|月|年|人|次|万|百万|亿元|k|K|w|W))/i.test(text);
        const hasActionEvidence = /(负责|主导|推进|制定|设计|执行|落地|优化|搭建|复盘|拆解|调整|实施|改造|推动|协调|分析了|我做了|我通过|通过.+(优化|调整|分析|改造))/i.test(text);
        const hasDataKeyword = /(gmv|roi|ctr|cvr|uv|pv|客单价|转化率|点击率|留存率|复购率|曝光|订单量|营收|成本|毛利|投产比|客诉率|退款率|履约率|nps)/i.test(text);
        const hasDataEvidence = hasNumberEvidence || hasDataKeyword;
        const hasResultEvidence = /(提升|增长|下降|降低|减少|改善|达成|实现|结果|产出|收益|效果|拉升|优化后|最终|同比|环比)/i.test(text);
        const structureHitCount = [hasActionEvidence, hasDataEvidence, hasResultEvidence].filter(Boolean).length;
        const vagueWords = ['负责', '参与', '很多', '一些', '一般', '还行', '差不多', '优化了', '提升了', '做过', '了解'];
        const uncertainWords = ['记不清', '不太清楚', '不确定', '可能', '大概', '应该', '差不多'];
        const vagueHits = vagueWords.filter((w) => text.includes(w)).length;
        const uncertainHits = uncertainWords.filter((w) => text.includes(w)).length;
        const missingStructuredFields: string[] = [];
        if (!hasActionEvidence) missingStructuredFields.push('动作');
        if (!hasDataEvidence) missingStructuredFields.push('数据');
        if (!hasResultEvidence) missingStructuredFields.push('结果');
        const lacksStructuredEvidence = structureHitCount < 2;
        const shouldFollowUp =
          isShort ||
          uncertainHits > 0 ||
          (vagueHits >= 2 && !hasNumberEvidence) ||
          lacksStructuredEvidence;
        const reasons: string[] = [];
        if (isShort) reasons.push('回答过短');
        if (uncertainHits > 0) reasons.push('不确定表达较多');
        if (vagueHits >= 2 && !hasNumberEvidence) reasons.push('缺少量化证据');
        if (lacksStructuredEvidence) reasons.push(`结构化信息不足（动作/数据/结果至少需覆盖两项，当前缺少：${missingStructuredFields.join('、') || '关键要素'}）`);
        return {
          shouldFollowUp,
          hint: reasons.join('、') || '细节不够具体',
        };
      };
      const followUpDecision = isInterviewChat && hasText && !isSkipCurrentQuestion
        ? detectFollowUpNeed(textToSend)
        : { shouldFollowUp: false, hint: '' };
      const answeredCountAtThisTurn = baseMessages.filter((m) => {
        if (m.role !== 'user') return false;
        const txt = String(m.text || '').trim();
        const hasTextAnswer = !!txt && txt !== '结束面试' && txt !== '结束微访谈';
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
        isMicroInterview,
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
        skipCurrentQuestion: isSkipCurrentQuestion,
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
        interviewType: isInterviewChat ? getActiveInterviewType() : undefined
      });

      const streamId = `ai-stream-${Date.now()}`;
      const unmaskedText = masker.unmaskText(await streamInterviewResponse({
        token,
        requestBody,
        streamingMessageId: streamId,
        signal: requestAbortController.signal,
        buildApiUrl,
        setStreamingText: (text: string) => {
          setChatMessages(prev => {
            const has = prev.some(msg => msg.id === streamId);
            if (!has) {
              const next = [...prev, { id: streamId, role: 'model' as const, text }];
              chatMessagesRef.current = next as ChatMessage[];
              return next;
            }
            const next = prev.map(msg => (
              msg.id === streamId ? { ...msg, text } : msg
            ));
            chatMessagesRef.current = next as ChatMessage[];
            return next;
          });
        },
      }));

      const safeText = normalizeInterviewReplyText(unmaskedText);
      if (safeText === '结束面试' || safeText === '结束微访谈') {
        const endToken = isInterviewChat ? '结束面试' : '结束微访谈';
        await handleSendMessage(endToken, null, { skipAddUserMessage: true, forceEnd: true });
        return;
      }
      const parsedReply = isInterviewChat
        ? splitNextQuestion(safeText)
        : { cleaned: safeText, next: '' };
      const aiSignalsFollowUp = isInterviewChat && shouldTreatAsFollowUpSignal(parsedReply.cleaned || safeText || '');
      const shouldBlockNextQuestion = Boolean(
        isInterviewChat &&
        (normalizedFollowUpDecision.shouldFollowUp || aiSignalsFollowUp)
      );
      const canEnterNextQuestion =
        !shouldBlockNextQuestion &&
        (
          !isInterviewChat ||
          plannedQuestionCount <= 0 ||
          answeredCountAtThisTurn < plannedQuestionCount
        );
      const cleaned = shouldBlockNextQuestion
        ? String(parsedReply.cleaned || safeText || '')
          .replace(/(?:\n|^)\s*(下一题|下一道问题|下一道具体问题|下一个问题)\s*[:：][\s\S]*$/u, '')
          .trim()
        : parsedReply.cleaned;
      const next = canEnterNextQuestion ? parsedReply.next : '';
      const aiMessage: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'model',
        text: (cleaned || safeText).trim()
      };
      let finalMessages: ChatMessage[] = [...baseMessages, aiMessage];
      if (strictNextQuestion && !shouldBlockNextQuestion) {
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
      clearPendingReply();
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
      const errName = String((error as any)?.name || '');
      const errMsg = String((error as any)?.message || '');
      const isAbortError =
        errName === 'AbortError' ||
        /abort(ed)?/i.test(errName) ||
        /abort(ed)?/i.test(errMsg);
      const isSuppressedAbort = isAbortError && suppressedAbortKeysRef.current.has(requestKey);
      if (isAbortError) {
        if (isSuppressedAbort) {
          clearPendingReply();
        }
        return;
      }
      if (isEndCommand) {
        if (!isInterviewMode) {
          // End-micro-interview is a local completion path; do not block UI on persistence hiccups.
          const finalMessages = [...baseMessages];
          chatMessagesRef.current = finalMessages;
          setChatMessages(finalMessages);
          clearPendingReply();
          if (onInterviewCompleted) {
            try {
              onInterviewCompleted('', finalMessages, { skipSummary: true });
            } catch (cbErr) {
              console.warn('onInterviewCompleted callback failed after end fallback:', cbErr);
            }
          }
          interviewEndedRef.current = true;
          return;
        }
        onInterviewReportFailed?.();
      }
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
      if (!suppressErrorAlert) {
        alert('AI 连接暂时中断');
      }
    } finally {
      suppressedAbortKeysRef.current.delete(requestKey);
      if (activeRequestKeyRef.current === requestKey) {
        activeRequestKeyRef.current = '';
        activeRequestAbortRef.current = null;
      }
      if (isEndCommand) {
        endingInterviewRef.current = false;
      }
      endSending();
    }
  };

  const interruptCurrentThinking = () => {
    const activeKey = String(activeRequestKeyRef.current || '').trim();
    if (activeKey) {
      suppressedAbortKeysRef.current.add(activeKey);
    }
    try {
      activeRequestAbortRef.current?.abort();
    } catch {
      // ignore abort failures
    }
  };

  useEffect(() => {
    if (!isInterviewMode || currentStep !== 'chat') return;
    try {
      const raw = localStorage.getItem(getTimingStorageKey()) || '';
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
      answerTimingsRef.current = entries
        .map((item: any) => ({
          questionNo: Number(item?.questionNo) || 0,
          seconds: Math.max(0, Number(item?.seconds) || 0),
          questionText: String(item?.questionText || '').trim(),
          recordedAt: String(item?.recordedAt || '').trim() || new Date().toISOString(),
        }))
        .filter((item: InterviewAnswerTiming) => item.questionNo > 0);
      activeQuestionMessageIdRef.current = String(parsed?.activeQuestionMessageId || '').trim();
      activeQuestionStartAtRef.current = Math.max(0, Number(parsed?.activeQuestionStartedAt) || 0);
    } catch (err) {
      console.warn('Failed to restore interview timing snapshot:', err);
    }
  }, [isInterviewMode, currentStep]);

  useEffect(() => {
    if (!isInterviewMode || currentStep !== 'chat') return;
    const tick = () => {
      if ((chatMessagesRef.current || []).length === 0) {
        if (answerTimingsRef.current.length || activeQuestionMessageIdRef.current) {
          clearTimingSnapshot();
        }
        return;
      }
      const pendingQuestion = findPendingQuestion(chatMessagesRef.current || [], isSelfIntroQuestion);
      if (!pendingQuestion) {
        if (activeQuestionMessageIdRef.current) {
          activeQuestionMessageIdRef.current = '';
          activeQuestionStartAtRef.current = 0;
          setCurrentQuestionElapsedSec(0);
          persistTimingSnapshot();
        }
        return;
      }
      if (activeQuestionMessageIdRef.current !== pendingQuestion.messageId) {
        activeQuestionMessageIdRef.current = pendingQuestion.messageId;
        activeQuestionStartAtRef.current = Date.now();
        setCurrentQuestionElapsedSec(0);
        persistTimingSnapshot();
        return;
      }
      if (activeQuestionStartAtRef.current <= 0) {
        activeQuestionStartAtRef.current = Date.now();
        persistTimingSnapshot();
      }
      const elapsed = Math.max(0, Math.floor((Date.now() - activeQuestionStartAtRef.current) / 1000));
      setCurrentQuestionElapsedSec(elapsed);
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [isInterviewMode, currentStep]);

  useEffect(() => {
    if (!isInterviewMode) {
      clearTimingSnapshot();
      return;
    }
    if (currentStep !== 'chat') {
      setCurrentQuestionElapsedSec(0);
    }
  }, [isInterviewMode, currentStep]);

  useEffect(() => {
    if (currentStep !== 'chat') return;
    try {
      const raw = localStorage.getItem(getPendingReplyKey()) || '';
      setHasPendingReply(!!raw);
    } catch {
      setHasPendingReply(false);
    }
  }, [currentStep]);

  useEffect(() => {
    if (currentStep !== 'chat') return;
    if (isSending) return;
    let raw = '';
    try {
      raw = localStorage.getItem(getPendingReplyKey()) || '';
    } catch {
      raw = '';
    }
    if (!raw) return;
    let pending: any = null;
    try {
      pending = JSON.parse(raw);
    } catch {
      clearPendingReply();
      return;
    }
    const requestId = String(pending?.requestId || '').trim();
    const pendingText = String(pending?.text || '').trim();
    const pendingUserMessageId = String(pending?.userMessageId || '').trim();
    const replayCount = Math.max(0, Number(pending?.replayCount) || 0);
    const createdAt = Date.parse(String(pending?.createdAt || ''));
    if (!requestId || !pendingText || !pendingUserMessageId) {
      clearPendingReply();
      return;
    }
    if (Number.isFinite(createdAt) && (Date.now() - createdAt) > 10 * 60 * 1000) {
      clearPendingReply();
      return;
    }
    // Guard: avoid repeated auto-replay loops when page keeps remounting while backend/network is unstable.
    if (replayCount >= 1) {
      clearPendingReply();
      return;
    }
    if (pendingReplayRef.current === requestId) return;

    const msgs = chatMessagesRef.current || [];
    const userIdx = msgs.findIndex((m) => m.id === pendingUserMessageId && m.role === 'user');
    if (userIdx < 0) {
      clearPendingReply();
      return;
    }
    const hasModelAfter = msgs.slice(userIdx + 1).some((m) => m.role === 'model' && String(m.text || '').trim().length > 0);
    if (hasModelAfter) {
      clearPendingReply();
      return;
    }

    pendingReplayRef.current = requestId;
    try {
      localStorage.setItem(getPendingReplyKey(), JSON.stringify({
        ...pending,
        replayCount: replayCount + 1,
      }));
    } catch {
      // ignore write failures
    }
    void handleSendMessage(
      pendingText,
      null,
      { skipAddUserMessage: true, existingUserMessageId: pendingUserMessageId, suppressErrorAlert: true }
    );
  }, [currentStep, isSending]);

  return {
    isSending,
    hasPendingReply,
    currentQuestionElapsedSec,
    blobToBase64,
    interruptCurrentThinking,
    handleSendMessage,
  };
};
