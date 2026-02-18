import { useEffect } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import {
  composeInterviewPlan,
  getActiveInterviewFocus,
  getActiveInterviewMode,
  getActiveInterviewType,
  getFallbackPlanByType,
  getInterviewQuestionLimit,
  getPlanStorageKey,
  getWarmupQuestion,
  sanitizePlanQuestions,
} from '../interview-plan-utils';

type Params = {
  isInterviewMode?: boolean;
  resumeData: any;
  jdText: string;
  buildApiUrl: (path: string) => string;
  makeJdKey: (text: string) => string;
  planFetchTrigger: number;
  setInterviewPlan: Dispatch<SetStateAction<string[]>>;
  getBackendAuthToken: () => Promise<string>;
  planLoaderMountedRef: MutableRefObject<boolean>;
};

export const useInterviewPlanLoader = ({
  isInterviewMode,
  resumeData,
  jdText,
  buildApiUrl,
  makeJdKey,
  planFetchTrigger,
  setInterviewPlan,
  getBackendAuthToken,
  planLoaderMountedRef,
}: Params) => {
  useEffect(() => {
    if (!isInterviewMode) return;
    if (!resumeData) return;
    const effectiveJdText = (jdText || resumeData.lastJdText || '').trim();
    if (!effectiveJdText) return;
    const interviewType = getActiveInterviewType();
    const interviewMode = getActiveInterviewMode();
    const interviewFocus = getActiveInterviewFocus();
    const questionLimit = getInterviewQuestionLimit();
    const storageKey = getPlanStorageKey(resumeData?.id, makeJdKey, effectiveJdText, interviewFocus);

    try {
      const cached = localStorage.getItem(storageKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        const q = composeInterviewPlan(
          interviewType,
          sanitizePlanQuestions(Array.isArray(parsed?.questions) ? parsed.questions : [], interviewType)
        );
        if (q.length > 0) {
          setInterviewPlan(q.slice(0, questionLimit));
          return;
        }
      }
    } catch {
      // ignore cache parse errors
    }

    const run = async () => {
      try {
        setInterviewPlan(prev => {
          if (prev.length > 0) return prev;
          return [getWarmupQuestion(interviewType)];
        });

        const token = await getBackendAuthToken();
        if (!token) {
          const fallback = composeInterviewPlan(
            interviewType,
            sanitizePlanQuestions(getFallbackPlanByType(interviewType), interviewType)
          ).slice(0, questionLimit);
          if (planLoaderMountedRef.current) setInterviewPlan(fallback);
          return;
        }
        const resp = await fetch(buildApiUrl('/api/ai/chat'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token.trim()}`,
          },
          body: JSON.stringify({
            mode: 'interview_plan',
            message: '请生成本场面试题单',
            resumeData,
            jobDescription: effectiveJdText,
            chatHistory: [],
            interviewType,
            interviewMode,
            questionLimit,
            interviewFocus,
          }),
        });
        const data = await resp.json().catch(() => ({} as any));
        const questions = sanitizePlanQuestions(Array.isArray(data?.questions) ? data.questions : [], interviewType);
        const finalPlan = composeInterviewPlan(
          interviewType,
          questions.length > 0 ? questions : sanitizePlanQuestions(getFallbackPlanByType(interviewType), interviewType)
        ).slice(0, questionLimit);
        if (planLoaderMountedRef.current) {
          setInterviewPlan(finalPlan);
          try { localStorage.setItem(storageKey, JSON.stringify({ questions: finalPlan, interviewType, interviewMode, interviewFocus, jdText: effectiveJdText })); } catch { }
        }
      } catch {
        if (planLoaderMountedRef.current) {
          const fallback = composeInterviewPlan(
            interviewType,
            sanitizePlanQuestions(getFallbackPlanByType(interviewType), interviewType)
          ).slice(0, questionLimit);
          setInterviewPlan(fallback);
          try { localStorage.setItem(storageKey, JSON.stringify({ questions: fallback, interviewType, interviewMode, interviewFocus, jdText: effectiveJdText })); } catch { }
        }
      }
    };
    run();
  }, [
    buildApiUrl,
    getBackendAuthToken,
    isInterviewMode,
    jdText,
    makeJdKey,
    planFetchTrigger,
    planLoaderMountedRef,
    resumeData,
    setInterviewPlan,
  ]);
};
