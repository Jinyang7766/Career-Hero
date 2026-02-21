import React from 'react';
import { getActiveInterviewMode, getActiveInterviewType } from '../interview-plan-utils';

type Params = {
  clearInterviewSession: () => Promise<void>;
  clearInterviewSceneState: () => Promise<void>;
  setPostInterviewSummary: (value: string) => void;
  setChatMessages: (messages: any[]) => void;
  setChatInitialized: (value: boolean) => void;
  resumeData: any;
  jdText: string;
  currentUserId?: string;
  makeJdKey: (text: string) => string;
  setInterviewPlan: (plan: string[]) => void;
  setPlanFetchTrigger: React.Dispatch<React.SetStateAction<number>>;
};

export const useInterviewSceneReset = ({
  clearInterviewSession,
  clearInterviewSceneState,
  setPostInterviewSummary,
  setChatMessages,
  setChatInitialized,
  resumeData,
  jdText,
  currentUserId,
  makeJdKey,
  setInterviewPlan,
  setPlanFetchTrigger,
}: Params) => {
  return React.useCallback(async () => {
    try {
      await clearInterviewSession();
    } catch (err) {
      console.warn('Failed to clear interview chat history before restart:', err);
    }
    try {
      await clearInterviewSceneState();
    } catch (err) {
      console.warn('Failed to clear interview report state before restart:', err);
    }
    setPostInterviewSummary('');
    setChatMessages([]);
    setChatInitialized(false);

    try {
      const resumeId = String((resumeData as any)?.id || '').trim();
      const effectiveJdText = String(jdText || (resumeData as any)?.lastJdText || '').trim();
      const jdKey = makeJdKey(effectiveJdText || '__no_jd__');
      const interviewType = String(getActiveInterviewType() || '').trim().toLowerCase();
      const interviewMode = String(getActiveInterviewMode() || '').trim().toLowerCase();
      const userKey = String(currentUserId || '').trim();
      if (resumeId && jdKey && interviewType && interviewMode) {
        const userScopedPrefix = userKey
          ? `ai_interview_plan_${userKey}_${resumeId}_${jdKey}_${interviewType}_${interviewMode}_`
          : '';
        const legacyPrefix = `ai_interview_plan_${resumeId}_${jdKey}_${interviewType}_${interviewMode}_`;
        const genericNeedle = `_${resumeId}_${jdKey}_${interviewType}_${interviewMode}_`;
        const genericJdNeedle = `_${jdKey}_${interviewType}_${interviewMode}_`;
        const toDelete: string[] = [];
        for (let i = 0; i < localStorage.length; i += 1) {
          const key = String(localStorage.key(i) || '');
          if (!key.startsWith('ai_interview_plan_')) continue;
          if (
            (userScopedPrefix && key.startsWith(userScopedPrefix)) ||
            key.startsWith(legacyPrefix) ||
            key.includes(genericNeedle) ||
            key.includes(genericJdNeedle)
          ) {
            toDelete.push(key);
          }
        }
        toDelete.forEach((key) => {
          try { localStorage.removeItem(key); } catch { }
        });
      }
      const forceResumeId = resumeId || 'unknown';
      const forceUserId = userKey || 'anonymous';
      localStorage.setItem(`ai_interview_force_model_plan_once:${forceUserId}:${forceResumeId}`, '1');
    } catch {
      // ignore storage failures
    }
    setInterviewPlan([]);
    setPlanFetchTrigger((v) => v + 1);
  }, [
    clearInterviewSceneState,
    clearInterviewSession,
    currentUserId,
    jdText,
    makeJdKey,
    resumeData,
    setChatInitialized,
    setChatMessages,
    setInterviewPlan,
    setPlanFetchTrigger,
    setPostInterviewSummary,
  ]);
};

