import { useEffect } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { ChatMessage } from '../types';

type Params = {
  currentStep: string;
  chatMessagesRef: MutableRefObject<ChatMessage[]>;
  chatIntroScheduledRef: MutableRefObject<boolean>;
  setChatInitialized: (v: boolean) => void;
  setChatMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  resumeData: any;
  jdText: string;
};

export const useChatIntroMessages = ({
  currentStep,
  chatMessagesRef,
  chatIntroScheduledRef,
  setChatInitialized,
  setChatMessages,
  resumeData,
  jdText,
}: Params) => {
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

    if (interviewType === 'technical') {
      return {
        summary: `${greeting}我是您的 AI 技术面试官。${hasJd ? '我已结合您的简历和目标岗位 JD，' : '我已阅读您的简历，'}接下来将重点围绕项目技术方案、架构设计与性能优化进行深挖。`,
        ask: '我们直接进入技术面。请先挑一个你最有代表性的项目，简要说明你的职责、技术栈以及最核心的技术挑战。'
      };
    }

    if (interviewType === 'hr') {
      return {
        summary: `${greeting}我是您的 AI HR 面试官。${hasJd ? '我已结合您的简历和目标岗位 JD，' : '我已阅读您的简历，'}接下来将重点考察你的动机匹配度、沟通协作和职业稳定性。`,
        ask: '我们直接开始 HR 面。请先用 STAR 结构讲一个你与同事出现分歧并最终达成一致的真实案例。'
      };
    }

    return {
      summary: `${greeting}我是您的 AI 模拟面试官。${hasJd ? '我已经阅读了您的简历和目标职位描述，' : '我已经阅读了您的简历，'}接下来将基于这些信息对您进行模拟面试。每题会给出点评、改进要点与参考回复。`,
      ask: '请先做一个1分钟的自我介绍，重点突出与你目标岗位最相关的经历与优势。'
    };
  };

  useEffect(() => {
    if (currentStep !== 'chat') {
      chatIntroScheduledRef.current = false;
      setChatInitialized(false);
    }
  }, [currentStep, chatIntroScheduledRef, setChatInitialized]);

  useEffect(() => {
    if (currentStep !== 'chat') return;
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

    const t2 = window.setTimeout(() => {
      const askMessage: ChatMessage = {
        id: 'ai-ask',
        role: 'model',
        text: intro.ask
      };
      setChatMessages(prev => (prev.some(m => m.id === askMessage.id) ? prev : [...prev, askMessage]));
    }, 900);

    return () => {
      window.clearTimeout(t2);
    };
  }, [currentStep, jdText, resumeData?.personalInfo?.name, chatIntroScheduledRef, chatMessagesRef, setChatInitialized, setChatMessages]);
};
