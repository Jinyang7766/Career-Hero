import React from 'react';
import { DatabaseService } from '../../../../src/database-service';
import { deriveDiagnosisProgress, deriveLatestAnalysisStep } from '../../../../src/diagnosis-progress';
import { deriveInterviewStageStatus } from '../interview-stage-status';
import { makeJdKey } from '../id-utils';
import { confirmDialog } from '../../../../src/ui/dialogs';

type Params = {
  allResumes: any[];
  resumeData: any;
  clearLastAnalysis: () => void;
  setReport: (v: any) => void;
  setSuggestions: (v: any[]) => void;
  setScore: (v: number) => void;
  setOriginalScore: (v: number) => void;
  setPostInterviewSummary: (v: string) => void;
  setIsFromCache: (v: boolean) => void;
  setChatMessages: (v: any[]) => void;
  setChatInitialized: (v: boolean) => void;
  setInterviewPlan: React.Dispatch<React.SetStateAction<string[]>>;
  setTargetCompany: (v: string) => void;
  setJdText: (v: string) => void;
  setForceReportEntry: (v: boolean) => void;
  setOptimizedResumeId: (v: string | number | null) => void;
  setResumeData: (v: any) => void;
  setAllResumes: React.Dispatch<React.SetStateAction<any[]>>;
  setSelectedResumeId: (v: string | number | null) => void;
  sourceResumeIdRef: React.MutableRefObject<string | number | null>;
  setAnalysisResumeId: (v: string | number | null) => void;
  navigateToStep: (step: any, replaceHistory?: boolean) => void;
  showToast: (msg: string, type?: 'info' | 'success' | 'error') => void;
};

const inferChatModeFromKey = (key: string) => {
  const normalized = String(key || '').trim().toLowerCase();
  if (!normalized) return '';
  if (normalized.endsWith('__interview')) return 'interview';
  if (normalized.endsWith('__micro')) return 'micro';
  // Interview chat session keys include scene suffix.
  if (normalized.includes('__scene_')) return 'interview';
  return '';
};

const normalizeInterviewTypeMaybe = (value: any) => {
  const text = String(value || '').trim().toLowerCase();
  if (text === 'general' || text === 'technical' || text === 'hr') return text;
  return '';
};

const normalizeInterviewModeMaybe = (value: any) => {
  const text = String(value || '').trim().toLowerCase();
  if (text === 'simple' || text === 'comprehensive') return text;
  return '';
};

const parseScopedInterviewKey = (key: string) => {
  const parts = String(key || '').trim().split('__').filter(Boolean);
  return {
    jdKey: String(parts[0] || '').trim(),
    interviewType: normalizeInterviewTypeMaybe(parts[1] || ''),
    interviewMode: normalizeInterviewModeMaybe(parts[2] || ''),
  };
};

const buildSessionSignature = (key: string, session: any) => {
  const parsed = parseScopedInterviewKey(String(key || ''));
  const jdKey =
    String(session?.jdKey || '').trim() ||
    String(parsed?.jdKey || '').trim() ||
    makeJdKey(String(session?.jdText || '').trim() || '__no_jd__');
  const interviewType = normalizeInterviewTypeMaybe(session?.interviewType || parsed?.interviewType || '');
  const interviewMode = normalizeInterviewModeMaybe(session?.interviewMode || parsed?.interviewMode || '');
  const resumeId = String(session?.resumeId || '').trim();
  return {
    jdKey,
    interviewType,
    interviewMode,
    resumeId,
  };
};

const isSignatureMatched = (left: ReturnType<typeof buildSessionSignature>, right: ReturnType<typeof buildSessionSignature>) => {
  if (left.jdKey && right.jdKey && left.jdKey !== right.jdKey) return false;
  if (left.interviewType && right.interviewType && left.interviewType !== right.interviewType) return false;
  if (left.interviewMode && right.interviewMode && left.interviewMode !== right.interviewMode) return false;
  if (left.resumeId && right.resumeId && left.resumeId !== right.resumeId) return false;
  return true;
};

export const isInterviewSessionRecordForRediagnose = (key: string, session: any) => {
  const chatMode = String(session?.chatMode || '').trim().toLowerCase();
  if (chatMode === 'interview') return true;
  if (chatMode === 'micro') return false;

  const inferred = inferChatModeFromKey(key);
  if (inferred === 'interview') return true;
  if (inferred === 'micro') return false;

  // Legacy interview sessions may miss chatMode and scene suffix.
  // Prefer keeping records that look like interview-scene data.
  const interviewType = normalizeInterviewTypeMaybe(session?.interviewType || '');
  const hasMessages = Array.isArray(session?.messages) && session.messages.length > 0;
  const hasSceneSignal = !!String(session?.interviewFocus || '').trim();
  if (hasMessages && interviewType && hasSceneSignal) return true;

  return false;
};

export const isInterviewAnalysisSessionRecordForRediagnose = (
  key: string,
  session: any,
  interviewSessionEntries: Array<{ key: string; session: any }>
) => {
  const chatMode = String(session?.chatMode || '').trim().toLowerCase();
  if (chatMode === 'interview') return true;
  if (chatMode === 'micro') return false;

  const inferred = inferChatModeFromKey(key);
  if (inferred === 'interview') return true;
  if (inferred === 'micro') return false;

  const step = String(session?.step || '').trim().toLowerCase();
  if (step === 'interview_report') return true;
  if (step === 'report' || step === 'micro_intro' || step === 'comparison') return false;

  // Legacy ambiguous session: keep only if it matches a retained interview chat session.
  const signature = buildSessionSignature(key, session);
  return interviewSessionEntries.some((entry) =>
    isSignatureMatched(signature, buildSessionSignature(entry.key, entry.session))
  );
};

export const retainInterviewSessionsForRediagnose = (sessions: any) => {
  const source = sessions && typeof sessions === 'object' ? sessions : {};
  const kept: Record<string, any> = {};
  Object.entries(source).forEach(([key, session]: [string, any]) => {
    if (isInterviewSessionRecordForRediagnose(key, session)) {
      const normalizedChatMode = String(session?.chatMode || '').trim().toLowerCase();
      kept[key] = normalizedChatMode === 'interview'
        ? session
        : {
          ...session,
          chatMode: 'interview',
        };
    }
  });
  return kept;
};

export const retainInterviewAnalysisSessionsForRediagnose = (byJd: any, keptInterviewSessions: Record<string, any>) => {
  const source = byJd && typeof byJd === 'object' ? byJd : {};
  const kept: Record<string, any> = {};
  const interviewSessionEntries = Object.entries(keptInterviewSessions || {}).map(([key, session]) => ({ key, session }));
  Object.entries(source).forEach(([key, session]: [string, any]) => {
    if (isInterviewAnalysisSessionRecordForRediagnose(key, session, interviewSessionEntries as any)) {
      const normalizedChatMode = String(session?.chatMode || '').trim().toLowerCase();
      kept[key] = normalizedChatMode === 'interview'
        ? session
        : {
          ...session,
          chatMode: 'interview',
        };
    }
  });
  return kept;
};

export const useAnalysisResetActions = ({
  allResumes,
  resumeData,
  clearLastAnalysis,
  setReport,
  setSuggestions,
  setScore,
  setOriginalScore,
  setPostInterviewSummary,
  setIsFromCache,
  setChatMessages,
  setChatInitialized,
  setInterviewPlan,
  setTargetCompany,
  setJdText,
  setForceReportEntry,
  setOptimizedResumeId,
  setResumeData,
  setAllResumes,
  setSelectedResumeId,
  sourceResumeIdRef,
  setAnalysisResumeId,
  navigateToStep,
  showToast,
}: Params) => {
  const FORCE_JD_RESUME_ID_KEY = 'ai_force_jd_resume_id';
  const purgeLocalFinalReportCache = React.useCallback(() => {
    try {
      const keysToDelete: string[] = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = String(localStorage.key(i) || '');
        if (!key) continue;
        if (key.startsWith('final_report_result:') || key.startsWith('final_report_charge:')) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach((key) => {
        try { localStorage.removeItem(key); } catch { /* ignore */ }
      });
    } catch {
      // ignore storage failures
    }
  }, []);
  const retainInterviewSessionsOnly = React.useCallback((sessions: any) => retainInterviewSessionsForRediagnose(sessions), []);

  const retainInterviewAnalysisSessionsOnly = React.useCallback((byJd: any, interviewSessions: Record<string, any>) => {
    return retainInterviewAnalysisSessionsForRediagnose(byJd, interviewSessions);
  }, []);

  const CACHE_BYPASS_ONCE_KEY = 'ai_analysis_bypass_cache_once';
  const FINAL_REPORT_BYPASS_ONCE_KEY = 'ai_final_report_bypass_cache_once';
  const markBypassCacheOnce = React.useCallback(() => {
    try {
      localStorage.setItem(CACHE_BYPASS_ONCE_KEY, '1');
      localStorage.setItem(FINAL_REPORT_BYPASS_ONCE_KEY, '1');
    } catch {
      // ignore storage failures
    }
  }, []);

  const clearInitialReportForRetry = React.useCallback(() => {
    setReport(null);
    setSuggestions([]);
    setScore(0);
    setOriginalScore(0);
    setPostInterviewSummary('');
    setIsFromCache(false);
    setOptimizedResumeId(null);
    clearLastAnalysis();
    purgeLocalFinalReportCache();
    markBypassCacheOnce();
    const currentResumeId = String((resumeData as any)?.id || '').trim();
    if (!currentResumeId || !resumeData) return;
    const keptInterviewSessions = retainInterviewSessionsOnly((resumeData as any)?.interviewSessions);
    const updatedResumeData: any = {
      ...(resumeData as any),
      analysisSnapshot: null,
      analysisSessionByJd: retainInterviewAnalysisSessionsOnly((resumeData as any)?.analysisSessionByJd, keptInterviewSessions),
      interviewSessions: keptInterviewSessions,
      postInterviewFinalReport: null,
      analysisDossierLatest: null,
      analysisDossierHistory: [],
      optimizedResumeId: null,
      optimizationJdKey: '',
      analysisReportId: '',
      score: 0,
    };
    setResumeData(updatedResumeData as any);
    const diagnosisProgress = deriveDiagnosisProgress(updatedResumeData);
    const latestAnalysisStep = deriveLatestAnalysisStep(updatedResumeData);
    const {
      interviewStageStatus,
      interviewStageStatusByMode,
    } = deriveInterviewStageStatus({
      ...updatedResumeData,
      id: currentResumeId,
    });
    setAllResumes((prev: any[]) => {
      const list = Array.isArray(prev) ? prev : [];
      return list.map((item: any) => {
        if (String(item?.id || '') !== currentResumeId) return item;
        return {
          ...item,
          diagnosisProgress,
          latestAnalysisStep,
          interviewStageStatus,
          interviewStageStatusByMode,
          analyzed: false,
        };
      });
    });
    void (async () => {
      let preservedUpdatedAt = '';
      try {
        const latest = await DatabaseService.getResume(currentResumeId);
        preservedUpdatedAt = String((latest.data as any)?.updated_at || '').trim();
      } catch {
        preservedUpdatedAt = '';
      }
      const payload: any = { resume_data: updatedResumeData };
      if (preservedUpdatedAt) payload.updated_at = preservedUpdatedAt;
      await DatabaseService.updateResume(
        currentResumeId,
        payload,
        { touchUpdatedAt: false }
      );
    })();
  }, [
    clearLastAnalysis,
    purgeLocalFinalReportCache,
    markBypassCacheOnce,
    resumeData,
    setAllResumes,
    setIsFromCache,
    setOriginalScore,
    setPostInterviewSummary,
    setOptimizedResumeId,
    setReport,
    setResumeData,
    setScore,
    setSuggestions,
    retainInterviewAnalysisSessionsOnly,
    retainInterviewSessionsOnly,
  ]);

  const handleRediagnoseFromResumeSelect = React.useCallback(async (resumeId: number) => {
    const confirmed = await confirmDialog('重新诊断会清空目前已有的报告与记录，消耗的积分不返还，确定继续吗？');
    if (!confirmed) return;

    const resumeIdStr = String(resumeId || '').trim();
    if (!resumeIdStr) return;

    const clearLocalAnalysisState = () => {
      setReport(null);
      setSuggestions([]);
      setScore(0);
      setOriginalScore(0);
      setPostInterviewSummary('');
      setIsFromCache(false);
      setChatMessages([]);
      setChatInitialized(false);
      setInterviewPlan([]);
      clearLastAnalysis();
      setTargetCompany('');
      setJdText('');
      setForceReportEntry(false);
      setOptimizedResumeId(null);
      localStorage.removeItem('ai_result_open');
      localStorage.removeItem('ai_result_resume_id');
      localStorage.removeItem('ai_result_step');
      localStorage.removeItem('ai_report_open');
      localStorage.removeItem('ai_report_resume_id');
      localStorage.removeItem('ai_report_step');
      localStorage.removeItem('ai_interview_open');
      localStorage.removeItem('ai_interview_resume_id');
      localStorage.removeItem('ai_interview_entry_mode');
      localStorage.removeItem('ai_analysis_step');
      localStorage.removeItem('ai_analysis_has_activity');
      localStorage.removeItem('ai_chat_prev_step');
      localStorage.removeItem('ai_chat_entry_source');
      localStorage.removeItem('ai_last_analysis_snapshot');
      purgeLocalFinalReportCache();
      markBypassCacheOnce();
    };

    try {
      const localResume = (allResumes || []).find((item: any) => String(item?.id || '') === resumeIdStr) as any;
      const fetched = await DatabaseService.getResume(resumeIdStr);
      const sourceResumeData =
        (fetched.success && fetched.data?.resume_data)
          ? fetched.data.resume_data
          : (localResume?.resume_data || (String((resumeData as any)?.id || '') === resumeIdStr ? (resumeData as any) : null));

      if (!sourceResumeData || typeof sourceResumeData !== 'object') {
        showToast('未找到可重置的简历数据，请稍后重试', 'error');
        return;
      }
      const keptInterviewSessions = retainInterviewSessionsOnly(sourceResumeData?.interviewSessions);

      const updatedResumeData: any = {
        ...sourceResumeData,
        analysisSnapshot: null,
        analysisSessionByJd: retainInterviewAnalysisSessionsOnly(sourceResumeData?.analysisSessionByJd, keptInterviewSessions),
        interviewSessions: keptInterviewSessions,
        postInterviewFinalReport: null,
        analysisDossierLatest: null,
        analysisDossierHistory: [],
        analysisBindings: {},
        optimizedResumeId: null,
        optimizationJdKey: '',
        analysisReportId: '',
        diagnosisProgress: 0,
        latestAnalysisStep: '',
        score: 0,
        lastJdText: '',
        targetCompany: '',
        interviewFocus: '',
      };

      const preservedUpdatedAt = String((fetched.data as any)?.updated_at || '').trim();
      const updatePayload: any = { resume_data: updatedResumeData, score: 0, has_dot: false };
      if (preservedUpdatedAt) updatePayload.updated_at = preservedUpdatedAt;
      const updateResult = await DatabaseService.updateResume(
        resumeIdStr,
        updatePayload,
        { touchUpdatedAt: false }
      );
      if (!updateResult.success) {
        showToast('清空报告失败，请稍后重试', 'error');
        return;
      }

      const diagnosisProgress = deriveDiagnosisProgress(updatedResumeData) ?? 0;
      const latestAnalysisStep = deriveLatestAnalysisStep(updatedResumeData);
      const { interviewStageStatus, interviewStageStatusByMode } = deriveInterviewStageStatus({
        ...updatedResumeData,
        id: resumeIdStr,
      });
      const isCurrentResume = String((resumeData as any)?.id || '') === resumeIdStr;
      if (isCurrentResume) {
        setResumeData({
          id: resumeId,
          ...updatedResumeData,
          resumeTitle: String((resumeData as any)?.resumeTitle || '').trim(),
        } as any);
      }
      setAllResumes((prev: any[]) => {
        const list = Array.isArray(prev) ? prev : [];
        return list.map((item: any) => {
          if (String(item?.id || '') !== resumeIdStr) return item;
          return {
            ...item,
            resume_data: updatedResumeData,
            diagnosisProgress,
            latestAnalysisStep,
            interviewStageStatus,
            interviewStageStatusByMode,
            analyzed: false,
            score: 0,
          };
        });
      });

      clearLocalAnalysisState();
      try {
        localStorage.setItem(FORCE_JD_RESUME_ID_KEY, resumeIdStr);
      } catch {
        // ignore storage failures
      }
      sourceResumeIdRef.current = null;
      setSelectedResumeId(null);
      setAnalysisResumeId(null);
      navigateToStep('resume_select', true);
      showToast('已清空当前报告，列表状态已刷新', 'success');
    } catch (error) {
      console.error('Failed to reset diagnosis from resume select:', error);
      showToast('清空报告失败，请稍后重试', 'error');
    }
  }, [
    allResumes,
    clearLastAnalysis,
    navigateToStep,
    resumeData,
    setAllResumes,
    setSelectedResumeId,
    setAnalysisResumeId,
    setChatInitialized,
    setChatMessages,
    setInterviewPlan,
    setIsFromCache,
    setJdText,
    setOriginalScore,
    setPostInterviewSummary,
    setReport,
    setScore,
    setSuggestions,
    setTargetCompany,
    setForceReportEntry,
    setOptimizedResumeId,
    setResumeData,
    markBypassCacheOnce,
    purgeLocalFinalReportCache,
    showToast,
    sourceResumeIdRef,
    retainInterviewAnalysisSessionsOnly,
    retainInterviewSessionsOnly,
  ]);

  return {
    clearInitialReportForRetry,
    handleRediagnoseFromResumeSelect,
  };
};
