import { useEffect, useRef } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { ChatMessage } from '../types';
import { getActiveInterviewFocus, getActiveInterviewMode, getActiveInterviewType } from '../interview-plan-utils';
import { makeJdKey } from '../id-utils';

type Params = {
  isInterviewMode?: boolean;
  currentStep: string;
  chatInitialized: boolean;
  chatMessagesRef: MutableRefObject<ChatMessage[]>;
  chatIntroScheduledRef: MutableRefObject<boolean>;
  setChatInitialized: (v: boolean) => void;
  setChatMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  resumeData: any;
  jdText: string;
};

export const useChatIntroMessages = ({
  isInterviewMode = false,
  currentStep,
  chatInitialized,
  chatMessagesRef,
  chatIntroScheduledRef,
  setChatInitialized,
  setChatMessages,
  resumeData,
  jdText,
}: Params) => {
  const askTimerRef = useRef<number | null>(null);
  const summaryTimerRefs = useRef<number[]>([]);
  const hasText = (value: any) => String(value ?? '').trim().length > 0;
  const splitSentences = (input: string) => {
    const source = String(input || '').trim();
    if (!source) return [];
    const matches = source.match(/[^。！？!?；;]+[。！？!?；;]?/g);
    if (!matches) return [source];
    return matches.map((segment) => segment.trim()).filter(Boolean);
  };
  const compactIntroSegments = (segments: string[]) => {
    const list = Array.isArray(segments) ? segments.filter(Boolean) : [];
    if (list.length <= 3) {
      return list.length ? [list.join('')] : [];
    }
    return [list.slice(0, 3).join(''), ...list.slice(3)];
  };
  const resolveUserName = () => {
    if (!resumeData?.personalInfo?.name) return '';
    const fullName = String(resumeData.personalInfo.name || '').trim();
    if (!fullName) return '';
    if (fullName.includes(' ')) {
      return fullName.split(' ').pop() || fullName;
    }
    if (fullName.length >= 2) {
      return fullName.slice(-2);
    }
    return fullName;
  };
  const normalizeSceneText = (value: any) =>
    String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const hasPersistedHistory = () => {
    const sessions = (resumeData as any)?.interviewSessions || {};
    const list = Object.values(sessions || {}) as any[];
    if (!list.length) return false;
    const expectedChatMode = isInterviewMode ? 'interview' : 'analysis';
    const effectiveJdText = String(jdText || resumeData?.lastJdText || '').trim();
    const effectiveJdKey = makeJdKey(effectiveJdText || '__no_jd__');
    const expectedType = String(getActiveInterviewType() || '').trim().toLowerCase();
    const expectedMode = String(getActiveInterviewMode() || '').trim().toLowerCase();
    const expectedFocus = normalizeSceneText(getActiveInterviewFocus());
    const expectedCompany = normalizeSceneText((resumeData as any)?.targetCompany || '');
    const expectedResumeId = String((resumeData as any)?.id || '').trim();
    return list.some((session: any) => {
      const messages = Array.isArray(session?.messages) ? session.messages : [];
      if (!messages.length) return false;
      const chatMode = String(session?.chatMode || '').trim().toLowerCase();
      if (!chatMode || chatMode !== expectedChatMode) return false;
      if (isInterviewMode) {
        const sessionType = String(session?.interviewType || '').trim().toLowerCase();
        const sessionMode = String(session?.interviewMode || '').trim().toLowerCase();
        const sessionFocus = normalizeSceneText(session?.interviewFocus);
        const sessionCompany = normalizeSceneText(session?.targetCompany);
        const sessionResumeId = String(session?.resumeId || '').trim();
        if (sessionType !== expectedType) return false;
        if (sessionMode !== expectedMode) return false;
        if (sessionFocus !== expectedFocus) return false;
        if (sessionCompany !== expectedCompany) return false;
        if (sessionResumeId !== expectedResumeId) return false;
      } else {
        const sessionResumeId = String(session?.resumeId || '').trim();
        if (sessionResumeId && sessionResumeId !== expectedResumeId) return false;
      }
      const sessionJdKey =
        String(session?.jdKey || '').trim() ||
        makeJdKey(String(session?.jdText || '').trim() || '__no_jd__');
      return sessionJdKey === effectiveJdKey;
    });
  };

  const buildIntroTexts = (userName: string) => {
    const greeting = userName ? `${userName}，您好！` : '您好！';
    const interviewType = getActiveInterviewType();
    const hasJd = !!String(jdText || '').trim();
    const generalWarmup =
      '请先做一个1分钟的自我介绍，重点突出与你目标岗位最相关的经历与优势。';
    const technicalWarmup =
      '你最引以为傲的职业成就是什么？或者一个你最近解决过的棘手问题是什么？';
    const hrWarmup =
      '请用三个关键词定义你的个人工作风格，并分别说明一个真实体现该关键词的例子。';

    if (!isInterviewMode) {
      return {
        summary: `${greeting}我是您的 AI 职业助手。${hasJd ? '我会结合简历与职位描述，' : '我会结合你的简历，'}围绕诊断里信息不足的点做追问，帮助你补齐关键证据。`,
        ask: '先从最关键的一条开始：请补充一个你最能体现岗位匹配度的项目/经历，尽量包含动作、数据和结果。'
      };
    }

    if (interviewType === 'technical') {
      return {
        summary: `${greeting}我是您的 AI 复试深挖面试官。${hasJd ? '我已结合您的简历和目标岗位职位描述，' : '我已阅读您的简历，'}接下来将重点围绕与你岗位相关的专业能力、项目方法与问题解决过程进行深挖。`,
        ask: technicalWarmup
      };
    }

    if (interviewType === 'hr') {
      return {
        summary: `${greeting}我是您的 AI HR 面试官。${hasJd ? '我已结合您的简历和目标岗位职位描述，' : '我已阅读您的简历，'}接下来将重点考察你的动机匹配度、沟通协作和职业稳定性。`,
        ask: hrWarmup
      };
    }

    return {
      summary: `${greeting}我是您的 AI 模拟面试官。${hasJd ? '我已经阅读了您的简历和目标职位描述，' : '我已经阅读了您的简历，'}接下来将基于这些信息对您进行模拟面试。每题会给出点评、改进要点与参考回复。`,
      ask: generalWarmup
    };
  };

  useEffect(() => {
    if (currentStep !== 'chat') {
      if (summaryTimerRefs.current.length) {
        summaryTimerRefs.current.forEach((timer) => window.clearTimeout(timer));
        summaryTimerRefs.current = [];
      }
      if (askTimerRef.current) {
        window.clearTimeout(askTimerRef.current);
        askTimerRef.current = null;
      }
      chatIntroScheduledRef.current = false;
      setChatInitialized(false);
    }
  }, [currentStep, chatIntroScheduledRef, setChatInitialized]);

  useEffect(() => {
    if (currentStep !== 'chat') return;
    if (chatInitialized) return;
    if (chatIntroScheduledRef.current) return;
    if (chatMessagesRef.current.length !== 0) return;
    if (hasPersistedHistory()) {
      // History exists and may still be restoring into chatMessages state; do not inject intro again.
      setChatInitialized(true);
      return;
    }

    chatIntroScheduledRef.current = true;
    setChatInitialized(true);

    const intro = buildIntroTexts(resolveUserName());
    const summarySentences = splitSentences(intro.summary);
    const summarySegments = compactIntroSegments(
      summarySentences.length ? summarySentences : [String(intro.summary || '').trim()]
    );
    if (summarySegments.length > 0 && summarySegments[0]) {
      const firstMessage: ChatMessage = {
        id: 'ai-summary-0',
        role: 'model',
        text: summarySegments[0],
      };
      setChatMessages((prev) => (prev.some((m) => m.id === firstMessage.id) ? prev : [...prev, firstMessage]));
    }

    const perSentenceDelayMs = 420;
    if (summaryTimerRefs.current.length) {
      summaryTimerRefs.current.forEach((timer) => window.clearTimeout(timer));
      summaryTimerRefs.current = [];
    }
    for (let i = 1; i < summarySegments.length; i += 1) {
      const timer = window.setTimeout(() => {
        const message: ChatMessage = {
          id: `ai-summary-${i}`,
          role: 'model',
          text: summarySegments[i],
        };
        setChatMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
      }, i * perSentenceDelayMs);
      summaryTimerRefs.current.push(timer);
    }

    if (askTimerRef.current) {
      window.clearTimeout(askTimerRef.current);
      askTimerRef.current = null;
    }
    const askDelayMs = Math.max(1, summarySegments.length) * perSentenceDelayMs + 280;
    askTimerRef.current = window.setTimeout(() => {
      const askMessage: ChatMessage = {
        id: 'ai-ask',
        role: 'model',
        text: intro.ask
      };
      setChatMessages(prev => (prev.some(m => m.id === askMessage.id) ? prev : [...prev, askMessage]));
      if (summaryTimerRefs.current.length) {
        summaryTimerRefs.current = [];
      }
      askTimerRef.current = null;
    }, askDelayMs);
  }, [currentStep, chatInitialized, isInterviewMode, jdText, resumeData?.personalInfo?.name, resumeData?.interviewSessions, resumeData?.lastJdText, chatIntroScheduledRef, chatMessagesRef, setChatInitialized, setChatMessages]);

  useEffect(() => {
    if (currentStep !== 'chat') return;
    if (chatIntroScheduledRef.current && (askTimerRef.current || summaryTimerRefs.current.length)) return;
    const messages = Array.isArray(chatMessagesRef.current) ? chatMessagesRef.current : [];
    if (!messages.length) return;
    const introOnly = messages.every((m) => {
      const id = String((m as any)?.id || '').trim();
      return (m as any)?.role === 'model' && (id === 'ai-ask' || id === 'ai-summary' || id.startsWith('ai-summary-'));
    });
    if (!introOnly) return;
    const hasValidSummary = messages.some((m) => String((m as any)?.id || '').trim().startsWith('ai-summary') && hasText((m as any)?.text));
    const hasValidAsk = messages.some((m) => String((m as any)?.id || '').trim() === 'ai-ask' && hasText((m as any)?.text));
    if (hasValidSummary && hasValidAsk) return;

    const intro = buildIntroTexts(resolveUserName());
    const summarySentences = splitSentences(intro.summary);
    const summarySegments = compactIntroSegments(
      summarySentences.length ? summarySentences : [String(intro.summary || '').trim()]
    );
    const repaired: ChatMessage[] = [
      ...summarySegments.map((segment, idx) => ({
        id: `ai-summary-${idx}`,
        role: 'model' as const,
        text: segment,
      })),
      { id: 'ai-ask', role: 'model', text: intro.ask },
    ];
    setChatMessages(repaired);
    if (!chatInitialized) {
      setChatInitialized(true);
    }
  }, [currentStep, chatInitialized, isInterviewMode, jdText, resumeData?.personalInfo?.name, chatMessagesRef, setChatInitialized, setChatMessages]);
};
