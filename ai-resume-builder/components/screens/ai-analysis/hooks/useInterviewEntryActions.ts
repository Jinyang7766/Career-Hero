import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { View } from '../../../../types';
import { DatabaseService } from '../../../../src/database-service';
import { deriveDiagnosisProgress, deriveLatestAnalysisStep } from '../../../../src/diagnosis-progress';
import { deriveInterviewStageStatus } from '../interview-stage-status';
import { getActiveInterviewMode, getActiveInterviewType } from '../interview-plan-utils';

type Params = {
  isInterviewMode?: boolean;
  chatIntroScheduledRef: MutableRefObject<boolean>;
  clearInterviewSession: () => Promise<void>;
  clearInterviewSceneState?: () => Promise<void>;
  persistAnalysisSessionState?: (
    state: 'interview_in_progress' | 'paused' | 'interview_done',
    patch?: Partial<{ jdText: string; targetCompany: string; step: string; force: boolean }>
  ) => Promise<void>;
  jdText: string;
  targetCompany?: string;
  resumeData: any;
  makeJdKey: (text: string) => string;
  currentUserId?: string;
  setAllResumes?: (updater: (prev: any[]) => any[]) => void;
  setInterviewPlan: (v: string[]) => void;
  setPlanFetchTrigger: Dispatch<SetStateAction<number>>;
  openChat: (source: 'internal' | 'preview') => void;
  navigateToStep?: (step: 'jd_input' | 'analyzing' | 'report' | 'micro_intro' | 'chat' | 'interview_report' | 'comparison' | 'final_report', replace?: boolean) => void;
  navigateToView?: (view: View, options?: any) => void;
  setTargetCompany?: (v: string) => void;
  setJdText?: (v: string) => void;
};

export const useInterviewEntryActions = ({
  isInterviewMode = false,
  chatIntroScheduledRef,
  clearInterviewSession,
  clearInterviewSceneState,
  persistAnalysisSessionState,
  jdText,
  targetCompany,
  resumeData,
  makeJdKey,
  currentUserId,
  setAllResumes,
  setInterviewPlan,
  setPlanFetchTrigger,
  openChat,
  navigateToStep,
  navigateToView,
  setTargetCompany,
  setJdText,
  }: Params) => {
  const clearCurrentScenePlanCache = useCallback(() => {
    if (!isInterviewMode) return;
    const resumeId = String((resumeData as any)?.id || '').trim();
    const effectiveJdText = (jdText || resumeData?.lastJdText || '').trim();
    if (!resumeId) return;
    const jdKey = makeJdKey(effectiveJdText || '__no_jd__');
    const interviewType = String(getActiveInterviewType() || '').trim().toLowerCase();
    const interviewMode = String(getActiveInterviewMode() || '').trim().toLowerCase();
    if (!interviewType || !interviewMode) return;
    const userKey = String(currentUserId || '').trim();
    const userScopedPrefix = userKey
      ? `ai_interview_plan_${userKey}_${resumeId}_${jdKey}_${interviewType}_${interviewMode}_`
      : '';
    const legacyPrefix = `ai_interview_plan_${resumeId}_${jdKey}_${interviewType}_${interviewMode}_`;
    const genericNeedle = `_${resumeId}_${jdKey}_${interviewType}_${interviewMode}_`;
    const genericJdNeedle = `_${jdKey}_${interviewType}_${interviewMode}_`;
    try {
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
    } catch {
      // ignore storage failures
    }
  }, [isInterviewMode, resumeData, jdText, makeJdKey, currentUserId]);

  const handleRestartInterview = useCallback(async () => {
    if (isInterviewMode) {
      // Jump back to scene selection immediately, then clear state in background.
      navigateToStep?.('jd_input', true);
    }
    chatIntroScheduledRef.current = false;
    try {
      await clearInterviewSession();
    } catch (err) {
      console.warn('Failed to clear interview session on restart:', err);
    }
    if (isInterviewMode && clearInterviewSceneState) {
      try {
        await clearInterviewSceneState();
      } catch (err) {
        console.warn('Failed to clear interview scene state on restart:', err);
      }
    }
    clearCurrentScenePlanCache();
    if (isInterviewMode) {
      try {
        const resumeId = String((resumeData as any)?.id || '').trim() || 'unknown';
        const userKey = String(currentUserId || '').trim() || 'anonymous';
        localStorage.setItem(`ai_interview_force_model_plan_once:${userKey}:${resumeId}`, '1');
      } catch { }
      try {
        const userSuffix = String(currentUserId || '').trim();
        const typeKey = userSuffix ? `ai_interview_type:${userSuffix}` : 'ai_interview_type';
        const modeKey = userSuffix ? `ai_interview_mode:${userSuffix}` : 'ai_interview_mode';
        const focusKey = userSuffix ? `ai_interview_focus:${userSuffix}` : 'ai_interview_focus';
        localStorage.removeItem(typeKey);
        localStorage.removeItem(modeKey);
        localStorage.removeItem(focusKey);
        localStorage.removeItem('ai_interview_type');
        localStorage.removeItem('ai_interview_mode');
        localStorage.removeItem('ai_interview_focus');
      } catch { }
      setTargetCompany?.('');
      setJdText?.('');
    }
    setInterviewPlan([]);
    setPlanFetchTrigger((v) => v + 1);
    // Keep resume list progress status in sync immediately when returning to resume_select.
    try {
      const resumeId = String((resumeData as any)?.id || '').trim();
      if (resumeId && setAllResumes) {
        const latest = await DatabaseService.getResume(resumeId);
        if (latest.success && latest.data) {
          const rowData = latest.data.resume_data || {};
          const diagnosisProgress = deriveDiagnosisProgress(rowData);
          const latestAnalysisStep = deriveLatestAnalysisStep(rowData);
          const { interviewStageStatus, interviewStageStatusByMode } = deriveInterviewStageStatus({
            ...rowData,
            id: latest.data.id,
          });
          setAllResumes((prev: any[]) => {
            const list = Array.isArray(prev) ? prev : [];
            return list.map((item: any) => {
              if (String(item?.id) !== String(latest.data.id)) return item;
              return {
                ...item,
                diagnosisProgress,
                latestAnalysisStep,
                interviewStageStatus,
                interviewStageStatusByMode,
              };
            });
          });
        }
      }
    } catch (syncErr) {
      console.warn('Failed to sync resume list progress after restart:', syncErr);
    }
    if (!isInterviewMode) {
      const effectiveJdText = (jdText || resumeData?.lastJdText || '').trim();
      try {
        await persistAnalysisSessionState?.('interview_in_progress', {
          jdText: effectiveJdText,
          targetCompany: String(resumeData?.targetCompany || '').trim(),
          step: 'chat',
          force: true,
        });
      } catch (stateErr) {
        console.warn('Failed to persist micro restart checkpoint:', stateErr);
      }
    }
  }, [isInterviewMode, chatIntroScheduledRef, clearInterviewSession, clearInterviewSceneState, persistAnalysisSessionState, jdText, targetCompany, resumeData?.lastJdText, resumeData?.targetCompany, resumeData?.id, makeJdKey, currentUserId, setAllResumes, setInterviewPlan, setPlanFetchTrigger, navigateToStep, setTargetCompany, setJdText, clearCurrentScenePlanCache]);

  const handleStartInterviewFromFinalReport = useCallback(async () => {
    if (!isInterviewMode) {
      const ownerId = String(currentUserId || '').trim();
      const resumeId = String((resumeData as any)?.id || '').trim();
      localStorage.removeItem('ai_analysis_force_resume_select');
      if (ownerId) localStorage.setItem('ai_nav_owner_user_id', ownerId);
      localStorage.setItem('ai_interview_open', '1');
      if (resumeId) localStorage.setItem('ai_interview_resume_id', resumeId);
      localStorage.setItem('ai_interview_entry_mode', 'scene_select');
      navigateToView?.(View.AI_INTERVIEW, { replace: true });
      return;
    }
    await handleRestartInterview();
    navigateToStep?.('jd_input', true);
  }, [isInterviewMode, currentUserId, resumeData, navigateToView, handleRestartInterview, navigateToStep]);

  return {
    handleRestartInterview,
    handleStartInterviewFromFinalReport,
  };
};
