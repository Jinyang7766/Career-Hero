import { useEffect, useRef } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import {
  composeInterviewPlan,
  getActiveInterviewFocus,
  getActiveInterviewMode,
  getActiveInterviewType,
  getFallbackPlanByType,
  getInterviewQuestionLimit,
  getLegacyPlanStorageKey,
  getPlanStorageKey,
  getWarmupQuestion,
  sanitizePlanQuestions,
} from '../interview-plan-utils';

type Params = {
  isInterviewMode?: boolean;
  resumeData: any;
  jdText: string;
  interviewPlanConfigKey?: string;
  buildApiUrl: (path: string) => string;
  makeJdKey: (text: string) => string;
  currentUserId?: string;
  planFetchTrigger: number;
  setInterviewPlan: Dispatch<SetStateAction<string[]>>;
  getBackendAuthToken: () => Promise<string>;
  planLoaderMountedRef: MutableRefObject<boolean>;
};

export const useInterviewPlanLoader = ({
  isInterviewMode,
  resumeData,
  jdText,
  interviewPlanConfigKey,
  buildApiUrl,
  makeJdKey,
  currentUserId,
  planFetchTrigger,
  setInterviewPlan,
  getBackendAuthToken,
  planLoaderMountedRef,
}: Params) => {
  const lastLoadIdentityRef = useRef<string>('');
  useEffect(() => {
    if (!isInterviewMode) return;
    if (!resumeData) return;
    const effectiveJdText = (jdText || resumeData.lastJdText || '').trim();
    const storageJdText = effectiveJdText || '__no_jd__';
    const interviewType = getActiveInterviewType();
    const interviewMode = getActiveInterviewMode();
    const interviewFocus = getActiveInterviewFocus();
    const questionLimit = getInterviewQuestionLimit();
    const minExpectedCount = interviewMode === 'simple' ? 3 : 4;
    const storageKey = getPlanStorageKey(resumeData?.id, makeJdKey, storageJdText, interviewFocus, currentUserId);
    const legacyStorageKey = getLegacyPlanStorageKey(resumeData?.id, makeJdKey, storageJdText, interviewFocus);
    const loadIdentity = `${storageKey}|${planFetchTrigger}`;
    if (lastLoadIdentityRef.current === loadIdentity) return;

    try {
      const cached = localStorage.getItem(storageKey) || localStorage.getItem(legacyStorageKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        const cachedMode = String(parsed?.interviewMode || '').trim().toLowerCase();
        if (cachedMode && cachedMode !== interviewMode) {
          try { localStorage.removeItem(storageKey); } catch { }
          try { localStorage.removeItem(legacyStorageKey); } catch { }
          throw new Error('cached_plan_mode_mismatch');
        }
        const cachedSource = String(parsed?.planSource || '').trim().toLowerCase();
        if (cachedSource && cachedSource !== 'model') {
          // Drop stale fallback cache so the next load can attempt real generation.
          try { localStorage.removeItem(storageKey); } catch { }
          try { localStorage.removeItem(legacyStorageKey); } catch { }
        } else if (!cachedSource) {
          // Legacy cache format had no source marker; do not trust to avoid sticky generic plans.
          try { localStorage.removeItem(storageKey); } catch { }
          try { localStorage.removeItem(legacyStorageKey); } catch { }
        }
        const q = composeInterviewPlan(
          interviewType,
          sanitizePlanQuestions(Array.isArray(parsed?.questions) ? parsed.questions : [], interviewType)
        );
        if (q.length >= minExpectedCount && cachedSource === 'model') {
          lastLoadIdentityRef.current = loadIdentity;
          setInterviewPlan(q.slice(0, questionLimit));
          // Migrate legacy cache to user-scoped key to avoid cross-account collisions.
          if (!localStorage.getItem(storageKey)) {
            try {
              localStorage.setItem(storageKey, cached);
            } catch {
              // ignore migration failures
            }
          }
          return;
        }
        // Cached plan shape is suspicious for current mode; force regeneration.
        try { localStorage.removeItem(storageKey); } catch { }
        try { localStorage.removeItem(legacyStorageKey); } catch { }
      }
    } catch {
      // ignore cache parse errors
    }

    const run = async () => {
      lastLoadIdentityRef.current = loadIdentity;
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
        const planSource = String(data?.planSource || '').trim().toLowerCase();
        const isModelPlan = planSource === 'model';
        const finalPlan = composeInterviewPlan(
          interviewType,
          questions.length > 0 ? questions : sanitizePlanQuestions(getFallbackPlanByType(interviewType), interviewType)
        ).slice(0, questionLimit);
        if (planLoaderMountedRef.current) {
          setInterviewPlan(finalPlan);
          // Only cache model-generated plans; avoid sticky fallback plans across sessions.
          if (isModelPlan) {
            try {
              localStorage.setItem(
                storageKey,
                JSON.stringify({ questions: finalPlan, interviewType, interviewMode, interviewFocus, jdText: effectiveJdText, planSource: 'model' })
              );
            } catch { }
          }
        }
      } catch {
        if (planLoaderMountedRef.current) {
          const fallback = composeInterviewPlan(
            interviewType,
            sanitizePlanQuestions(getFallbackPlanByType(interviewType), interviewType)
          ).slice(0, questionLimit);
          setInterviewPlan(fallback);
        }
      }
    };
    run();
  }, [
    buildApiUrl,
    getBackendAuthToken,
    interviewPlanConfigKey,
    isInterviewMode,
    jdText,
    makeJdKey,
    currentUserId,
    planFetchTrigger,
    planLoaderMountedRef,
    resumeData?.id,
    resumeData?.lastJdText,
    setInterviewPlan,
  ]);
};
