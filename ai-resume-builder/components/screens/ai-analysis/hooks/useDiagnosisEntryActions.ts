import { useCallback, useRef } from 'react';
import { openChatWithInterviewCheckpoint } from '../interview-entry-checkpoint';
import { getActiveInterviewMode, getActiveInterviewType } from '../interview-plan-utils';
import type { QuotaKind } from './useUsageQuota';
import { USAGE_POINT_COST } from '../../../../src/points-config';

type Params = {
  openChat: (source: 'internal' | 'preview') => void;
  navigateToStep: (step: any, replace?: boolean) => void;
  resumeData?: any;
  jdText?: string;
  makeJdKey?: (text: string) => string;
  consumeUsageQuota?: (kind: QuotaKind, context?: { scenario?: string; mode?: string }) => Promise<boolean>;
  persistAnalysisSessionState?: (
    state: 'interview_in_progress' | 'paused' | 'interview_done',
    patch?: Partial<{ jdText: string; targetCompany: string; step: string; force: boolean }>
  ) => Promise<void>;
};

export const useDiagnosisEntryActions = ({
  openChat,
  navigateToStep,
  resumeData,
  jdText,
  makeJdKey,
  consumeUsageQuota,
  persistAnalysisSessionState,
}: Params) => {
  const startedMicroLocallyRef = useRef(false);

  const hasStartedMicroInterview = useCallback(() => {
    if (startedMicroLocallyRef.current) return true;
    const effectiveJdText = String(jdText || resumeData?.lastJdText || '').trim();
    const jdKey = makeJdKey ? makeJdKey(effectiveJdText || '__no_jd__') : '';
    const chatSessions = Object.values((resumeData as any)?.interviewSessions || {}) as any[];
    const startedByChatHistory = chatSessions.some((session: any) => {
      if (!session) return false;
      const chatMode = String(session?.chatMode || '').trim().toLowerCase();
      if (chatMode !== 'micro') return false;
      const sessionJdKey = String(session?.jdKey || '').trim() || (
        makeJdKey ? makeJdKey(String(session?.jdText || '').trim() || '__no_jd__') : ''
      );
      if (jdKey && sessionJdKey && sessionJdKey !== jdKey) return false;
      return Array.isArray(session?.messages) && session.messages.length > 0;
    });
    if (startedByChatHistory) return true;

    const analysisSessions = Object.values((resumeData as any)?.analysisSessionByJd || {}) as any[];
    return analysisSessions.some((session: any) => {
      if (!session) return false;
      const chatMode = String(session?.chatMode || '').trim().toLowerCase();
      if (chatMode !== 'micro') return false;
      const sessionJdKey =
        String(session?.jdKey || '').trim() ||
        (makeJdKey ? makeJdKey(String(session?.jdText || '').trim() || '__no_jd__') : '');
      if (jdKey && sessionJdKey && sessionJdKey !== jdKey) return false;
      const state = String(session?.state || '').trim().toLowerCase();
      const step = String(session?.step || '').trim().toLowerCase();
      return (
        state === 'interview_in_progress' ||
        state === 'paused' ||
        state === 'interview_done' ||
        step === 'micro_intro' ||
        step === 'chat' ||
        step === 'comparison' ||
        step === 'final_report'
      );
    });
  }, [jdText, makeJdKey, resumeData]);

  const getMicroInterviewProgressState = useCallback((): 'none' | 'in_progress' | 'completed' => {
    const effectiveJdText = String(jdText || resumeData?.lastJdText || '').trim();
    const jdKey = makeJdKey ? makeJdKey(effectiveJdText || '__no_jd__') : '';
    const analysisSessions = Object.values((resumeData as any)?.analysisSessionByJd || {}) as any[];
    const matchedMicroSessions = analysisSessions.filter((session: any) => {
      if (!session) return false;
      const chatMode = String(session?.chatMode || '').trim().toLowerCase();
      if (chatMode !== 'micro') return false;
      const sessionJdKey =
        String(session?.jdKey || '').trim() ||
        (makeJdKey ? makeJdKey(String(session?.jdText || '').trim() || '__no_jd__') : '');
      if (jdKey && sessionJdKey && sessionJdKey !== jdKey) return false;
      return true;
    });
    const hasCompleted = matchedMicroSessions.some((session: any) => {
      const state = String(session?.state || '').trim().toLowerCase();
      const step = String(session?.step || '').trim().toLowerCase();
      return state === 'interview_done' || step === 'comparison' || step === 'final_report' || step === 'interview_report';
    });
    if (hasCompleted) return 'completed';
    const hasInProgress = matchedMicroSessions.some((session: any) => {
      const state = String(session?.state || '').trim().toLowerCase();
      const step = String(session?.step || '').trim().toLowerCase();
      return state === 'interview_in_progress' || state === 'paused' || step === 'micro_intro' || step === 'chat';
    });
    return hasInProgress ? 'in_progress' : 'none';
  }, [jdText, makeJdKey, resumeData]);

  const handleStartMicroInterview = useCallback(async () => {
    const microProgressState = getMicroInterviewProgressState();
    if (microProgressState === 'completed') {
      navigateToStep('final_report', true);
      return;
    }
    const hasStartedMicro = hasStartedMicroInterview();
    if (!hasStartedMicro && consumeUsageQuota) {
      const normalizedInterviewType = String(getActiveInterviewType() || 'general').trim().toLowerCase() || 'general';
      const normalizedInterviewMode = String(getActiveInterviewMode() || 'comprehensive').trim().toLowerCase() || 'comprehensive';
      const allowed = await consumeUsageQuota('micro_interview', {
        scenario: normalizedInterviewType,
        mode: normalizedInterviewMode,
      });
      if (!allowed) return;
    }
    startedMicroLocallyRef.current = true;
    const effectiveJdText = String(jdText || resumeData?.lastJdText || '').trim();
    openChatWithInterviewCheckpoint({
      persist: persistAnalysisSessionState,
      patch: {
        jdText: effectiveJdText,
        targetCompany: String(resumeData?.targetCompany || '').trim(),
        step: 'micro_intro',
        force: true,
      },
      openChat,
      source: 'internal',
      timeoutMs: 1600,
      label: 'micro interview start checkpoint',
    });
  }, [consumeUsageQuota, getMicroInterviewProgressState, hasStartedMicroInterview, jdText, navigateToStep, openChat, persistAnalysisSessionState, resumeData?.lastJdText, resumeData?.targetCompany]);

  const microAndFinalTotalCost = USAGE_POINT_COST.micro_interview + USAGE_POINT_COST.final_report;
  const microProgressState = getMicroInterviewProgressState();
  const microInterviewActionLabel = microProgressState === 'completed'
    ? '查看最终报告'
    : (hasStartedMicroInterview()
      ? '继续微访谈'
      : `进入微访谈（${microAndFinalTotalCost}积分）`);

  return {
    handleStartMicroInterview,
    microInterviewActionLabel,
  };
};
