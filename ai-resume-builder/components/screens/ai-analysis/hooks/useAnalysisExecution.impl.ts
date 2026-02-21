import { useCallback } from 'react';
import { toSkillList } from '../../../../src/skill-utils';
import { createMasker } from '../chat-payload';
import { normalizeScoreBreakdown, resolveDisplayScore } from '../analysis-mappers';
import { consolidateSkillSuggestions, inferTargetSection, normalizeTargetSection } from '../suggestion-helpers';
import { sanitizeReasonText, sanitizeSuggestedValue, isGenderRelatedSuggestion, isEducationRelatedSuggestion } from '../chat-formatters';
import { runRealAnalysis } from '../analysis-api';
import { getTargetCompanyAutofillMinConfidence } from '../analysis-config';
import { makeJdKey } from '../id-utils';
import { getActiveInterviewMode, getActiveInterviewType } from '../interview-plan-utils';
import { confirmDialog } from '../../../../src/ui/dialogs';
import type { AnalysisReport, Suggestion } from '../types';

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
}: Params) => {
  const CACHE_BYPASS_ONCE_KEY = 'ai_analysis_bypass_cache_once';
  const generateRealAnalysis = useCallback(async (runId: string, interviewType?: string) => {
    return runRealAnalysis({
      interviewType,
      resumeData,
      jdText,
      getBackendAuthToken,
      showToast,
      buildApiUrl,
      createMasker,
      getRagEnabledFlag,
      analysisAbortRef: analysisAbortRef as any,
      analysisRunIdRef: analysisRunIdRef as any,
      runId,
      setIsFromCache,
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

  const generateRealAnalysisWithOptions = useCallback(async (
    runId: string,
    interviewType?: string,
    opts?: { bypassCache?: boolean }
  ) => {
    return runRealAnalysis({
      interviewType,
      resumeData,
      jdText,
      getBackendAuthToken,
      showToast,
      buildApiUrl,
      createMasker,
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
    const effectiveJdText = (jdText || resumeData?.lastJdText || '').trim();
    const interviewSessions = (resumeData as any)?.interviewSessions || {};
    const analysisSessionByJd = (resumeData as any)?.analysisSessionByJd || {};
    const isSessionModeMatchedForQuota = (session: any) => {
      const mode = String(session?.interviewMode || '').trim().toLowerCase();
      // Legacy session without mode marker: treat as matched for quota protection.
      if (!mode) return true;
      return mode === normalizedInterviewMode;
    };
    const isSessionTypeMatchedForQuota = (session: any) => {
      const sessionType = String(session?.interviewType || '').trim().toLowerCase();
      if (!sessionType) return true;
      return sessionType === normalizedInterviewType;
    };
    const hasInterruptedSessionForJdKey = (jdKey: string) => {
      const matchingStates = Object.values(analysisSessionByJd || {}).filter((session: any) => {
        if (!session) return false;
        const state = String(session?.state || '').toLowerCase();
        if (state !== 'paused' && state !== 'interview_in_progress') return false;
        const stateJdKey = String(session?.jdKey || '').trim() || makeJdKey(String(session?.jdText || '').trim() || '__no_jd__');
        if (stateJdKey !== jdKey) return false;
        if (!isSessionModeMatchedForQuota(session)) return false;
        if (!isSessionTypeMatchedForQuota(session)) return false;
        return true;
      });
      return matchingStates.length > 0;
    };
    const effectiveJdKey = makeJdKey(effectiveJdText);
    const hasInterruptedOnEffectiveJd = !!effectiveJdText && hasInterruptedSessionForJdKey(effectiveJdKey);
    const hasAnyInterruptedInterview = Object.values(analysisSessionByJd || {}).some((session: any) => {
      if (!session) return false;
      const state = String(session?.state || '').toLowerCase();
      if (state !== 'paused' && state !== 'interview_in_progress') return false;
      if (!isSessionModeMatchedForQuota(session)) return false;
      if (!isSessionTypeMatchedForQuota(session)) return false;
      return true;
    });
    const isContinuingInterview = Boolean(
      isInterviewMode &&
      (hasInterruptedOnEffectiveJd || hasAnyInterruptedInterview)
    );
    if (isInterviewMode) {
      const confirmed = await confirmDialog(
        '开始面试前提醒：请预留一段完整时间参与本次面试，尽量不要中途退出或切换页面。确认现在进入面试吗？'
      );
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

      const newSuggestions: Suggestion[] = [];
      const analysisStage = String((aiAnalysisResult as any)?.analysisStage || '').toLowerCase();
      const preInterviewOnly = analysisStage === 'pre_interview';
      const backendSuggestions = preInterviewOnly ? [] : (aiAnalysisResult.suggestions || []);
      const currentSkillsText = Array.isArray(resumeData?.skills) && resumeData.skills.length > 0
        ? resumeData.skills.filter(Boolean).join('、')
        : '';
      const hasProjectExperience = Array.isArray(resumeData?.projects) && resumeData.projects.some((item: any) => {
        const title = String(item?.title || '').trim();
        const subtitle = String(item?.subtitle || '').trim();
        const description = String(item?.description || '').trim();
        return !!(title || subtitle || description);
      });
      const isProjectSuggestion = (item: any) => {
        const blob = String([
          item?.targetSection,
          item?.targetField,
          item?.title,
          item?.reason,
          typeof item?.suggestedValue === 'string' ? item.suggestedValue : ''
        ].filter(Boolean).join(' ')).toLowerCase();
        return /(项目|project)/.test(blob) && /(补充|新增|添加|完善|增加|缺少|缺失|补全|丰富)/.test(blob);
      };

      backendSuggestions.forEach((suggestion: any, index: number) => {
        if (isGenderRelatedSuggestion(suggestion)) return;
        if (isEducationRelatedSuggestion(suggestion)) return;
        if (typeof suggestion === 'string') {
          newSuggestions.push({
            id: `ai-suggestion-${index}`,
            type: 'optimization',
            title: '优化建议',
            reason: sanitizeReasonText(suggestion),
            targetSection: 'skills',
            targetId: undefined,
            targetField: undefined,
            suggestedValue: undefined,
            originalValue: currentSkillsText || undefined,
            status: 'pending' as const
          });
          return;
        }

        let inferredSection = normalizeTargetSection(suggestion.targetSection) || inferTargetSection(suggestion);
        if (!hasProjectExperience && isProjectSuggestion(suggestion)) {
          inferredSection = 'projects';
        }
        const originalValue =
          suggestion.originalValue ||
          (inferredSection === 'skills' ? (currentSkillsText || undefined) : undefined);
        newSuggestions.push({
          id: suggestion.id || `ai-suggestion-${index}`,
          type: suggestion.type || 'optimization',
          title: suggestion.title || '优化建议',
          reason: sanitizeReasonText(suggestion.reason || '根据AI诊断结果'),
          targetSection: inferredSection,
          targetId: suggestion.targetId,
          targetField: suggestion.targetField,
          suggestedValue: inferredSection === 'skills'
            ? toSkillList(suggestion.suggestedValue)
            : sanitizeSuggestedValue(suggestion.suggestedValue, inferredSection),
          originalValue,
          status: 'pending' as const
        });
      });

      if (!preInterviewOnly && !hasProjectExperience) {
        const hasProjectAdvice = newSuggestions.some((s) => s.targetSection === 'projects');
        if (!hasProjectAdvice) {
          newSuggestions.push({
            id: `ai-suggestion-project-bootstrap-${Date.now()}`,
            type: 'missing',
            title: '补充项目经历',
            reason: '当前简历缺少项目经历。建议新增 1-2 个与目标岗位高度相关的项目，突出目标、行动与量化结果。',
            targetSection: 'projects',
            targetField: 'description',
            suggestedValue: '示例结构：项目背景与目标、个人职责、关键行动、量化结果（如效率提升/成本下降/转化提升）。',
            originalValue: '',
            status: 'pending',
          });
        }
      }

      const normalizedBreakdown = normalizeScoreBreakdown(
        aiAnalysisResult.scoreBreakdown || {
          experience: 75,
          skills: 80,
          format: 90
        },
        aiAnalysisResult.score || 0
      );

      const newReport: AnalysisReport = {
        summary: aiAnalysisResult.summary || 'AI诊断完成，请查看详细报告。',
        microInterviewFirstQuestion: String((aiAnalysisResult as any).microInterviewFirstQuestion || '').trim(),
        strengths: aiAnalysisResult.strengths || ['结构清晰'],
        weaknesses: aiAnalysisResult.weaknesses || ['需要进一步优化'],
        missingKeywords: aiAnalysisResult.missingKeywords,
        scoreBreakdown: normalizedBreakdown
      };

      const totalScore = resolveDisplayScore(aiAnalysisResult.score || 0, newReport.scoreBreakdown);
      const extractedTargetCompany = String(aiAnalysisResult.targetCompany || '').trim();
      const extractedTargetCompanyConfidence = Math.max(
        0,
        Math.min(1, Number(aiAnalysisResult.targetCompanyConfidence || 0))
      );
      const autofillMinConfidence = getTargetCompanyAutofillMinConfidence();
      const shouldAutofillTargetCompany = Boolean(
        !targetCompany &&
        extractedTargetCompany &&
        extractedTargetCompanyConfidence >= autofillMinConfidence
      );
      const effectiveTargetCompany = String(
        targetCompany ||
        (shouldAutofillTargetCompany ? extractedTargetCompany : '') ||
        resumeData.targetCompany ||
        ''
      ).trim();
      if (shouldAutofillTargetCompany && effectiveTargetCompany) {
        setTargetCompany(effectiveTargetCompany);
      }
      setOriginalScore(totalScore);
      setScore(totalScore);
      const appliedSuggestions = consolidateSkillSuggestions(newSuggestions);
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
        targetCompanyConfidence: extractedTargetCompanyConfidence,
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
      const decideMicroInterviewNeeded = () => {
        if (isInterviewMode) return true;

        // Prefer backend explicit decision if provided.
        const backendDecisionRaw =
          (aiAnalysisResult as any)?.microInterviewNeeded ??
          (aiAnalysisResult as any)?.needsMicroInterview ??
          (aiAnalysisResult as any)?.followUpRequired;
        if (typeof backendDecisionRaw === 'boolean') {
          return backendDecisionRaw;
        }

        const pendingSuggestions = (appliedSuggestions || []).length;
        const weaknessCount = (newReport.weaknesses || [])
          .filter((w) => String(w || '').trim() && !/需要进一步优化/.test(String(w))).length;
        const missingKeywordCount = (newReport.missingKeywords || [])
          .filter((k) => String(k || '').trim()).length;
        const summary = String(newReport.summary || '').toLowerCase();
        const strongSummarySignal = /(非常完善|可直接投递|匹配度高|无明显短板|无明显问题)/.test(summary);

        // Heuristic: very complete profile can skip micro-interview.
        const looksComplete =
          totalScore >= 92 &&
          pendingSuggestions <= 1 &&
          weaknessCount <= 1 &&
          missingKeywordCount <= 2;

        return !(looksComplete || strongSummarySignal);
      };

      const shouldEnterMicroInterview = decideMicroInterviewNeeded();
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
    generateRealAnalysis,
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
  ]);

  const handleStartAnalysisClick = useCallback((interviewType?: string) => {
    const hasJd = !!jdText.trim();
    if (!hasJd) {
      setShowJdEmptyModal(true);
      return;
    }
    void startAnalysis(interviewType);
  }, [jdText, setShowJdEmptyModal, startAnalysis]);

  return {
    cancelInFlightAnalysis,
    startAnalysis,
    handleStartAnalysisClick,
  };
};
