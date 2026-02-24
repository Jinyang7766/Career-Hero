import { useCallback } from 'react';
import { runRealAnalysisRequest } from '../analysis-execution-runner';
import { getActiveInterviewMode, getActiveInterviewType } from '../interview-plan-utils';
import { confirmDialog } from '../../../../src/ui/dialogs';
import { checkInterviewContinuationState, decideMicroInterviewNeeded } from '../analysis-execution-helpers';
import type { AnalysisReport, Suggestion } from '../types';
import { buildAnalysisResultSnapshot } from './analysis-execution-result';

type QuotaKind =
  | 'analysis'
  | 'micro_interview'
  | 'final_report'
  | 'interview'
  | 'interview_simple'
  | 'interview_comprehensive';

type Params = {
  resumeData: any;
  setResumeData?: (value: any) => void;
  jdText: string;
  targetCompany: string;
  setTargetCompany: (value: string) => void;
  optimizedResumeId: string | number | null;
  setOptimizedResumeId: (value: string | number | null) => void;
  optimizedResumeIdRef: { current: string | number | null };
  resolveOriginalResumeIdForOptimization: () => any;
  ensureAnalysisBinding: (
    originalResumeId: string | number,
    baseResumeData: any,
    analysisJdText: string
  ) => Promise<{
    analysisReportId: string;
    optimizedResumeId: string | number;
  }>;
  analysisRunIdRef: { current: string | null };
  analysisAbortRef: { current: AbortController | null };
  setIsFromCache: (value: boolean) => void;
  setAnalysisInProgress: (value: boolean) => void;
  setCurrentStep: (step: any) => void;
  setChatMessages: (items: any[]) => void;
  setChatInitialized: (value: boolean) => void;
  setOriginalResumeData: (value: any) => void;
  setOriginalScore: (value: number) => void;
  setScore: (value: number) => void;
  setSuggestions: (value: Suggestion[]) => void;
  setReport: (value: AnalysisReport | null) => void;
  persistAnalysisSessionState: (
    state: 'jd_ready' | 'analyzing' | 'report_ready' | 'paused' | 'error' | 'interview_in_progress',
    patch?: Partial<{ jdText: string; targetCompany: string; score: number; step: string; error: string; force: boolean }>
  ) => Promise<void>;
  persistAnalysisSnapshot: (resumeData: any, reportData: AnalysisReport, scoreValue: number, suggestionItems: Suggestion[]) => Promise<any>;
  saveLastAnalysis: (payload: any) => void;
  setAnalysisResumeId: (value: string | number | null) => void;
  markAnalysisCompleted: () => void;
  navigateToStep: (step: any, replaceTop?: boolean) => void;
  showToast: (msg: string, type?: 'info' | 'success' | 'error', durationMs?: number) => void;
  getBackendAuthToken: () => Promise<string>;
  buildApiUrl: (path: string) => string;
  getRagEnabledFlag: () => boolean;
  setShowJdEmptyModal: (value: boolean) => void;
  isInterviewMode?: boolean;
  openChat: (source: 'internal' | 'preview') => void;
  consumeUsageQuota?: (kind: QuotaKind, context?: { scenario?: string; mode?: string }) => Promise<boolean>;
  refundUsageQuota?: (kind: QuotaKind, note?: string) => Promise<boolean>;
  interviewEntryConfirmPendingRef?: { current: boolean };
};

export const useAnalysisExecution = ({
  resumeData,
  setResumeData,
  jdText,
  targetCompany,
  setTargetCompany,
  optimizedResumeId,
  setOptimizedResumeId,
  optimizedResumeIdRef,
  resolveOriginalResumeIdForOptimization,
  ensureAnalysisBinding,
  analysisRunIdRef,
  analysisAbortRef,
  setIsFromCache,
  setAnalysisInProgress,
  setCurrentStep,
  setChatMessages,
  setChatInitialized,
  setOriginalResumeData,
  setOriginalScore,
  setScore,
  setSuggestions,
  setReport,
  persistAnalysisSessionState,
  persistAnalysisSnapshot,
  saveLastAnalysis,
  setAnalysisResumeId,
  markAnalysisCompleted,
  navigateToStep,
  showToast,
  getBackendAuthToken,
  buildApiUrl,
  getRagEnabledFlag,
  setShowJdEmptyModal,
  isInterviewMode,
  openChat,
  consumeUsageQuota,
  refundUsageQuota,
  interviewEntryConfirmPendingRef,
}: Params) => {
  const CACHE_BYPASS_ONCE_KEY = 'ai_analysis_bypass_cache_once';

  const generateRealAnalysisWithOptions = useCallback(async (
    runId: string,
    interviewType?: string,
    opts?: { bypassCache?: boolean }
  ) => {
    return runRealAnalysisRequest({
      interviewType,
      resumeData,
      jdText,
      getBackendAuthToken,
      showToast,
      buildApiUrl,
      getRagEnabledFlag,
      analysisAbortRef: analysisAbortRef as any,
      analysisRunIdRef: analysisRunIdRef as any,
      runId,
      setIsFromCache,
      bypassCache: !!opts?.bypassCache,
    });
  }, [
    analysisAbortRef,
    analysisRunIdRef,
    buildApiUrl,
    getBackendAuthToken,
    getRagEnabledFlag,
    jdText,
    resumeData,
    setIsFromCache,
    showToast,
  ]);

  const cancelInFlightAnalysis = useCallback((
    message?: string,
    opts?: { preserveStep?: boolean }
  ) => {
    analysisRunIdRef.current = null;
    if (analysisAbortRef.current) {
      try { analysisAbortRef.current.abort('analysis_cancelled'); } catch { /* ignore */ }
    }
    analysisAbortRef.current = null;
    setAnalysisInProgress(false);
    if (message) {
      showToast(message, 'error', 2600);
    }
    if (!opts?.preserveStep) {
      setCurrentStep('jd_input');
    }
  }, [analysisAbortRef, analysisRunIdRef, setAnalysisInProgress, setCurrentStep, showToast]);

  const startAnalysis = useCallback(async (
    interviewType?: string,
    opts?: { preserveReportOnError?: boolean; bypassCache?: boolean }
  ) => {
    if (!resumeData) {
      console.error('startAnalysis - resumeData is null or undefined');
      alert('无法进行 AI 诊断：没有找到简历数据');
      return;
    }

    console.log('startAnalysis - Resume data:', resumeData);

    if (analysisRunIdRef.current) {
      cancelInFlightAnalysis(undefined, { preserveStep: true });
    }
    const normalizedInterviewType = String(interviewType || getActiveInterviewType() || 'general').trim().toLowerCase();
    const normalizedInterviewMode = String(getActiveInterviewMode() || 'comprehensive').trim().toLowerCase();
    const analysisSessionByJd = (resumeData as any)?.analysisSessionByJd || {};
    const { effectiveJdText, isContinuingInterview } = checkInterviewContinuationState({
      analysisSessionByJd,
      jdText,
      resumeData,
      isInterviewMode,
      normalizedInterviewMode,
      normalizedInterviewType,
    });
    if (isInterviewMode) {
      if (interviewEntryConfirmPendingRef) {
        interviewEntryConfirmPendingRef.current = true;
      }
      let confirmed = false;
      try {
        confirmed = await confirmDialog(
          '开始面试前提醒：请预留一段完整时间参与本次面试，尽量不要中途退出或切换页面。确认现在进入面试吗？'
        );
      } finally {
        if (interviewEntryConfirmPendingRef) {
          interviewEntryConfirmPendingRef.current = false;
        }
      }
      if (!confirmed) return;
    }

    if (consumeUsageQuota && !(isInterviewMode && isContinuingInterview)) {
      const kind: 'analysis' | 'interview_simple' | 'interview_comprehensive' =
        isInterviewMode
          ? (normalizedInterviewMode === 'simple' ? 'interview_simple' : 'interview_comprehensive')
          : 'analysis';
      const allowed = await consumeUsageQuota(kind, isInterviewMode ? {
        scenario: normalizedInterviewType,
        mode: normalizedInterviewMode
      } : undefined);
      if (!allowed) return;
    }

    const runId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    analysisRunIdRef.current = runId;
    if (isInterviewMode && interviewType) {
      localStorage.setItem('ai_interview_type', interviewType);
    }

    // Interview mode should enter interview flow directly instead of running
    // the diagnosis pipeline UI.
    if (isInterviewMode) {
      const effectiveJd = (jdText || resumeData?.lastJdText || '').trim();
      try {
        await persistAnalysisSessionState('interview_in_progress', {
          jdText: effectiveJd,
          targetCompany: targetCompany || resumeData?.targetCompany || '',
          step: 'chat',
          force: true,
        });
      } catch (stateErr) {
        console.warn('Failed to persist interview_in_progress state:', stateErr);
      }
      openChat('internal');
      return;
    }

    const hasReusableInterviewContext = Boolean(
      isInterviewMode &&
      resumeData?.optimizationStatus === 'optimized' &&
      (resumeData?.analysisSnapshot || (resumeData?.score || 0) > 0) &&
      ((jdText || resumeData?.lastJdText || '').trim())
    );

    if (hasReusableInterviewContext) {
      const effectiveJdText = (jdText || resumeData.lastJdText || '').trim();
      try {
        await persistAnalysisSessionState('interview_in_progress', {
          jdText: effectiveJdText,
          targetCompany: targetCompany || resumeData.targetCompany || '',
          step: 'chat',
          force: true,
        });
      } catch (stateErr) {
        console.warn('Failed to persist interview_in_progress state:', stateErr);
      }
      openChat('internal');
      return;
    }

    setChatMessages([]);
    setChatInitialized(false);
    setOriginalResumeData(JSON.parse(JSON.stringify(resumeData)));
    setAnalysisInProgress(true);
    try {
      await persistAnalysisSessionState('analyzing', {
        jdText: jdText || resumeData.lastJdText || '',
        targetCompany: targetCompany || resumeData.targetCompany || '',
        step: 'analyzing',
        force: true,
      });
    } catch (stateErr) {
      console.warn('Failed to persist analyzing session state:', stateErr);
    }
    navigateToStep('analyzing');

    try {
      let bypassCacheOnce = false;
      try {
        bypassCacheOnce = localStorage.getItem(CACHE_BYPASS_ONCE_KEY) === '1';
        if (bypassCacheOnce) {
          localStorage.removeItem(CACHE_BYPASS_ONCE_KEY);
        }
      } catch {
        bypassCacheOnce = false;
      }
      const aiAnalysisResult = await generateRealAnalysisWithOptions(runId, interviewType, {
        bypassCache: !!opts?.bypassCache || bypassCacheOnce,
      });
      if (analysisRunIdRef.current !== runId) return;
      if (!aiAnalysisResult) return;

      const {
        appliedSuggestions,
        report: newReport,
        totalScore,
        effectiveTargetCompany,
      } = buildAnalysisResultSnapshot({
        aiAnalysisResult,
        resumeData,
        targetCompany,
      });
      setOriginalScore(totalScore);
      setScore(totalScore);
      setSuggestions(appliedSuggestions);
      setReport(newReport);
      const originalResumeId = resolveOriginalResumeIdForOptimization();
      let resolvedAnalysisReportId = '';
      let resolvedOptimizedResumeId: string | number | null =
        (resumeData.optimizationStatus === 'optimized' && resumeData.id)
          ? resumeData.id
          : (optimizedResumeIdRef.current || optimizedResumeId || resumeData.optimizedResumeId || null);
      if (originalResumeId) {
        try {
          const baseResumeForBinding = resumeData.optimizationStatus === 'optimized'
            ? { ...resumeData, id: originalResumeId }
            : resumeData;
          const binding = await ensureAnalysisBinding(
            originalResumeId,
            baseResumeForBinding,
            jdText || resumeData.lastJdText || ''
          );
          resolvedAnalysisReportId = binding.analysisReportId;
          resolvedOptimizedResumeId = binding.optimizedResumeId;
          optimizedResumeIdRef.current = binding.optimizedResumeId;
          setOptimizedResumeId(binding.optimizedResumeId);
        } catch (bindingError) {
          console.warn('ensureAnalysisBinding failed, continue with local report rendering:', bindingError);
        }
      }

      const snapshotForPersist = {
        score: totalScore,
        summary: newReport.summary,
        microInterviewFirstQuestion: newReport.microInterviewFirstQuestion || '',
        strengths: newReport.strengths,
        weaknesses: newReport.weaknesses,
        missingKeywords: newReport.missingKeywords,
        scoreBreakdown: newReport.scoreBreakdown,
        suggestions: appliedSuggestions,
        updatedAt: new Date().toISOString(),
        jdText: jdText || resumeData.lastJdText || '',
        targetCompany: effectiveTargetCompany,
        targetCompanyConfidence: 0,
        analysisReportId: resolvedAnalysisReportId || undefined,
        optimizedResumeId: resolvedOptimizedResumeId || undefined,
      };
      const isSameId = (a: any, b: any) => String(a ?? '').trim() !== '' && String(a ?? '').trim() === String(b ?? '').trim();
      const persistTargetId =
        (resumeData.optimizationStatus === 'optimized' && resumeData.id)
          ? resumeData.id
          : (resolvedOptimizedResumeId || optimizedResumeIdRef.current || optimizedResumeId || resumeData.optimizedResumeId || null);
      const safePersistTargetId =
        (originalResumeId && isSameId(persistTargetId, originalResumeId))
          ? (resolvedOptimizedResumeId || optimizedResumeIdRef.current || optimizedResumeId || null)
          : persistTargetId;
      if (safePersistTargetId) {
        try {
          const persistedResume = await persistAnalysisSnapshot(
            { ...resumeData, id: safePersistTargetId as any },
            newReport,
            totalScore,
            appliedSuggestions
          );
          if (persistedResume && setResumeData) {
            setResumeData({
              ...persistedResume,
              id: safePersistTargetId as any,
            });
          }
        } catch (persistError) {
          console.warn('persistAnalysisSnapshot failed, continue with in-memory report:', persistError);
        }
      }
      if (resumeData?.id) {
        saveLastAnalysis({
          resumeId: safePersistTargetId || resumeData.id,
          jdText: jdText || resumeData.lastJdText || '',
          targetCompany: effectiveTargetCompany,
          snapshot: snapshotForPersist,
          updatedAt: snapshotForPersist.updatedAt,
          analysisReportId: resolvedAnalysisReportId || undefined,
          optimizedResumeId: resolvedOptimizedResumeId || undefined,
        });
        setAnalysisResumeId((safePersistTargetId || resumeData.id) as any);
      }
      try {
        await persistAnalysisSessionState('report_ready', {
          jdText: jdText || resumeData.lastJdText || '',
          targetCompany: effectiveTargetCompany,
          score: totalScore,
          step: 'report',
          force: true,
        });
      } catch (stateErr) {
        console.warn('Failed to persist report_ready session state:', stateErr);
      }
      markAnalysisCompleted();
      const shouldEnterMicroInterview = decideMicroInterviewNeeded({
        isInterviewMode,
        aiAnalysisResult,
        totalScore,
        appliedSuggestions,
        weaknesses: newReport.weaknesses || [],
        missingKeywords: newReport.missingKeywords || [],
        summary: newReport.summary || '',
      });
      if (shouldEnterMicroInterview) {
        try {
          await persistAnalysisSessionState('interview_in_progress', {
            jdText: jdText || resumeData.lastJdText || '',
            targetCompany: effectiveTargetCompany,
            score: totalScore,
            step: 'chat',
            force: true,
          });
        } catch (stateErr) {
          console.warn('Failed to persist interview_in_progress session state:', stateErr);
        }
        if (isInterviewMode) {
          openChat('internal');
        } else {
          navigateToStep('report');
        }
      } else {
        showToast('本次诊断结果较完善，已跳过微访谈。', 'success', 2200);
        navigateToStep('report');
      }
    } catch (error) {
      if (analysisRunIdRef.current !== runId) return;
      console.error('AI analysis failed:', error);
      const message = String((error as any)?.message || '').trim();
      const isTimeout = message === 'analysis_timeout';
      const isCancelled = message === 'analysis_cancelled';
      try {
        await persistAnalysisSessionState('paused', {
          jdText: jdText || resumeData?.lastJdText || '',
          targetCompany: targetCompany || resumeData?.targetCompany || '',
          step: opts?.preserveReportOnError ? 'report' : 'jd_input',
          error: message || 'analysis_interrupted',
          force: true,
        });
      } catch (stateErr) {
        console.warn('Failed to persist paused session state:', stateErr);
      }
      if (isTimeout) {
        if (!isInterviewMode && refundUsageQuota) {
          await refundUsageQuota('analysis', 'AI 诊断超时返还积分');
        }
        showToast('AI 诊断超时，请检查后端服务是否可用后重试', 'error', 2800);
      } else if (isCancelled) {
        if (!isInterviewMode && refundUsageQuota) {
          await refundUsageQuota('analysis', 'AI 诊断取消返还积分');
        }
        showToast('诊断已取消，请重试', 'info', 1800);
      } else {
        if (!isInterviewMode && refundUsageQuota) {
          await refundUsageQuota('analysis', 'AI 诊断失败返还积分');
        }
        showToast(`AI 诊断失败：${message || '网络连接异常，请稍后重试'}`, 'error', 2600);
      }
      if (opts?.preserveReportOnError) {
        navigateToStep('report');
      } else {
        navigateToStep('jd_input');
      }
    } finally {
      if (analysisRunIdRef.current === runId) {
        analysisRunIdRef.current = null;
        setAnalysisInProgress(false);
      }
    }
  }, [
    analysisRunIdRef,
    cancelInFlightAnalysis,
    generateRealAnalysisWithOptions,
    jdText,
    markAnalysisCompleted,
    navigateToStep,
    optimizedResumeId,
    ensureAnalysisBinding,
    optimizedResumeIdRef,
    persistAnalysisSessionState,
    persistAnalysisSnapshot,
    resumeData,
    setResumeData,
    resolveOriginalResumeIdForOptimization,
    saveLastAnalysis,
    setAnalysisInProgress,
    setAnalysisResumeId,
    setChatInitialized,
    setChatMessages,
    setOptimizedResumeId,
    setOriginalResumeData,
    setOriginalScore,
    setReport,
    setScore,
    setSuggestions,
    showToast,
    setTargetCompany,
    targetCompany,
    isInterviewMode,
    consumeUsageQuota,
    refundUsageQuota,
    interviewEntryConfirmPendingRef,
  ]);

  const handleStartAnalysisClick = useCallback(async (interviewType?: string) => {
    const hasJd = !!jdText.trim();
    if (!hasJd) {
      setShowJdEmptyModal(true);
      return;
    }
    await startAnalysis(interviewType);
  }, [jdText, setShowJdEmptyModal, startAnalysis]);

  return {
    cancelInFlightAnalysis,
    startAnalysis,
    handleStartAnalysisClick,
  };
};
