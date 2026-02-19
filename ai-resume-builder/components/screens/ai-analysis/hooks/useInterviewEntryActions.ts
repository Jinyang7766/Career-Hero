import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { getLegacyPlanStorageKey, getPlanStorageKey } from '../interview-plan-utils';

type Params = {
  chatIntroScheduledRef: MutableRefObject<boolean>;
  clearInterviewSession: () => Promise<void>;
  jdText: string;
  resumeData: any;
  makeJdKey: (text: string) => string;
  currentUserId?: string;
  setInterviewPlan: (v: string[]) => void;
  setPlanFetchTrigger: Dispatch<SetStateAction<number>>;
  openChat: (source: 'internal' | 'preview') => void;
};

export const useInterviewEntryActions = ({
  chatIntroScheduledRef,
  clearInterviewSession,
  jdText,
  resumeData,
  makeJdKey,
  currentUserId,
  setInterviewPlan,
  setPlanFetchTrigger,
  openChat,
}: Params) => {
  const handleRestartInterview = useCallback(async () => {
    chatIntroScheduledRef.current = false;
    await clearInterviewSession();
    const effectiveJdText = (jdText || resumeData?.lastJdText || '').trim();
    if (effectiveJdText) {
      try {
        localStorage.removeItem(getPlanStorageKey(resumeData?.id, makeJdKey, effectiveJdText, undefined, currentUserId));
        localStorage.removeItem(getLegacyPlanStorageKey(resumeData?.id, makeJdKey, effectiveJdText));
      } catch { }
    }
    setInterviewPlan([]);
    setPlanFetchTrigger((v) => v + 1);
  }, [chatIntroScheduledRef, clearInterviewSession, jdText, resumeData?.lastJdText, resumeData?.id, makeJdKey, currentUserId, setInterviewPlan, setPlanFetchTrigger]);

  const handleStartInterviewFromFinalReport = useCallback(async () => {
    await handleRestartInterview();
    openChat('internal');
  }, [handleRestartInterview, openChat]);

  return {
    handleRestartInterview,
    handleStartInterviewFromFinalReport,
  };
};
