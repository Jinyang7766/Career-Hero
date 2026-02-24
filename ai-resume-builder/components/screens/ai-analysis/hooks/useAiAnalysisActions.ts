import { useCallback, useRef } from 'react';
import { View } from '../../../../types';
import type { QuotaKind } from './useUsageQuota';
import { USAGE_POINT_COST } from '../../../../src/points-config';
import { openChatWithInterviewCheckpoint } from '../interview-entry-checkpoint';
import { getActiveInterviewMode, getActiveInterviewType } from '../interview-plan-utils';

type Params = {
  navigateToView: (view: View, options?: any) => void;
  navigateToStep: (step: any, replace?: boolean) => void;
  openChat: (source: 'internal' | 'preview') => void;
  resumeData?: any;
  jdText?: string;
  makeJdKey?: (text: string) => string;
  consumeUsageQuota?: (kind: QuotaKind, context?: { scenario?: string; mode?: string }) => Promise<boolean>;
  isInterviewMode?: boolean;
  currentStep?: string;
  onRetryAnalysisFromIntro?: () => void;
  persistAnalysisSessionState?: (
    state: 'interview_in_progress' | 'paused' | 'interview_done',
    patch?: Partial<{ jdText: string; targetCompany: string; step: string; force: boolean }>
  ) => Promise<void>;
};

export const useAiAnalysisActions = ({
  navigateToView,
  navigateToStep,
  openChat,
  resumeData,
  jdText,
  makeJdKey,
  consumeUsageQuota,
  isInterviewMode = false,
  currentStep,
  onRetryAnalysisFromIntro,
  persistAnalysisSessionState,
}: Params) => {
  const startedMicroLocallyRef = useRef(false);
  const getScoreColor = useCallback((s: number) => {
    if (s >= 90) return 'text-green-500';
    if (s >= 70) return 'text-primary';
    return 'text-orange-500';
  }, []);

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

  const handleResumeSelectBack = useCallback(() => {
    navigateToView(View.DASHBOARD, { root: true, replace: true });
  }, [navigateToView]);

  const handleStartMicroInterview = useCallback(async () => {
    const hasStartedMicro = hasStartedMicroInterview();
    if (!isInterviewMode && !hasStartedMicro && consumeUsageQuota) {
      const normalizedInterviewType = String(getActiveInterviewType() || 'general').trim().toLowerCase() || 'general';
      const normalizedInterviewMode = String(getActiveInterviewMode() || 'comprehensive').trim().toLowerCase() || 'comprehensive';
      const allowed = await consumeUsageQuota('micro_interview', {
        scenario: normalizedInterviewType,
        mode: normalizedInterviewMode,
      });
      if (!allowed) return;
    }
    if (!isInterviewMode) {
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
      return;
    }
    openChat('internal');
  }, [consumeUsageQuota, hasStartedMicroInterview, isInterviewMode, jdText, openChat, persistAnalysisSessionState, resumeData?.lastJdText, resumeData?.targetCompany]);

  const microAndFinalTotalCost = USAGE_POINT_COST.micro_interview + USAGE_POINT_COST.final_report;
  const microInterviewActionLabel = (!isInterviewMode && hasStartedMicroInterview())
    ? '继续微访谈'
    : `进入微访谈（${microAndFinalTotalCost}积分）`;

  const handleRetryAnalysisFromIntro = useCallback(() => {
    onRetryAnalysisFromIntro?.();
    navigateToStep('jd_input', true);
  }, [navigateToStep, onRetryAnalysisFromIntro]);

  return {
    getScoreColor,
    handleResumeSelectBack,
    handleStartMicroInterview,
    microInterviewActionLabel,
    handleRetryAnalysisFromIntro,
  };
};
