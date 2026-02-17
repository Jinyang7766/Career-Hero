import { useEffect } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { ChatMessage } from '../types';

type Params = {
  currentStep: string;
  chatMessagesLength: number;
  chatMessagesRef: MutableRefObject<ChatMessage[]>;
  chatIntroScheduledRef: MutableRefObject<boolean>;
  setChatInitialized: (v: boolean) => void;
  setChatMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  resumeData: any;
  jdText: string;
};

export const useChatIntroMessages = ({
  currentStep,
  chatMessagesLength,
  chatMessagesRef,
  chatIntroScheduledRef,
  setChatInitialized,
  setChatMessages,
  resumeData,
  jdText,
}: Params) => {
  useEffect(() => {
    if (currentStep !== 'chat') {
      chatIntroScheduledRef.current = false;
      setChatInitialized(false);
    }
  }, [currentStep, chatIntroScheduledRef, setChatInitialized]);

  useEffect(() => {
    if (currentStep !== 'chat') return;
    if (chatIntroScheduledRef.current) return;
    if (chatMessagesLength !== 0) return;

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

    const t1 = window.setTimeout(() => {
      const greeting = userName ? `${userName}，您好！` : '您好！';
      const summaryMessage: ChatMessage = {
        id: 'ai-summary',
        role: 'model',
        text: `${greeting}我是您的 AI 模拟面试官。${jdText ? '我已经阅读了您的简历和目标职位描述，' : '我已经阅读了您的简历，'}接下来将基于这些信息对您进行模拟面试。每题会给出点评、改进要点与参考回复。`
      };
      setChatMessages(prev => (prev.some(m => m.id === summaryMessage.id) ? prev : [...prev, summaryMessage]));
    }, 1000);

    const t2 = window.setTimeout(() => {
      const askMessage: ChatMessage = {
        id: 'ai-ask',
        role: 'model',
        text: '请问您准备好开始模拟面试了吗？您可以随时告诉我开始，我会根据您的简历和岗位要求提出面试问题。'
      };
      setChatMessages(prev => (prev.some(m => m.id === askMessage.id) ? prev : [...prev, askMessage]));
    }, 2500);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [currentStep, chatMessagesLength, jdText, resumeData?.personalInfo?.name, chatIntroScheduledRef, chatMessagesRef, setChatInitialized, setChatMessages]);
};
