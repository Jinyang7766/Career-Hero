import { useEffect, useRef } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { ChatMessage } from '../types';

type Params = {
  isInterviewMode?: boolean;
  microInterviewFirstQuestion?: string;
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
  microInterviewFirstQuestion,
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

  const getInterviewType = () => {
    try {
      const t = String(localStorage.getItem('ai_interview_type') || '').trim().toLowerCase();
      if (t === 'technical' || t === 'hr' || t === 'general') return t;
    } catch {
      // ignore
    }
    return 'general';
  };

  const buildIntroTexts = (userName: string) => {
    const greeting = userName ? `${userName}，您好！` : '您好！';
    const interviewType = getInterviewType();
    const hasJd = !!String(jdText || '').trim();
    const generalWarmup =
      '请先做一个1分钟的自我介绍，重点突出与你目标岗位最相关的经历与优势。';
    const technicalWarmup =
      '你最引以为傲的职业成就是什么？或者一个你最近解决过的棘手问题是什么？';
    const hrWarmup =
      '请用三个关键词定义你的个人工作风格，并分别说明一个真实体现该关键词的例子。';

    if (!isInterviewMode) {
      const immediateQuestion = String(
        microInterviewFirstQuestion ||
        resumeData?.analysisSnapshot?.microInterviewFirstQuestion ||
        ''
      ).trim();
      return {
        summary: `${greeting}我是您的 AI 微访谈助手。${hasJd ? '我会结合简历与职位描述，' : '我会结合你的简历，'}围绕诊断里信息不足的点做追问，帮助你补齐关键证据。`,
        ask: immediateQuestion || '先从最关键的一条开始：请补充一个你最能体现岗位匹配度的项目/经历，尽量包含动作、数据和结果。'
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

    chatIntroScheduledRef.current = true;
    setChatInitialized(true);

    let userName = '';
    if (resumeData?.personalInfo?.name) {
      const fullName = resumeData.personalInfo.name;
      if (fullName.includes(' ')) {
        userName = fullName.split(' ').pop() || fullName;
      } else if (fullName.length >= 2) {
        userName = fullName.slice(-2);
      } else {
        userName = fullName;
      }
    }

    const intro = buildIntroTexts(userName);
    const summaryMessage: ChatMessage = {
      id: 'ai-summary',
      role: 'model',
      text: intro.summary
    };
    setChatMessages(prev => (prev.some(m => m.id === summaryMessage.id) ? prev : [...prev, summaryMessage]));

    if (askTimerRef.current) {
      window.clearTimeout(askTimerRef.current);
      askTimerRef.current = null;
    }
    askTimerRef.current = window.setTimeout(() => {
      const askMessage: ChatMessage = {
        id: 'ai-ask',
        role: 'model',
        text: intro.ask
      };
      setChatMessages(prev => (prev.some(m => m.id === askMessage.id) ? prev : [...prev, askMessage]));
      askTimerRef.current = null;
    }, 900);
  }, [currentStep, chatInitialized, isInterviewMode, microInterviewFirstQuestion, jdText, resumeData?.personalInfo?.name, resumeData?.analysisSnapshot?.microInterviewFirstQuestion, chatIntroScheduledRef, chatMessagesRef, setChatInitialized, setChatMessages]);
};
