import React, { useState, useEffect, useRef } from 'react';
import { ScreenProps, ResumeData, View } from '../../types';
import { toSkillList } from '../../src/skill-utils';
import { buildApiUrl } from '../../src/api-config';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppContext } from '../../src/app-context';
import { useChatViewport } from './ai-analysis/hooks/useChatViewport';
import { useInterviewVoice } from './ai-analysis/hooks/useInterviewVoice';
import { useInterviewSessionStore } from './ai-analysis/hooks/useInterviewSessionStore';
import { useAiAnalysisLifecycle } from './ai-analysis/hooks/useAiAnalysisLifecycle';
import { useResumeSelection } from './ai-analysis/hooks/useResumeSelection';
import { useAiAnalysisNavigation } from './ai-analysis/hooks/useAiAnalysisNavigation';
import { useToastOverlay } from './ai-analysis/hooks/useToastOverlay';
import { useInterviewChat } from './ai-analysis/hooks/useInterviewChat';
import { useSuggestionAcceptance } from './ai-analysis/hooks/useSuggestionAcceptance';
import { useAnalysisPersistence } from './ai-analysis/hooks/useAnalysisPersistence';
import { useOptimizedResumeStore } from './ai-analysis/hooks/useOptimizedResumeStore';
import { useJdScreenshotUpload } from './ai-analysis/hooks/useJdScreenshotUpload';
import { useChatIntroMessages } from './ai-analysis/hooks/useChatIntroMessages';
import { useAnalysisHungGuard } from './ai-analysis/hooks/useAnalysisHungGuard';
import { useAiExternalEntries } from './ai-analysis/hooks/useAiExternalEntries';
import { deriveInitialStepFromPath, useAiRouteSync } from './ai-analysis/hooks/useAiRouteSync';
import { useAnalysisRuntime } from './ai-analysis/hooks/useAnalysisRuntime';
import { useAnalysisSnapshotApplier } from './ai-analysis/hooks/useAnalysisSnapshotApplier';
import { useReportSnapshotRestore } from './ai-analysis/hooks/useReportSnapshotRestore';
import { useAnalyzeOtherResumeReset } from './ai-analysis/hooks/useAnalyzeOtherResumeReset';
import { useAnalysisExecution } from './ai-analysis/hooks/useAnalysisExecution';
import { useUsageQuota } from './ai-analysis/hooks/useUsageQuota';
import { useSuggestionIgnore } from './ai-analysis/hooks/useSuggestionIgnore';
import { useAnalysisSessionRecovery } from './ai-analysis/hooks/useAnalysisSessionRecovery';
import {
  formatInterviewQuestion,
  isSelfIntroQuestion,
  sanitizeSuggestedValue
} from './ai-analysis/chat-formatters';
import { getBackendAuthToken } from './ai-analysis/auth';
import {
  getDisplayOriginalValue,
  getSuggestionModuleLabel,
  inferTargetSection,
  normalizeTargetSection
} from './ai-analysis/suggestion-helpers';
import { getRagEnabledFlag } from './ai-analysis/analysis-config';
import WaveformVisualizer from './ai-analysis/WaveformVisualizer';
import { isSameResumeId, normalizeResumeId } from './ai-analysis/id-utils';
import { useAppStore } from '../../src/app-store';
import { useUserProfile } from '../../src/useUserProfile';
import {
  parseReferenceReply,
  splitNextQuestion,
  stripMarkdownTableSeparators,
  isAffirmative
} from './ai-analysis/chat-text';
import {
  composeInterviewPlan,
  getActiveInterviewType,
  getFallbackPlanByType,
  getInterviewerAvatarUrl,
  getInterviewerTitle,
  getPlanStorageKey,
  getWarmupQuestion,
  sanitizePlanQuestions,
} from './ai-analysis/interview-plan-utils';
import { renderAiAnalysisStep } from './ai-analysis/step-renderer';
import type { AnalysisReport, ChatMessage, Suggestion } from './ai-analysis/types';

type Step = 'resume_select' | 'jd_input' | 'analyzing' | 'report' | 'micro_intro' | 'chat' | 'comparison';

const AiAnalysis: React.FC<ScreenProps> = ({ isInterviewMode }) => {
  const navigateToView = useAppContext((s) => s.navigateToView);
  const currentUser = useAppContext((s) => s.currentUser);
  const { userProfile } = useUserProfile(currentUser?.id, currentUser);
  const loadUserResumes = useAppContext((s) => s.loadUserResumes);
  const goBack = useAppContext((s) => s.goBack);
  const resumeData = useAppStore((state) => state.resumeData);
  const setResumeData = useAppStore((state) => state.setResumeData);
  const allResumes = useAppStore((state) => state.allResumes);
  const setIsNavHidden = useAppStore((state) => state.setIsNavHidden);
  const navigate = useNavigate();
  const location = useLocation();

  // Skill normalization moved to `src/skill-utils.ts` so resume import and suggestion generation stay consistent.

  const getDisplayOriginalValueOf = (suggestion: Suggestion) => getDisplayOriginalValue(suggestion, resumeData);
  const getSuggestionModuleLabelOf = (suggestion: Suggestion) => getSuggestionModuleLabel(suggestion, resumeData);
  // Navigation State
  const [currentStep, setCurrentStep] = useState<Step>(() => deriveInitialStepFromPath());
  const [selectedResumeId, setSelectedResumeId] = useState<string | number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const sourceResumeIdRef = useRef<string | number | null>(null);
  const forcedResumeSelectRef = useRef(false);

  useEffect(() => {
    if (setIsNavHidden) {
      setIsNavHidden(currentStep === 'chat');
    }
    return () => {
      if (setIsNavHidden) setIsNavHidden(false);
    };
  }, [currentStep, setIsNavHidden]);
  const [originalResumeData, setOriginalResumeData] = useState<ResumeData | null>(null);
  const [jdText, setJdText] = useState('');
  const [targetCompany, setTargetCompany] = useState('');
  const prevStepRef = useRef<Step | null>(null);

  // UX: when re-entering the JD input step, do not carry over target company from previous sessions.
  useEffect(() => {
    if (currentStep === 'jd_input' && prevStepRef.current !== 'jd_input') {
      setTargetCompany('');
    }
    prevStepRef.current = currentStep;
  }, [currentStep]);

  // Analysis Result State
  const [originalScore, setOriginalScore] = useState(0);
  const [score, setScore] = useState(0);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const isExporting = false;

  // Upload State
  const [showJdEmptyModal, setShowJdEmptyModal] = useState(false);

  // Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const chatMessagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => {
    chatMessagesRef.current = chatMessages;
  }, [chatMessages]);
  const [inputMessage, setInputMessage] = useState('');
  const [interviewPlan, setInterviewPlan] = useState<string[]>([]);
  const [planFetchTrigger, setPlanFetchTrigger] = useState(0);
  const planLoaderMountedRef = useRef(true);

  const [isInterviewEntry, setIsInterviewEntry] = useState(false);
  const [forceReportEntry, setForceReportEntry] = useState(false);
  const [expandedReferences, setExpandedReferences] = useState<Record<string, boolean>>({});
  const [chatInitialized, setChatInitialized] = useState(false);
  const recoveredSessionKeyRef = useRef<string>('');
  const chatIntroScheduledRef = useRef(false);
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
  } = useInterviewSessionStore({
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
    goBack: goBack as any,
  });
  const { showToast, ToastOverlay } = useToastOverlay();
  const { isUploading, handleScreenshotUpload } = useJdScreenshotUpload({
    getBackendAuthToken,
    buildApiUrl,
    setJdText,
  });
  const { isSending, blobToBase64, handleSendMessage } = useInterviewChat({
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
    diagnosisDossier: (userProfile as any)?.analysis_dossier_latest || null,
    score,
    suggestions,
    plannedQuestionCount: interviewPlan.length,
    isAffirmative,
    splitNextQuestion,
    stripMarkdownTableSeparators,
    formatInterviewQuestion,
    isSelfIntroQuestion,
  });

  useEffect(() => {
    planLoaderMountedRef.current = true;
    return () => {
      planLoaderMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // Ensure warmup is present if plan is empty (e.g. initial load or restart)
    if (currentStep === 'chat' && interviewPlan.length === 0) {
      const interviewType = getActiveInterviewType();
      const warmup = getWarmupQuestion(interviewType);
      setInterviewPlan([warmup]);
    }
  }, [currentStep, interviewPlan.length]);

  const {
    messagesEndRef,
    messagesContainerRef,
    inputBarRef,
    keyboardOffset,
    isKeyboardOpen,
    inputBarHeight,
    onMessagesScroll: handleMessagesScroll
  } = useChatViewport({ currentStep, chatMessages, isSending });
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const DEFAULT_AVATAR = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='12' fill='%23f1f5f9'/%3E%3Cg transform='translate(4.8, 4.8) scale(0.6)' fill='%2394a3b8'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'%3E%3C/path%3E%3C/g%3E%3C/svg%3E`;
  const [userAvatar, setUserAvatar] = useState(DEFAULT_AVATAR);

  useEffect(() => {
    const saved = localStorage.getItem('user_avatar');
    if (saved) setUserAvatar(saved);
  }, []);

  // Intentionally keep input usable while AI is replying.

  // Cache State
  const [isFromCache, setIsFromCache] = useState(false);

  // Optimized Resume Tracking
  const [optimizedResumeId, setOptimizedResumeId] = useState<string | number | null>(null);
  const [isOptimizedOpen, setIsOptimizedOpen] = useState(true);
  const [isUnoptimizedOpen, setIsUnoptimizedOpen] = useState(true);
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

  useEffect(() => {
    const path = (location.pathname || '').toLowerCase();
    if (path !== '/ai-analysis' && path !== '/ai-interview') return;
    if (localStorage.getItem('ai_analysis_force_resume_select') !== '1') return;

    localStorage.removeItem('ai_analysis_force_resume_select');
    forcedResumeSelectRef.current = true;
    setStepHistory([]);
    setSelectedResumeId(null);
    sourceResumeIdRef.current = null;
    setOptimizedResumeId(null);
    setAnalysisResumeId(null);
    setCurrentStep('resume_select');
  }, [location.pathname, setAnalysisResumeId, setStepHistory]);

  useEffect(() => {
    if (currentStep !== 'resume_select') {
      forcedResumeSelectRef.current = false;
    }
  }, [currentStep]);

  const { applyAnalysisSnapshot } = useAnalysisSnapshotApplier({
    resumeFeedback: resumeData?.aiSuggestionFeedback,
    setOriginalScore,
    setScore,
    setSuggestions: setSuggestions as any,
    setReport: setReport as any,
    setIsFromCache,
  });

  const {
    optimizedResumeIdRef,
    resolveOriginalResumeIdForOptimization,
    ensureSingleOptimizedResume,
    resolveAnalysisBinding,
    ensureAnalysisBinding,
    resetOptimizedCreationState,
  } = useOptimizedResumeStore({
    optimizedResumeId,
    setOptimizedResumeId,
    sourceResumeIdRef: sourceResumeIdRef as any,
    selectedResumeId,
    resumeData,
    allResumes,
    jdText,
    targetCompany,
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
    setOptimizedResumeId,
    applyAnalysisSnapshot,
    saveLastAnalysis,
    showToast,
    isSameResumeId,
    isInterviewMode,
  });

  const { persistAnalysisSnapshot, persistSuggestionFeedback, persistSuggestionsState } = useAnalysisPersistence({
    resumeData,
    setResumeData: setResumeData as any,
    jdText,
    targetCompany,
    setSuggestions: setSuggestions as any,
  });
  const { consumeUsageQuota } = useUsageQuota({
    currentUserId: currentUser?.id,
    navigateToView,
    showToast,
  });

  // --- Handlers ---
  const { cancelInFlightAnalysis, startAnalysis, handleStartAnalysisClick } = useAnalysisExecution({
    resumeData,
    setResumeData: setResumeData as any,
    jdText,
    targetCompany,
    setTargetCompany,
    optimizedResumeId,
    setOptimizedResumeId,
    optimizedResumeIdRef: optimizedResumeIdRef as any,
    resolveOriginalResumeIdForOptimization,
    ensureAnalysisBinding: ensureAnalysisBinding as any,
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
    setShowJdEmptyModal,
    isInterviewMode,
    openChat,
    consumeUsageQuota,
  });

  const updateScore = (points: number) => {
    setScore(prev => Math.min(prev + points, 100));
  };
  const { handleAcceptSuggestionInChat, acceptingSuggestionIds } = useSuggestionAcceptance({
    resumeData,
    setResumeData: setResumeData as any,
    suggestions: suggestions as any,
    setSuggestions: setSuggestions as any,
    setChatMessages: setChatMessages as any,
    allResumes,
    isSameResumeId,
    resolveOriginalResumeIdForOptimization,
    ensureSingleOptimizedResume: ensureSingleOptimizedResume as any,
    resolveAnalysisBinding: resolveAnalysisBinding as any,
    ensureAnalysisBinding: ensureAnalysisBinding as any,
    normalizeTargetSection,
    inferTargetSection,
    sanitizeSuggestedValue,
    toSkillList,
    jdText,
    targetCompany,
    report,
    score,
    saveLastAnalysis,
    setAnalysisResumeId,
    optimizedResumeIdRef,
    setOptimizedResumeId,
    loadUserResumes,
    showToast: showToast as any,
    updateScore,
  });
  const { handleIgnoreSuggestion } = useSuggestionIgnore({
    suggestions: suggestions as any[],
    setSuggestions: setSuggestions as any,
    setChatMessages: setChatMessages as any,
    persistSuggestionsState: persistSuggestionsState as any,
    resumeData,
    report,
    score,
    jdText,
    targetCompany,
    saveLastAnalysis,
    showToast,
  });

  const handleExportPDF = () => {
    navigateToView(View.PREVIEW);
  };

  const { handleAnalyzeOtherResume } = useAnalyzeOtherResumeReset({
    setSelectedResumeId,
    sourceResumeIdRef: sourceResumeIdRef as any,
    setAnalysisResumeId,
    resetOptimizedCreationState,
    clearLastAnalysis,
    setJdText,
    setSuggestions: setSuggestions as any,
    setReport: setReport as any,
    setScore,
    setOriginalScore,
    setChatMessages: setChatMessages as any,
    setIsFromCache,
    setOptimizedResumeId,
    setAnalysisInProgress,
    setCurrentStep,
  });

  const hasJdInput = () => jdText.length > 0;

  useChatIntroMessages({
    currentStep,
    chatInitialized,
    chatMessagesRef: chatMessagesRef as any,
    chatIntroScheduledRef: chatIntroScheduledRef as any,
    setChatInitialized,
    setChatMessages: setChatMessages as any,
    resumeData,
    jdText,
  });

  useAiAnalysisLifecycle({
    currentStep,
    chatEntrySource,
    score,
    suggestionsLength: suggestions.length,
    setChatEntrySource,
    setLastChatStep,
    setStepHistory,
    setCurrentStep,
    selectedResumeId,
    resumeData,
    isInterviewMode,
  });
  useAnalysisSessionRecovery({
    resumeData,
    forcedResumeSelect: forcedResumeSelectRef.current,
    currentStep,
    jdText,
    setJdText,
    getAnalysisSession: getAnalysisSession as any,
    makeJdKey,
    hasInterviewSessionMessages: hasInterviewSessionMessages as any,
    restoreInterviewSession: restoreInterviewSession as any,
    openChat,
    navigateToStep: navigateToStep as any,
    loadLastAnalysis,
    recoveredSessionKeyRef: recoveredSessionKeyRef as any,
  });

  useEffect(() => {
    if (!isInterviewMode) return;
    if (!resumeData) return;
    const effectiveJdText = (jdText || resumeData.lastJdText || '').trim();
    if (!effectiveJdText) return;
    const interviewType = getActiveInterviewType();
    const storageKey = getPlanStorageKey(resumeData?.id, makeJdKey, effectiveJdText);

    try {
      const cached = localStorage.getItem(storageKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        const q = composeInterviewPlan(
          interviewType,
          sanitizePlanQuestions(Array.isArray(parsed?.questions) ? parsed.questions : [], interviewType)
        );
        if (q.length > 0) {
          setInterviewPlan(q);
          return;
        }
      }
    } catch {
      // ignore cache parse errors
    }

    const run = async () => {
      try {
        setInterviewPlan(prev => {
          if (prev.length > 0) return prev;
          return [getWarmupQuestion(interviewType)];
        });

        const token = await getBackendAuthToken();
        if (!token) {
          const fallback = sanitizePlanQuestions(getFallbackPlanByType(interviewType), interviewType);
          if (planLoaderMountedRef.current) setInterviewPlan(fallback);
          return;
        }
        const resp = await fetch(buildApiUrl('/api/ai/chat'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token.trim()}`,
          },
          body: JSON.stringify({
            mode: 'interview_plan',
            message: '请生成本场面试题单',
            resumeData,
            jobDescription: effectiveJdText,
            chatHistory: [],
            interviewType,
          }),
        });
        const data = await resp.json().catch(() => ({} as any));
        const questions = sanitizePlanQuestions(Array.isArray(data?.questions) ? data.questions : [], interviewType);
        const finalPlan = composeInterviewPlan(
          interviewType,
          questions.length > 0 ? questions : sanitizePlanQuestions(getFallbackPlanByType(interviewType), interviewType)
        );
        if (planLoaderMountedRef.current) {
          setInterviewPlan(finalPlan);
          try { localStorage.setItem(storageKey, JSON.stringify({ questions: finalPlan, interviewType, jdText: effectiveJdText })); } catch { }
        }
      } catch {
        if (planLoaderMountedRef.current) {
          const fallback = composeInterviewPlan(
            interviewType,
            sanitizePlanQuestions(getFallbackPlanByType(interviewType), interviewType)
          );
          setInterviewPlan(fallback);
          try { localStorage.setItem(storageKey, JSON.stringify({ questions: fallback, interviewType, jdText: effectiveJdText })); } catch { }
        }
      }
    };
    run();
  }, [buildApiUrl, isInterviewMode, jdText, makeJdKey, resumeData, planFetchTrigger]);

  useReportSnapshotRestore({
    currentStep,
    score,
    suggestionsLength: suggestions.length,
    report,
    resumeData,
    loadLastAnalysis,
    applyAnalysisSnapshot,
    setJdText,
    setTargetCompany,
    setAnalysisResumeId,
    setResumeData: setResumeData as any,
    sourceResumeIdRef: sourceResumeIdRef as any,
  });

  useAnalysisHungGuard({
    currentStep,
    setCurrentStep: setCurrentStep as any,
    isAnalysisStillInProgress,
    inprogressAtKey: INPROGRESS_AT_KEY,
    cancelInFlightAnalysis,
  });

  useAiExternalEntries({
    setResumeData: setResumeData as any,
    sourceResumeIdRef: sourceResumeIdRef as any,
    setSelectedResumeId,
    setAnalysisResumeId,
    setOptimizedResumeId,
    setTargetCompany,
    setJdText,
    makeJdKey,
    setChatMessages: setChatMessages as any,
    setChatInitialized,
    openChat,
    setStepHistory: setStepHistory as any,
    setCurrentStep: setCurrentStep as any,
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
  } = useInterviewVoice({
    currentStep,
    chatMessagesRef: chatMessagesRef as any,
    setChatMessages: setChatMessages as any,
    handleSendMessage: handleSendMessage as any,
    showToast,
    getBackendAuthToken,
  });

  const getScoreColor = (s: number) => {
    if (s >= 90) return 'text-green-500';
    if (s >= 70) return 'text-primary';
    return 'text-orange-500';
  };
  const handleResumeSelectBack = () => {
    navigateToView(View.DASHBOARD, { root: true, replace: true });
  };
  const handleStartMicroInterview = () => {
    openChat('internal');
  };

  const endInterviewFromChat = () => { void handleSendMessage('结束面试', null); };
  const interviewAnsweredCount = chatMessages.filter((m) => {
    if (m.role !== 'user') return false;
    const txt = String(m.text || '').trim();
    const hasTextAnswer = !!txt && txt !== '结束面试';
    const hasVoiceAnswer = !!m.audioUrl || !!m.audioPending;
    return hasTextAnswer || hasVoiceAnswer;
  }).length;
  const handleRestartInterview = async () => {
    chatIntroScheduledRef.current = false;
    await clearInterviewSession();
    const effectiveJdText = (jdText || resumeData?.lastJdText || '').trim();
    if (effectiveJdText) {
      try { localStorage.removeItem(getPlanStorageKey(resumeData?.id, makeJdKey, effectiveJdText)); } catch { }
    }
    setInterviewPlan([]);
    setPlanFetchTrigger(v => v + 1);
  };

  return renderAiAnalysisStep({
    currentStep,
    allResumes: allResumes as any[],
    searchQuery,
    setSearchQuery,
    isOptimizedOpen,
    setIsOptimizedOpen,
    isUnoptimizedOpen,
    setIsUnoptimizedOpen,
    handleResumeSelectBack,
    handleResumeSelect: (resumeId, preferReport) => { void handleResumeSelect(resumeId, preferReport); },
    selectedResumeId,
    resumeReadState,
    isInterviewMode,
    isSameResumeId,
    resumeData,
    targetCompany,
    setTargetCompany,
    jdText,
    setJdText,
    isUploading,
    handleScreenshotUpload,
    handleStepBack,
    setCurrentStep: setCurrentStep as any,
    handleStartAnalysisClick,
    showJdEmptyModal,
    setShowJdEmptyModal,
    startAnalysis,
    hasJdInput,
    score,
    originalScore,
    report,
    suggestions: suggestions as any[],
    setSuggestions: setSuggestions as any,
    getScoreColor,
    getSuggestionModuleLabelOf,
    getDisplayOriginalValueOf,
    persistSuggestionFeedback: persistSuggestionFeedback as any,
    handleIgnoreSuggestion: handleIgnoreSuggestion as any,
    handleAcceptSuggestionInChat: handleAcceptSuggestionInChat as any,
    acceptingSuggestionIds,
    handleAnalyzeOtherResume,
    handleExportPDF,
    handleStartMicroInterview,
    ToastOverlay,
    WaveformVisualizer: (props: any) => <WaveformVisualizer {...props} visualizerData={visualizerData} />,
    endInterviewFromChat,
    handleRestartInterview,
    userAvatar,
    chatMessages,
    isSending,
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
    handleSendMessage: () => { void handleSendMessage(); },
    holdTalkBtnRef: holdTalkBtnRef as any,
    onHoldPointerDown,
    onHoldPointerMove,
    onHoldPointerUp,
    onHoldPointerCancel,
    interviewPlan,
    interviewAnsweredCount,
    getInterviewerTitle,
    getInterviewerAvatarUrl,
  });
};

export default AiAnalysis;
