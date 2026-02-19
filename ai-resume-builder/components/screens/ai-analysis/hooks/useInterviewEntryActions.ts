import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { getLegacyPlanStorageKey, getPlanStorageKey } from '../interview-plan-utils';
import { confirmDialog } from '../../../../src/ui/dialogs';

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
    const confirmed = await confirmDialog(
      '开始面试前提醒：请预留一段完整时间参与本次面试，尽量不要中途退出或切换页面。确认现在进入面试吗？'
    );
    if (!confirmed) return;
    await handleRestartInterview();
    openChat('internal');
  }, [handleRestartInterview, openChat]);

  return {
    handleRestartInterview,
    handleStartInterviewFromFinalReport,
  };
};
