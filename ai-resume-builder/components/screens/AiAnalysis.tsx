import React from 'react';
import { ScreenProps, ResumeData, View } from '../../types';
import { buildApiUrl } from '../../src/api-config';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppContext } from '../../src/app-context';
import { useChatViewport } from './ai-analysis/hooks/useChatViewport';
import { useInterviewSessionStore } from './ai-analysis/hooks/useInterviewSessionStore';
import { useResumeSelection } from './ai-analysis/hooks/useResumeSelection';
import { useAiAnalysisNavigation } from './ai-analysis/hooks/useAiAnalysisNavigation';
import { useToastOverlay } from './ai-analysis/hooks/useToastOverlay';
import { useInterviewChat } from './ai-analysis/hooks/useInterviewChat';
import { useAnalysisPersistence } from './ai-analysis/hooks/useAnalysisPersistence';
import { useOptimizedResumeStore } from './ai-analysis/hooks/useOptimizedResumeStore';
import { useJdScreenshotUpload } from './ai-analysis/hooks/useJdScreenshotUpload';
import { useAiRouteSync } from './ai-analysis/hooks/useAiRouteSync';
import { useAnalysisRuntime } from './ai-analysis/hooks/useAnalysisRuntime';
import { useAnalysisSnapshotApplier } from './ai-analysis/hooks/useAnalysisSnapshotApplier';
import { useAnalysisExecution } from './ai-analysis/hooks/useAnalysisExecution';
import { useUsageQuota } from './ai-analysis/hooks/useUsageQuota';
import { useAiAnalysisPageState } from './ai-analysis/hooks/useAiAnalysisPageState';
import { useAiAnalysisPageEffects } from './ai-analysis/hooks/useAiAnalysisPageEffects';
import { useAiAnalysisPassiveFlows } from './ai-analysis/hooks/useAiAnalysisPassiveFlows';
import { useAiAnalysisPostInterviewFlow } from './ai-analysis/hooks/useAiAnalysisPostInterviewFlow';
import { useAiAnalysisInteractionBundle } from './ai-analysis/hooks/useAiAnalysisInteractionBundle';
import { useAiAnalysisFeedback } from './ai-analysis/hooks/useAiAnalysisFeedback';
import { useInterviewSceneReset } from './ai-analysis/hooks/useInterviewSceneReset';
import { usePersistedInterviewSummaryHydration } from './ai-analysis/hooks/usePersistedInterviewSummaryHydration';
import { useAnalysisModeState } from './ai-analysis/hooks/useAnalysisModeState';
import {
  formatInterviewQuestion,
  isSelfIntroQuestion,
} from './ai-analysis/chat-formatters';
import { getBackendAuthToken } from './ai-analysis/auth';
import { getRagEnabledFlag } from './ai-analysis/analysis-config';
import { isSameResumeId, normalizeResumeId } from './ai-analysis/id-utils';
import { useAppStore } from '../../src/app-store';
import { useUserProfile } from '../../src/useUserProfile';
import { isCareerProfileComplete, isGuidedFlowActive, isGuidedFlowEnabled } from '../../src/guided-flow';
import {
  parseReferenceReply,
  splitNextQuestion,
  stripMarkdownTableSeparators,
  isAffirmative
} from './ai-analysis/chat-text';
import {
  getActiveInterviewFocus,
  getActiveInterviewMode,
  getActiveInterviewType,
  getInterviewerAvatarUrl,
  getInterviewerTitle,
} from './ai-analysis/interview-plan-utils';
import { renderAiAnalysisStep } from './ai-analysis/step-renderer';
import type { AiAnalysisStep } from './ai-analysis/step-types';
import { buildAiAnalysisRenderProps } from './ai-analysis/build-ai-analysis-render-props';
import { hasMeaningfulResumeData } from './preview/hooks/usePreviewRestore';
import { writePreviewBackTarget, writePreviewResumeId } from './preview/preview-storage';
import {
  resolveStep3TargetInputValue,
  shouldPersistTargetRole,
} from './ai-analysis/target-role';

const AiAnalysis: React.FC<ScreenProps> = ({ isInterviewMode }) => {
  const navigateToView = useAppContext((s) => s.navigateToView);
  const currentUser = useAppContext((s) => s.currentUser);
  const currentUserId = String(currentUser?.id || '').trim();
  const { userProfile } = useUserProfile(currentUser?.id, currentUser);
  const guidedFlowEnabled = isGuidedFlowEnabled();
  const isProfileReadyForGuidedFlow = React.useMemo(
    () => isCareerProfileComplete(userProfile),
    [userProfile]
  );
  const legacySoftGatePromptedRef = React.useRef(false);
  const goBack = useAppContext((s) => s.goBack);
  const resumeData = useAppStore((state) => state.resumeData);
  const setResumeData = useAppStore((state) => state.setResumeData);
  const allResumes = useAppStore((state) => state.allResumes);
  const setAllResumes = useAppStore((state) => state.setAllResumes);
  const setIsNavHidden = useAppStore((state) => state.setIsNavHidden);
  const navigate = useNavigate();
  const location = useLocation();

  // Skill normalization moved to `src/skill-utils.ts` so resume import and suggestion generation stay consistent.
  const {
    currentStep,
    setCurrentStep,
    selectedResumeId,
    setSelectedResumeId,
    searchQuery,
    setSearchQuery,
    sourceResumeIdRef,
    forcedResumeSelectRef,
    prevStepRef,
    originalResumeData,
    setOriginalResumeData,
    jdText,
    setJdText,
    targetCompany,
    setTargetCompany,
    originalScore,
    setOriginalScore,
    score,
    setScore,
    suggestions,
    setSuggestions,
    report,
    setReport,
    postInterviewSummary,
    setPostInterviewSummary,
    chatMessages,
    setChatMessages,
    chatMessagesRef,
    inputMessage,
    setInputMessage,
    interviewPlan,
    setInterviewPlan,
    planFetchTrigger,
    setPlanFetchTrigger,
    planLoaderMountedRef,
    planAutoHealRef,
    isInterviewEntry,
    setIsInterviewEntry,
    forceReportEntry,
    setForceReportEntry,
    expandedReferences,
    setExpandedReferences,
    chatInitialized,
    setChatInitialized,
    recoveredSessionKeyRef,
    chatIntroScheduledRef,
    interviewEntryConfirmPendingRef,
    playingAudioId,
    setPlayingAudioId,
    audioPlayerRef,
    userAvatar,
    setUserAvatar,
    isFromCache,
    setIsFromCache,
    optimizedResumeId,
    setOptimizedResumeId,
    isOptimizedOpen,
    setIsOptimizedOpen,
    isUnoptimizedOpen,
    setIsUnoptimizedOpen,
  } = useAiAnalysisPageState();
  const interviewPlanConfigKey = `${getActiveInterviewType()}|${getActiveInterviewMode()}|${getActiveInterviewFocus()}`;
  const {
    saveLastAnalysis,
    loadLastAnalysis,
    clearLastAnalysis,
    makeJdKey,
    getAnalysisSession,
    persistAnalysisSessionState,
    restoreInterviewSession,
    persistInterviewSession,
    hasInterviewSessionMessages,
    clearInterviewSession,
    clearInterviewSceneState,
  } = useInterviewSessionStore({
    currentUserId: currentUser?.id,
    isInterviewMode,
    resumeData,
    setResumeData: setResumeData as any,
    jdText,
    setJdText,
    targetCompany,
    setTargetCompany,
    setChatMessages: setChatMessages as any,
    setChatInitialized,
  });
  const {
    stepHistory,
    setStepHistory,
    chatEntrySource,
    setChatEntrySource,
    lastChatStep,
    setLastChatStep,
    navigateToStep,
    openChat,
    handleStepBack,
  } = useAiAnalysisNavigation({
    currentStep,
    setCurrentStep: setCurrentStep as any,
    restoreInterviewSession: restoreInterviewSession as any,
    setIsInterviewEntry,
    isInterviewMode,
    goBack: goBack as any,
  });
  const suppressDiagnosisChatNormalizationRef = React.useRef(false);
  const suppressDiagnosisSessionRecoveryRef = React.useRef(false);
  const { showToast, ToastOverlay } = useToastOverlay();
  const { isUploading, handleScreenshotUpload } = useJdScreenshotUpload({
    getBackendAuthToken,
    buildApiUrl,
    setJdText,
    jdText,
  });
  const { isSending, hasPendingReply, currentQuestionElapsedSec, interruptCurrentThinking, handleSendMessage } = useInterviewChat({
    currentUserId: currentUser?.id,
    isInterviewMode,
    currentStep,
    inputMessage,
    setInputMessage,
    chatMessagesRef: chatMessagesRef as any,
    setChatMessages: setChatMessages as any,
    persistInterviewSession: persistInterviewSession as any,
    persistAnalysisSessionState,
    jdText,
    getBackendAuthToken,
    buildApiUrl,
    resumeData,
    score,
    suggestions,
    interviewPlan,
    plannedQuestionCount: interviewPlan.length,
    isAffirmative,
    splitNextQuestion,
    stripMarkdownTableSeparators,
    formatInterviewQuestion,
    isSelfIntroQuestion,
    onInterviewCompleted: (summaryText, _finalMessages, options) => {
      if (options?.skipSummary && !isInterviewMode) {
        setPostInterviewSummary('');
        navigateToStep('final_report', true);
        return;
      }
      setPostInterviewSummary(String(summaryText || '').trim());
      navigateToStep(isInterviewMode ? 'interview_report' : 'final_report', true);
    },
    onInterviewReportGenerating: () => {
      if (!isInterviewMode) return;
      navigateToStep('interview_report_loading', true);
    },
    onInterviewReportFailed: () => {
      if (!isInterviewMode) return;
      navigateToStep('chat', true);
    },
  });

  const {
    messagesEndRef,
    messagesContainerRef,
    inputBarRef,
    keyboardOffset,
    isKeyboardOpen,
    inputBarHeight,
    onMessagesScroll: handleMessagesScroll
  } = useChatViewport({ currentStep, chatMessages, isSending });
  const {
    analysisRunIdRef,
    analysisAbortRef,
    inprogressAtKey: INPROGRESS_AT_KEY,
    setAnalysisResumeId,
    setAnalysisInProgress,
    isAnalysisStillInProgress,
    markAnalysisCompleted,
  } = useAnalysisRuntime({
    loadLastAnalysis: loadLastAnalysis as any,
    setStepHistory: setStepHistory as any,
    setCurrentStep: setCurrentStep as any,
    setChatEntrySource,
    setLastChatStep,
  });
  useAiRouteSync({
    currentStep,
    selectedResumeId,
    setSelectedResumeId,
    sourceResumeIdRef: sourceResumeIdRef as any,
    setAnalysisResumeId,
    navigate,
  });

  const { analysisMode, setAnalysisMode } = useAnalysisModeState({
    resumeData: resumeData as any,
    setResumeData: setResumeData as any,
    isInterviewMode,
  });

  React.useEffect(() => {
    if (!isInterviewMode) return;
    if (String(targetCompany || '').trim()) return;
    const resumeHasTargetRole = Object.prototype.hasOwnProperty.call((resumeData as any) || {}, 'targetRole');
    const resolvedTarget = resolveStep3TargetInputValue({
      isInterviewMode,
      analysisMode,
      stateTargetCompany: '',
      resumeTargetCompany: String((resumeData as any)?.targetCompany || ''),
      resumeTargetRole: String((resumeData as any)?.targetRole || ''),
      resumeHasTargetRole,
    });
    if (!resolvedTarget) return;
    setTargetCompany(resolvedTarget);
  }, [
    analysisMode,
    isInterviewMode,
    targetCompany,
    resumeData?.id,
    (resumeData as any)?.targetCompany,
    (resumeData as any)?.targetRole,
    setTargetCompany,
  ]);

  React.useEffect(() => {
    if (
      !shouldPersistTargetRole({
        isInterviewMode,
        analysisMode,
      })
    ) {
      return;
    }
    const normalizedRole = String(targetCompany || '').trim();
    setResumeData((prev: any) => {
      if (!prev || typeof prev !== 'object') return prev;
      if (String((prev as any)?.targetRole || '').trim() === normalizedRole) return prev;
      return {
        ...prev,
        targetRole: normalizedRole,
      };
    });
  }, [analysisMode, isInterviewMode, setResumeData, targetCompany]);

  useAiAnalysisPageEffects({
    currentStep,
    setCurrentStep: setCurrentStep as (step: AiAnalysisStep) => void,
    setIsNavHidden,
    prevStepRef,
    setTargetCompany,
    setJdText,
    setInterviewPlan,
    interviewPlanLength: interviewPlan.length,
    isInterviewMode,
    resumeId: resumeData?.id,
    jdText,
    resumeLastJdText: resumeData?.lastJdText,
    makeJdKey,
    planAutoHealRef,
    setPlanFetchTrigger,
    planLoaderMountedRef,
    currentUserId: currentUser?.id,
    userAvatarUrl: (userProfile as any)?.avatar_url,
    setUserAvatar,
    pathname: location.pathname,
    forcedResumeSelectRef,
    setStepHistory: setStepHistory as any,
    setSelectedResumeId,
    sourceResumeIdRef,
    setOptimizedResumeId,
    setAnalysisResumeId,
  });

  const { applyAnalysisSnapshot } = useAnalysisSnapshotApplier({
    setOriginalScore,
    setScore,
    setSuggestions: setSuggestions as any,
    setReport: setReport as any,
    setIsFromCache,
  });

  const {
    optimizedResumeIdRef,
    resolveOriginalResumeIdForOptimization,
    resolveAnalysisBinding,
  } = useOptimizedResumeStore({
    optimizedResumeId,
    setOptimizedResumeId,
    sourceResumeIdRef: sourceResumeIdRef as any,
    selectedResumeId,
    resumeData,
    allResumes,
    jdText,
    targetCompany,
    analysisMode,
    isSameResumeId,
    normalizeResumeId,
  });
  const { resumeReadState, handleResumeSelect } = useResumeSelection({
    allResumes: allResumes as any,
    resumeData,
    setResumeData: setResumeData as any,
    currentStep,
    setSelectedResumeId,
    sourceResumeIdRef: sourceResumeIdRef as any,
    setAnalysisResumeId,
    setJdText,
    setTargetCompany,
    navigateToStep: navigateToStep as any,
    openChat,
    setOptimizedResumeId,
    applyAnalysisSnapshot,
    saveLastAnalysis,
    showToast,
    isSameResumeId,
    isInterviewMode,
  });

  const { persistAnalysisSnapshot } = useAnalysisPersistence({
    resumeData,
    setResumeData: setResumeData as any,
    jdText,
    targetCompany,
  });
  const { consumeUsageQuota, refundUsageQuota } = useUsageQuota({
    currentUserId: currentUser?.id,
    navigateToView,
    showToast,
  });

  // --- Handlers ---
  const { cancelInFlightAnalysis, startAnalysis, handleStartAnalysisClick } = useAnalysisExecution({
    resumeData,
    analysisMode,
    setResumeData: setResumeData as any,
    jdText,
    targetCompany,
    setTargetCompany,
    userProfile,
    optimizedResumeId,
    setOptimizedResumeId,
    optimizedResumeIdRef: optimizedResumeIdRef as any,
    resolveOriginalResumeIdForOptimization,
    resolveAnalysisBinding: resolveAnalysisBinding as any,
    analysisRunIdRef: analysisRunIdRef as any,
    analysisAbortRef: analysisAbortRef as any,
    setIsFromCache,
    setAnalysisInProgress,
    setCurrentStep,
    setChatMessages: setChatMessages as any,
    setChatInitialized,
    setOriginalResumeData,
    setOriginalScore,
    setScore,
    setSuggestions: setSuggestions as any,
    setReport: setReport as any,
    persistAnalysisSessionState,
    persistAnalysisSnapshot: persistAnalysisSnapshot as any,
    saveLastAnalysis,
    setAnalysisResumeId,
    markAnalysisCompleted,
    navigateToStep: navigateToStep as any,
    showToast,
    getBackendAuthToken,
    buildApiUrl,
    getRagEnabledFlag,
    isInterviewMode,
    openChat,
    consumeUsageQuota,
    refundUsageQuota,
    interviewEntryConfirmPendingRef,
  });

  useAiAnalysisPassiveFlows({
    isInterviewMode,
    currentStep,
    chatInitialized,
    chatMessagesRef: chatMessagesRef as any,
    chatIntroScheduledRef: chatIntroScheduledRef as any,
    setChatInitialized,
    setChatMessages: setChatMessages as any,
    resumeData,
    jdText,
    analysisMode,
    chatEntrySource,
    score,
    suggestionsLength: suggestions.length,
    setChatEntrySource,
    setLastChatStep,
    setStepHistory: setStepHistory as any,
    setCurrentStep,
    selectedResumeId,
    forcedResumeSelect: forcedResumeSelectRef.current,
    setJdText,
    getAnalysisSession: getAnalysisSession as any,
    makeJdKey,
    hasInterviewSessionMessages: hasInterviewSessionMessages as any,
    restoreInterviewSession: restoreInterviewSession as any,
    openChat,
    navigateToStep: navigateToStep as any,
    loadLastAnalysis,
    recoveredSessionKeyRef: recoveredSessionKeyRef as any,
    interviewEntryConfirmPendingRef: interviewEntryConfirmPendingRef as any,
    optimizedResumeId,
    setAllResumes,
    targetCompany,
    persistAnalysisSessionState: persistAnalysisSessionState as any,
    interviewPlanConfigKey,
    buildApiUrl,
    currentUserId: currentUser?.id,
    planFetchTrigger,
    setInterviewPlan,
    getBackendAuthToken,
    planLoaderMountedRef,
    report,
    applyAnalysisSnapshot,
    setTargetCompany,
    setAnalysisResumeId,
    setResumeData: setResumeData as any,
    sourceResumeIdRef: sourceResumeIdRef as any,
    isAnalysisStillInProgress,
    inprogressAtKey: INPROGRESS_AT_KEY,
    cancelInFlightAnalysis,
    suppressDiagnosisSessionRecoveryRef: suppressDiagnosisSessionRecoveryRef as any,
    setSelectedResumeId,
    setOptimizedResumeId,
    setForceReportEntry,
    handleResumeSelect: handleResumeSelect as any,
  });

  const {
    audioSupported,
    isRecording,
    audioError,
    setAudioError,
    inputMode,
    textareaRef,
    holdTalkBtnRef,
    holdCancel,
    visualizerData,
    transcribingByMsgId,
    toggleChatInputMode,
    onHoldPointerDown,
    onHoldPointerMove,
    onHoldPointerUp,
    onHoldPointerCancel,
    hasVoiceBlobForMsg,
    transcribeExistingVoiceMessage,
    getScoreColor,
    handleResumeSelectBack,
    handleRestartInterview,
    handleStartInterviewFromFinalReport,
    endInterviewFromChat,
    skipInterviewQuestionFromChat,
    interviewAnsweredCount,
  } = useAiAnalysisInteractionBundle({
    currentStep,
    chatMessagesRef: chatMessagesRef as any,
    setChatMessages: setChatMessages as any,
    handleSendMessage: handleSendMessage as any,
    showToast,
    getBackendAuthToken,
    navigateToView,
    openChat,
    jdText,
    targetCompany,
    resumeData,
    makeJdKey,
    currentUserId: currentUser?.id,
    setAllResumes,
    setInterviewPlan,
    setPlanFetchTrigger,
    clearInterviewSession: clearInterviewSession as any,
    clearInterviewSceneState: clearInterviewSceneState as any,
    persistAnalysisSessionState: persistAnalysisSessionState as any,
    navigateToStep: navigateToStep as any,
    setTargetCompany,
    setJdText,
    isInterviewMode,
    chatMessages,
    chatIntroScheduledRef,
  });
  const {
    postInterviewOriginalResume,
    postInterviewGeneratedResume,
    postInterviewAnnotations,
    effectivePostInterviewSummary,
    finalReportScore,
    finalReportSummary,
    finalReportAdvice,
    finalReportOverride,
    isFinalReportGenerating,
    handlePostInterviewFeedback,
    handleCompleteAndSavePostInterview,
  } = useAiAnalysisPostInterviewFlow({
    currentStep,
    originalResumeData,
    resumeData: resumeData as ResumeData,
    suggestions,
    postInterviewSummary,
    reportSummary: report?.summary,
    score,
    weaknesses: report?.weaknesses || [],
    reportGeneratedResume: (report as any)?.generatedResumeData || null,
    jdText,
    makeJdKey,
    currentUserId: currentUser?.id,
    showToast,
    sourceResumeIdRef: sourceResumeIdRef as any,
    targetCompany,
    allResumes: allResumes as any,
    isSameResumeId,
    setResumeData: setResumeData as any,
    setSelectedResumeId,
    setAnalysisResumeId,
    setOptimizedResumeId,
  });

  const {
    handleChatMessageFeedback,
    handleFinalReportFeedback,
    handleInterviewReportFeedback,
  } = useAiAnalysisFeedback({
    currentUserId: currentUser?.id,
    isInterviewMode,
    currentStep,
    resumeData,
    selectedResumeId,
    showToast,
    initialReportSummary: String(report?.summary || ''),
    finalReportSummary: String(finalReportSummary || ''),
    interviewReportSummary: String(postInterviewSummary || ''),
  });

  const handleRestartCompletedInterviewScene = useInterviewSceneReset({
    clearInterviewSceneState,
    clearInterviewSession,
    currentUserId: currentUser?.id,
    jdText,
    makeJdKey,
    resumeData,
    setChatInitialized,
    setChatMessages,
    setInterviewPlan,
    setPlanFetchTrigger,
    setPostInterviewSummary,
  });

  usePersistedInterviewSummaryHydration({
    isInterviewMode,
    currentStep,
    postInterviewSummary,
    jdText,
    resumeLastJdText: resumeData?.lastJdText,
    getAnalysisSession,
    setPostInterviewSummary,
  });

  const handleBackToJdInputFromFinalReport = React.useCallback(() => {
    if (!isInterviewMode) {
      suppressDiagnosisSessionRecoveryRef.current = true;
      navigateToStep('jd_input', true);
      return;
    }
    // Keep interview runtime on the semantic step to avoid re-introducing
    // legacy `jd_input` as a regular transition target.
    navigateToStep('interview_scene', true);
  }, [isInterviewMode, navigateToStep]);

  const handleBackFromFinalReport = React.useCallback(() => {
    if (!isInterviewMode) {
      suppressDiagnosisSessionRecoveryRef.current = true;
      navigateToStep('jd_input', true);
      return;
    }
    handleStepBack();
  }, [handleStepBack, isInterviewMode, navigateToStep]);

  const handleViewResumeFromFinalReport = React.useCallback(() => {
    if (isInterviewMode) return;

    const generatedResume =
      postInterviewGeneratedResume && typeof postInterviewGeneratedResume === 'object'
        ? { ...(postInterviewGeneratedResume as any) }
        : null;

    if (!generatedResume || !hasMeaningfulResumeData(generatedResume)) {
      showToast('暂无可预览的生成简历，请稍后重试。', 'info', 2200);
      return;
    }

    const optimizedResumeIdRaw =
      (generatedResume as any)?.optimizedResumeId ||
      optimizedResumeId ||
      (resumeData as any)?.optimizedResumeId ||
      '';
    const optimizedResumeIdValue = String(optimizedResumeIdRaw || '').trim();

    const sourceResumeIdValue = String(
      (generatedResume as any)?.optimizedFromId ||
      sourceResumeIdRef.current ||
      selectedResumeId ||
      (resumeData as any)?.id ||
      ''
    ).trim();

    const baseResume = (resumeData as any) || {};
    const generatedResumeData = (generatedResume as any) || {};
    const restoredJdText =
      String(generatedResumeData?.lastJdText || '').trim() ||
      String(jdText || '').trim() ||
      String(baseResume?.lastJdText || '').trim();
    const restoredTargetRole =
      String(generatedResumeData?.targetRole || generatedResumeData?.targetCompany || '').trim() ||
      String(targetCompany || '').trim() ||
      String(baseResume?.targetRole || baseResume?.targetCompany || '').trim();

    const nextPreviewResume: ResumeData = {
      ...(baseResume as ResumeData),
      ...(generatedResume as ResumeData),
      id: generatedResumeData?.id || baseResume?.id,
      resumeTitle:
        String(generatedResumeData?.resumeTitle || '').trim() ||
        String(baseResume?.resumeTitle || '').trim() ||
        'AI 生成简历',
      templateId:
        generatedResumeData?.templateId ||
        baseResume?.templateId ||
        'modern',
      lastJdText: restoredJdText,
      targetCompany: '',
      targetRole: restoredTargetRole,
      analysisMode: generatedResumeData?.analysisMode || baseResume?.analysisMode,
      analysisSessionByJd: generatedResumeData?.analysisSessionByJd || baseResume?.analysisSessionByJd || {},
      interviewSessions: generatedResumeData?.interviewSessions || baseResume?.interviewSessions || {},
      analysisBindings: generatedResumeData?.analysisBindings || baseResume?.analysisBindings || {},
      analysisSnapshot: generatedResumeData?.analysisSnapshot || baseResume?.analysisSnapshot || null,
      interviewFocus: String(generatedResumeData?.interviewFocus || baseResume?.interviewFocus || '').trim(),
      ...(sourceResumeIdValue ? { optimizedFromId: sourceResumeIdValue } : {}),
      ...(optimizedResumeIdValue ? { optimizedResumeId: optimizedResumeIdValue } : {}),
    };

    setResumeData(nextPreviewResume as any);
    writePreviewBackTarget('ai_analysis');
    if (optimizedResumeIdValue) {
      writePreviewResumeId(optimizedResumeIdValue);
    }
    navigateToView(View.PREVIEW);
  }, [
    isInterviewMode,
    jdText,
    navigateToView,
    optimizedResumeId,
    postInterviewGeneratedResume,
    resumeData,
    selectedResumeId,
    setResumeData,
    showToast,
    sourceResumeIdRef,
    targetCompany,
  ]);

  React.useEffect(() => {
    if (isInterviewMode) return;
    if (currentStep === 'chat' && suppressDiagnosisChatNormalizationRef.current) {
      // User explicitly navigated out from legacy diagnosis-chat report view.
      // Consume once to prevent auto-normalization from forcing back to final_report.
      suppressDiagnosisChatNormalizationRef.current = false;
      return;
    }
    if (
      currentStep === 'chat' ||
      currentStep === 'interview_report' ||
      currentStep === 'interview_report_loading'
    ) {
      navigateToStep('final_report', true);
    }
  }, [isInterviewMode, currentStep, navigateToStep]);

  React.useEffect(() => {
    if (isInterviewMode) return;
    if (!guidedFlowEnabled) return;
    if (!currentUserId) return;
    if (isGuidedFlowActive(currentUserId)) return;
    if (isProfileReadyForGuidedFlow) return;
    if (legacySoftGatePromptedRef.current) return;
    legacySoftGatePromptedRef.current = true;
    showToast('建议先补全专属职业画像，再进行诊断；你也可以直接继续进行当前分析。', 'info', 3200);
  }, [
    currentUserId,
    guidedFlowEnabled,
    isInterviewMode,
    isProfileReadyForGuidedFlow,
    showToast,
  ]);

  return renderAiAnalysisStep(buildAiAnalysisRenderProps({
    currentStep,
    allResumes,
    searchQuery,
    setSearchQuery,
    isOptimizedOpen,
    setIsOptimizedOpen,
    isUnoptimizedOpen,
    setIsUnoptimizedOpen,
    handleResumeSelectBack,
    handleResumeSelect,
    selectedResumeId,
    resumeReadState,
    isInterviewMode,
    pointsRemaining: Number((userProfile as any)?.points_balance ?? NaN),
    isSameResumeId,
    resumeData,
    targetCompany,
    setTargetCompany,
    jdText,
    setJdText,
    analysisMode,
    setAnalysisMode,
    isUploading,
    handleScreenshotUpload,
    handleStepBack,
    handleFinalReportBack: handleBackFromFinalReport,
    handleBackToJdInputFromFinalReport,
    navigateToStep: navigateToStep as any,
    setCurrentStep: setCurrentStep as any,
    handleStartAnalysisClick,
    startAnalysis,
    onRestartCompletedInterviewScene: handleRestartCompletedInterviewScene,
    interviewEntryConfirmPendingRef: interviewEntryConfirmPendingRef as any,
    score,
    originalScore,
    getScoreColor,
    onFinalReportFeedback: handleFinalReportFeedback,
    onInterviewReportFeedback: handleInterviewReportFeedback,
    ToastOverlay,
    visualizerData,
    interruptCurrentThinking,
    endInterviewFromChat,
    skipInterviewQuestionFromChat,
    handleRestartInterview,
    userAvatar,
    chatMessages,
    isSending,
    hasPendingReply,
    messagesEndRef: messagesEndRef as any,
    messagesContainerRef: messagesContainerRef as any,
    handleMessagesScroll,
    expandedReferences,
    setExpandedReferences,
    parseReferenceReply,
    audioPlayerRef: audioPlayerRef as any,
    playingAudioId,
    setPlayingAudioId,
    hasVoiceBlobForMsg,
    transcribingByMsgId,
    transcribeExistingVoiceMessage,
    keyboardOffset,
    inputBarHeight,
    inputBarRef: inputBarRef as any,
    isKeyboardOpen,
    audioError,
    setAudioError,
    inputMode,
    isRecording,
    audioSupported,
    holdCancel,
    toggleChatInputMode,
    textareaRef: textareaRef as any,
    inputMessage,
    setInputMessage,
    handleSendMessage,
    holdTalkBtnRef: holdTalkBtnRef as any,
    onHoldPointerDown,
    onHoldPointerMove,
    onHoldPointerUp,
    onHoldPointerCancel,
    interviewPlan,
    interviewAnsweredCount,
    currentQuestionElapsedSec,
    getInterviewerTitle,
    getInterviewerAvatarUrl,
    onChatMessageFeedback: handleChatMessageFeedback,
    effectivePostInterviewSummary,
    interviewReportSummary: String(postInterviewSummary || '').trim(),
    interviewReportScore: Number(score || 0),
    interviewReportAdvice: Array.isArray(report?.weaknesses) ? report.weaknesses : [],
    postInterviewOriginalResume,
    postInterviewGeneratedResume,
    postInterviewAnnotations,
    handlePostInterviewFeedback,
    handleCompleteAndSavePostInterview,
    finalReportSummary,
    finalReportAdvice,
    finalReportScore,
    finalReportOverride,
    isFinalReportGenerating,
    handleStartInterviewFromFinalReport,
    handleViewResumeFromFinalReport,
  }));
};

export default AiAnalysis;
