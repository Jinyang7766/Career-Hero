import { useCallback } from 'react';
import { toSkillList } from '../../../../src/skill-utils';
import { createMasker } from '../chat-payload';
import { normalizeScoreBreakdown, resolveDisplayScore } from '../analysis-mappers';
import { applySuggestionFeedback, consolidateSkillSuggestions, inferTargetSection, normalizeTargetSection } from '../suggestion-helpers';
import { sanitizeReasonText, sanitizeSuggestedValue, isGenderRelatedSuggestion } from '../chat-formatters';
import { runRealAnalysis } from '../analysis-api';
import type { AnalysisReport, Suggestion } from '../types';

type Params = {
  resumeData: any;
  jdText: string;
  targetCompany: string;
  optimizedResumeId: string | number | null;
  optimizedResumeIdRef: { current: string | number | null };
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
};

export const useAnalysisExecution = ({
  resumeData,
  jdText,
  targetCompany,
  optimizedResumeId,
  optimizedResumeIdRef,
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
}: Params) => {
  const generateRealAnalysis = useCallback(async (runId: string) => {
    return runRealAnalysis({
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

  const cancelInFlightAnalysis = useCallback((message?: string) => {
    analysisRunIdRef.current = null;
    if (analysisAbortRef.current) {
      try { analysisAbortRef.current.abort(); } catch { /* ignore */ }
    }
    analysisAbortRef.current = null;
    setAnalysisInProgress(false);
    if (message) {
      showToast(message, 'error', 2600);
    }
    setCurrentStep('jd_input');
  }, [analysisAbortRef, analysisRunIdRef, setAnalysisInProgress, setCurrentStep, showToast]);

  const startAnalysis = useCallback(async () => {
    if (!resumeData) {
      console.error('startAnalysis - resumeData is null or undefined');
      alert('无法进行 AI 分析：没有找到简历数据');
      return;
    }

    console.log('startAnalysis - Resume data:', resumeData);

    if (analysisRunIdRef.current) {
      cancelInFlightAnalysis();
    }
    const runId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    analysisRunIdRef.current = runId;

    setChatMessages([]);
    setChatInitialized(false);
    setOriginalResumeData(JSON.parse(JSON.stringify(resumeData)));
    setAnalysisInProgress(true);
    navigateToStep('analyzing');

    try {
      const aiAnalysisResult = await generateRealAnalysis(runId);
      if (analysisRunIdRef.current !== runId) return;
      if (!aiAnalysisResult) return;

      const newSuggestions: Suggestion[] = [];
      const backendSuggestions = aiAnalysisResult.suggestions || [];
      const currentSkillsText = Array.isArray(resumeData?.skills) && resumeData.skills.length > 0
        ? resumeData.skills.filter(Boolean).join('、')
        : '';

      backendSuggestions.forEach((suggestion: any, index: number) => {
        if (isGenderRelatedSuggestion(suggestion)) return;
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

        const inferredSection = normalizeTargetSection(suggestion.targetSection) || inferTargetSection(suggestion);
        const originalValue =
          suggestion.originalValue ||
          (inferredSection === 'skills' ? (currentSkillsText || undefined) : undefined);
        newSuggestions.push({
          id: suggestion.id || `ai-suggestion-${index}`,
          type: suggestion.type || 'optimization',
          title: suggestion.title || '优化建议',
          reason: sanitizeReasonText(suggestion.reason || '根据AI分析结果'),
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

      const normalizedBreakdown = normalizeScoreBreakdown(
        aiAnalysisResult.scoreBreakdown || {
          experience: 75,
          skills: 80,
          format: 90
        },
        aiAnalysisResult.score || 0
      );

      const newReport: AnalysisReport = {
        summary: aiAnalysisResult.summary || 'AI分析完成，请查看详细报告。',
        strengths: aiAnalysisResult.strengths || ['结构清晰'],
        weaknesses: aiAnalysisResult.weaknesses || ['需要进一步优化'],
        missingKeywords: aiAnalysisResult.missingKeywords,
        scoreBreakdown: normalizedBreakdown
      };

      const totalScore = resolveDisplayScore(aiAnalysisResult.score || 0, newReport.scoreBreakdown);
      setOriginalScore(totalScore);
      setScore(totalScore);
      const appliedSuggestions = applySuggestionFeedback(
        consolidateSkillSuggestions(newSuggestions),
        resumeData?.aiSuggestionFeedback || {}
      );
      setSuggestions(appliedSuggestions);
      setReport(newReport);
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
        targetCompany: targetCompany || resumeData.targetCompany || ''
      };
      const persistTargetId =
        (resumeData.optimizationStatus === 'optimized' && resumeData.id)
          ? resumeData.id
          : (optimizedResumeIdRef.current || optimizedResumeId || resumeData.optimizedResumeId || null);
      if (persistTargetId) {
        await persistAnalysisSnapshot(
          { ...resumeData, id: persistTargetId as any },
          newReport,
          totalScore,
          appliedSuggestions
        );
      }
      if (resumeData?.id) {
        saveLastAnalysis({
          resumeId: resumeData.id,
          jdText: jdText || resumeData.lastJdText || '',
          targetCompany: targetCompany || resumeData.targetCompany || '',
          snapshot: snapshotForPersist,
          updatedAt: snapshotForPersist.updatedAt
        });
        setAnalysisResumeId(resumeData.id);
      }
      markAnalysisCompleted();
      navigateToStep('report', true);
    } catch (error) {
      if (analysisRunIdRef.current !== runId) return;
      console.error('AI analysis failed:', error);
      showToast(`AI 分析失败：${(error as any)?.message || '网络连接异常，请稍后重试'}`, 'error', 2600);
      navigateToStep('jd_input');
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
    jdText,
    markAnalysisCompleted,
    navigateToStep,
    optimizedResumeId,
    optimizedResumeIdRef,
    persistAnalysisSnapshot,
    resumeData,
    saveLastAnalysis,
    setAnalysisInProgress,
    setAnalysisResumeId,
    setChatInitialized,
    setChatMessages,
    setOriginalResumeData,
    setOriginalScore,
    setReport,
    setScore,
    setSuggestions,
    showToast,
    targetCompany,
  ]);

  const handleStartAnalysisClick = useCallback(() => {
    if (!jdText.trim()) {
      setShowJdEmptyModal(true);
      return;
    }
    void startAnalysis();
  }, [jdText, setShowJdEmptyModal, startAnalysis]);

  return {
    cancelInFlightAnalysis,
    startAnalysis,
    handleStartAnalysisClick,
  };
};
