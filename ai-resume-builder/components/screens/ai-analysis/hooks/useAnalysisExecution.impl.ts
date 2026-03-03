import { useCallback } from 'react';
import { runRealAnalysisRequest } from '../analysis-execution-runner';
import { getActiveInterviewMode, getActiveInterviewType } from '../interview-plan-utils';
import { confirmDialog } from '../../../../src/ui/dialogs';
import { checkInterviewContinuationState } from '../analysis-execution-helpers';
import { openChatWithInterviewCheckpoint } from '../interview-entry-checkpoint';
import type { AnalysisReport, Suggestion } from '../types';
import { buildAnalysisResultSnapshot } from './analysis-execution-result';
import { getLatestCareerProfile } from '../../../../src/career-profile-utils';
import {
  buildDiagnosisResumeFromProfile,
  hasCareerProfileForDiagnosis,
} from '../profile-diagnosis-resume';
import {
  shouldPromptForMissingJd,
  normalizeAnalysisMode,
  type AnalysisMode,
} from '../analysis-mode';
import { resolveAnalysisTargetValue } from '../target-role';
import {
  extractReusableAnalysisSnapshotForJd,
  hasReadyAnalysisSessionForJd,
  hasReusableSuggestionPayload,
} from '../analysis-reuse';

type QuotaKind =
  | 'analysis'
  | 'final_report'
  | 'interview';

type Params = {
  resumeData: any;
  analysisMode?: AnalysisMode;
  setResumeData?: (value: any) => void;
  jdText: string;
  targetCompany: string;
  setTargetCompany: (value: string) => void;
  userProfile?: any;
  optimizedResumeId: string | number | null;
  setOptimizedResumeId: (value: string | number | null) => void;
  optimizedResumeIdRef: { current: string | number | null };
  resolveOriginalResumeIdForOptimization: () => any;
  resolveAnalysisBinding: (
    originalResumeId: string | number,
    analysisJdText: string
  ) => Promise<{
    analysisReportId: string;
    optimizedResumeId: string | number | null;
    jdKey: string;
  } | null>;
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
    patch?: Partial<{ jdText: string; targetCompany: string; targetRole: string; score: number; step: string; error: string; force: boolean }>
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
  isInterviewMode?: boolean;
  openChat: (source: 'internal' | 'preview') => void;
  consumeUsageQuota?: (kind: QuotaKind, context?: { scenario?: string; mode?: string }) => Promise<boolean>;
  refundUsageQuota?: (kind: QuotaKind, note?: string) => Promise<boolean>;
  interviewEntryConfirmPendingRef?: { current: boolean };
};

export const useAnalysisExecution = ({
  resumeData,
  analysisMode,
  setResumeData,
  jdText,
  targetCompany,
  setTargetCompany,
  userProfile,
  optimizedResumeId,
  setOptimizedResumeId,
  optimizedResumeIdRef,
  resolveOriginalResumeIdForOptimization,
  resolveAnalysisBinding,
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
    opts?: {
      bypassCache?: boolean;
      targetRole?: string;
      careerProfile?: any;
      diagnosisResumeData?: any;
    }
  ) => {
    const latestCareerProfile = opts?.careerProfile || getLatestCareerProfile(userProfile);
    const diagnosisResumeData = opts?.diagnosisResumeData || (
      latestCareerProfile
        ? buildDiagnosisResumeFromProfile({
            profile: latestCareerProfile,
            targetRole: String(opts?.targetRole || '').trim(),
          })
        : resumeData
    );
    return runRealAnalysisRequest({
      interviewType,
      resumeData: diagnosisResumeData,
      careerProfile: latestCareerProfile,
      jdText,
      targetRole: String(opts?.targetRole || '').trim(),
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
    userProfile,
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
    const effectiveSessionTarget = resolveAnalysisTargetValue({
      isInterviewMode,
      analysisMode: normalizeAnalysisMode(analysisMode || (resumeData as any)?.analysisMode),
      stateTargetCompany: targetCompany,
      resumeTargetCompany: isInterviewMode ? resumeData?.targetCompany : '',
      resumeTargetRole: resumeData?.targetRole,
      resumeHasTargetRole: Object.prototype.hasOwnProperty.call(resumeData || {}, 'targetRole'),
    });
    const effectiveSessionTargetRole = isInterviewMode
      ? String(resumeData?.targetRole || '').trim()
      : String(effectiveSessionTarget || resumeData?.targetRole || '').trim();
    const latestCareerProfile = getLatestCareerProfile(userProfile);
    if (!hasCareerProfileForDiagnosis(latestCareerProfile)) {
      showToast('请先完善职业画像，再基于画像与JD生成诊断。', 'info', 2200);
      return;
    }
    const diagnosisResumeData = buildDiagnosisResumeFromProfile({
      profile: latestCareerProfile,
      targetRole: effectiveSessionTargetRole,
    });
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
      const kind: 'analysis' | 'interview' = isInterviewMode ? 'interview' : 'analysis';
      const allowed = await consumeUsageQuota(kind, isInterviewMode ? {
        scenario: normalizedInterviewType,
        mode: undefined
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
      openChatWithInterviewCheckpoint({
        persist: persistAnalysisSessionState,
        patch: {
          jdText: effectiveJd,
          targetCompany: effectiveSessionTarget,
          step: 'chat',
          force: true,
        },
        openChat,
        source: 'internal',
        timeoutMs: 1600,
        label: 'interview_in_progress state',
      });
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
      openChatWithInterviewCheckpoint({
        persist: persistAnalysisSessionState,
        patch: {
          jdText: effectiveJdText,
          targetCompany: effectiveSessionTarget,
          step: 'chat',
          force: true,
        },
        openChat,
        source: 'internal',
        timeoutMs: 1600,
        label: 'reused interview_in_progress state',
      });
      return;
    }

    setChatMessages([]);
    setChatInitialized(false);
    setOriginalResumeData(JSON.parse(JSON.stringify(diagnosisResumeData)));
    setAnalysisInProgress(true);
    navigateToStep('analyzing');
    persistAnalysisSessionState('analyzing', {
      jdText: jdText || resumeData.lastJdText || '',
      targetCompany: effectiveSessionTarget,
      targetRole: effectiveSessionTargetRole,
      step: 'analyzing',
      force: true,
    }).catch((stateErr) => {
      console.warn('Failed to persist analyzing session state:', stateErr);
    });

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
        targetRole: effectiveSessionTargetRole,
        careerProfile: latestCareerProfile,
        diagnosisResumeData,
      });
      if (analysisRunIdRef.current !== runId) return;
      if (!aiAnalysisResult) return;

      const {
        appliedSuggestions,
        report: newReport,
        totalScore,
        effectiveTargetCompany,
        effectiveTargetRole,
      } = buildAnalysisResultSnapshot({
        aiAnalysisResult,
        resumeData: diagnosisResumeData,
        targetCompany,
        targetRole: effectiveSessionTargetRole,
        analysisMode: normalizeAnalysisMode(analysisMode || (resumeData as any)?.analysisMode),
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
          // For initial diagnosis, only reuse an existing binding.
          // Do not auto-create optimized resumes here.
          const binding = await resolveAnalysisBinding(
            originalResumeId,
            jdText || resumeData.lastJdText || ''
          );
          if (binding?.analysisReportId) {
            resolvedAnalysisReportId = binding.analysisReportId;
          }
          if (binding?.optimizedResumeId) {
            resolvedOptimizedResumeId = binding.optimizedResumeId;
            optimizedResumeIdRef.current = binding.optimizedResumeId;
            setOptimizedResumeId(binding.optimizedResumeId);
          }
        } catch (bindingError) {
          console.warn('resolveAnalysisBinding failed, continue with local report rendering:', bindingError);
        }
      }

      const snapshotForPersist = {
        score: totalScore,
        summary: newReport.summary,
        strengths: newReport.strengths,
        weaknesses: newReport.weaknesses,
        missingKeywords: newReport.missingKeywords,
        scoreBreakdown: newReport.scoreBreakdown,
        suggestions: appliedSuggestions,
        updatedAt: new Date().toISOString(),
        jdText: jdText || resumeData.lastJdText || '',
        targetCompany: effectiveTargetCompany,
        targetRole: effectiveTargetRole,
        targetCompanyConfidence: 0,
        analysisReportId: resolvedAnalysisReportId || undefined,
        optimizedResumeId: resolvedOptimizedResumeId || undefined,
      };
      const persistTargetId =
        (resumeData.optimizationStatus === 'optimized' && resumeData.id)
          ? resumeData.id
          : (resolvedOptimizedResumeId || optimizedResumeIdRef.current || optimizedResumeId || resumeData.optimizedResumeId || resumeData.id || null);
      const safePersistTargetId = persistTargetId;
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
          targetRole: effectiveTargetRole,
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
          targetRole: effectiveTargetRole,
          score: totalScore,
          step: 'final_report',
          force: true,
        });
      } catch (stateErr) {
        console.warn('Failed to persist report_ready session state:', stateErr);
      }
      markAnalysisCompleted();
      navigateToStep('final_report');
    } catch (error) {
      if (analysisRunIdRef.current !== runId) return;
      console.error('AI analysis failed:', error);
      const message = String((error as any)?.message || '').trim();
      const isTimeout = message === 'analysis_timeout';
      const isCancelled = message === 'analysis_cancelled';
      try {
        await persistAnalysisSessionState('paused', {
          jdText: jdText || resumeData?.lastJdText || '',
          targetCompany: effectiveSessionTarget,
          targetRole: effectiveSessionTargetRole,
          step: opts?.preserveReportOnError ? 'final_report' : 'jd_input',
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
        navigateToStep('final_report');
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
    resolveAnalysisBinding,
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
    analysisMode,
    isInterviewMode,
    consumeUsageQuota,
    refundUsageQuota,
    interviewEntryConfirmPendingRef,
    userProfile,
  ]);

  const handleStartAnalysisClick = useCallback(async (
    interviewType?: string,
    options?: {
      analysisMode?: AnalysisMode;
      action?: 'reuse_existing' | 'regenerate';
      forceRegenerate?: boolean;
    }
  ) => {
    const effectiveMode = normalizeAnalysisMode(
      options?.analysisMode || analysisMode || (resumeData as any)?.analysisMode
    );
    if (!isInterviewMode && options?.action === 'reuse_existing') {
      const reusable = extractReusableAnalysisSnapshotForJd({
        resumeData,
        jdText,
        targetCompany,
        analysisMode: effectiveMode,
      });
      if (reusable) {
        setOriginalScore(reusable.score);
        setScore(reusable.score);
        setSuggestions(
          hasReusableSuggestionPayload(reusable)
            ? (reusable.suggestions as Suggestion[])
            : []
        );
        setReport({
          summary: reusable.summary,
          strengths: reusable.strengths,
          weaknesses: reusable.weaknesses,
          missingKeywords: reusable.missingKeywords,
          scoreBreakdown: reusable.scoreBreakdown,
        });
        setTargetCompany(reusable.targetRole);
        setIsFromCache(true);
        try {
          await persistAnalysisSessionState('report_ready', {
            jdText: reusable.jdText,
            targetCompany: String(reusable.targetRole || ''),
            targetRole: String(reusable.targetRole || ''),
            score: reusable.score,
            step: 'final_report',
            force: true,
          });
        } catch (stateErr) {
          console.warn('Failed to persist report_ready during reuse:', stateErr);
        }
        navigateToStep('final_report');
        showToast('已加载该 JD 的历史结果。', 'success', 1800);
        return;
      }

      if (hasReadyAnalysisSessionForJd({ resumeData, jdText })) {
        navigateToStep('final_report');
        showToast('已尝试打开该 JD 的历史报告。', 'info', 1800);
        return;
      }

      showToast('未找到可复用结果，请选择重新生成。', 'info', 2200);
      return;
    }
    if (shouldPromptForMissingJd({
      isInterviewMode,
      jdText,
      analysisMode: effectiveMode,
    })) {
      showToast('请先填写职位描述，再开始定向优化。', 'info', 1800);
      return;
    }
    await startAnalysis(interviewType, {
      bypassCache: Boolean(options?.forceRegenerate || options?.action === 'regenerate'),
    });
  }, [
    analysisMode,
    isInterviewMode,
    jdText,
    navigateToStep,
    persistAnalysisSessionState,
    resumeData,
    setOriginalScore,
    setReport,
    setScore,
    setSuggestions,
    setTargetCompany,
    setIsFromCache,
    showToast,
    startAnalysis,
    targetCompany,
  ]);

  return {
    cancelInFlightAnalysis,
    startAnalysis,
    handleStartAnalysisClick,
  };
};
