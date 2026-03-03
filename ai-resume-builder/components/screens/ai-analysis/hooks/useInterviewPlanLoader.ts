import { useEffect, useRef } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import {
  composeInterviewPlan,
  getActiveInterviewFocus,
  getActiveInterviewType,
  getFallbackPlanByType,
  getInterviewQuestionLimit,
  getLegacyPlanStorageKey,
  getPlanStorageKey,
  sanitizePlanQuestions,
} from '../interview-plan-utils';

type Params = {
  isInterviewMode?: boolean;
  resumeData: any;
  jdText: string;
  targetCompany: string;
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
  targetCompany,
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
    const interviewFocus = getActiveInterviewFocus();
    const questionLimit = getInterviewQuestionLimit();
    const planGenerationLimit = questionLimit;
    const minExpectedCount = 4;
    const effectiveTargetCompany = String(targetCompany || resumeData?.targetCompany || '').trim();
    const resumeId = String(resumeData?.id || '').trim() || 'unknown';
    const scopedUserId = String(currentUserId || '').trim() || 'anonymous';
    const forceModelPlanKey = `ai_interview_force_model_plan_once:${scopedUserId}:${resumeId}`;
    const forceModelPlan = (() => {
      try {
        return localStorage.getItem(forceModelPlanKey) === '1';
      } catch {
        return false;
      }
    })();
    const storageKey = getPlanStorageKey(
      resumeData?.id,
      makeJdKey,
      storageJdText,
      interviewFocus,
      effectiveTargetCompany,
      currentUserId
    );
    const legacyStorageKey = getLegacyPlanStorageKey(
      resumeData?.id,
      makeJdKey,
      storageJdText,
      interviewFocus,
      effectiveTargetCompany
    );
    const loadIdentity = `${storageKey}|${planFetchTrigger}`;
    if (lastLoadIdentityRef.current === loadIdentity) return;

    try {
      const cached = forceModelPlan ? null : (localStorage.getItem(storageKey) || localStorage.getItem(legacyStorageKey));
      if (cached) {
        const parsed = JSON.parse(cached);
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
            sanitizePlanQuestions(
              Array.isArray(parsed?.questions) ? parsed.questions : [],
              interviewType,
              {
                minCount: 4,
                maxCount: planGenerationLimit,
              }
            )
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
        // Cached plan shape is suspicious for current scene; force regeneration.
        try { localStorage.removeItem(storageKey); } catch { }
        try { localStorage.removeItem(legacyStorageKey); } catch { }
      }
    } catch {
      // ignore cache parse errors
    }

    const run = async () => {
      lastLoadIdentityRef.current = loadIdentity;
      try {
        const token = await getBackendAuthToken();
        if (!token) {
          if (forceModelPlan) {
            if (planLoaderMountedRef.current) setInterviewPlan([]);
            return;
          }
          const fallback = composeInterviewPlan(
            interviewType,
            sanitizePlanQuestions(getFallbackPlanByType(interviewType), interviewType, {
              minCount: 4,
              maxCount: planGenerationLimit,
            })
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
            questionLimit: planGenerationLimit,
            interviewFocus,
          }),
        });
        const data = await resp.json().catch(() => ({} as any));
        const questions = sanitizePlanQuestions(
          Array.isArray(data?.questions) ? data.questions : [],
          interviewType,
          {
            minCount: 4,
            maxCount: planGenerationLimit,
          }
        );
        const planSource = String(data?.planSource || '').trim().toLowerCase();
        const isModelPlan = planSource === 'model';
        if (forceModelPlan && !isModelPlan) {
          if (planLoaderMountedRef.current) setInterviewPlan([]);
          return;
        }
        const finalPlan = composeInterviewPlan(
          interviewType,
          questions.length > 0
            ? questions
            : sanitizePlanQuestions(getFallbackPlanByType(interviewType), interviewType, {
              minCount: 4,
              maxCount: planGenerationLimit,
            })
        ).slice(0, questionLimit);
        if (planLoaderMountedRef.current) {
          setInterviewPlan(finalPlan);
          if (isModelPlan) {
            try { localStorage.removeItem(forceModelPlanKey); } catch { }
          }
          // Only cache model-generated plans; avoid sticky fallback plans across sessions.
          if (isModelPlan) {
            try {
              localStorage.setItem(
                storageKey,
                JSON.stringify({ questions: finalPlan, interviewType, interviewFocus, jdText: effectiveJdText, planSource: 'model' })
              );
            } catch { }
          }
        }
      } catch {
        if (planLoaderMountedRef.current) {
          if (forceModelPlan) {
            setInterviewPlan([]);
            return;
          }
          const fallback = composeInterviewPlan(
            interviewType,
            sanitizePlanQuestions(getFallbackPlanByType(interviewType), interviewType, {
              minCount: 4,
              maxCount: planGenerationLimit,
            })
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
    targetCompany,
    setInterviewPlan,
  ]);
};
