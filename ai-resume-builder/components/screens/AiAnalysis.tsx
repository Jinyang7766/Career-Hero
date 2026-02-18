import React, { useState, useEffect, useRef } from 'react';
import { ScreenProps, ResumeData, View } from '../../types';
import { toSkillList } from '../../src/skill-utils';
import { buildApiUrl } from '../../src/api-config';
import { confirmDialog } from '../../src/ui/dialogs';
import { useLocation, useNavigate } from 'react-router-dom';
import ChatPage from './ai-analysis/ChatPage';
import { useAppContext } from '../../src/app-context';
import ResumeSelectPage from './ai-analysis/pages/ResumeSelectPage';
import JdInputPage from './ai-analysis/pages/JdInputPage';
import ReportPage from './ai-analysis/pages/ReportPage';
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

  const getActiveInterviewType = () => {
    const t = String(localStorage.getItem('ai_interview_type') || '').trim().toLowerCase();
    if (t === 'technical' || t === 'hr' || t === 'general') return t;
    return 'general';
  };

  const getPlanStorageKey = (effectiveJdText: string) => {
    const interviewType = getActiveInterviewType();
    return `ai_interview_plan_${String(resumeData?.id || 'unknown')}_${makeJdKey(effectiveJdText)}_${interviewType}`;
  };
  const getInterviewerTitle = () => {
    const type = getActiveInterviewType();
    if (type === 'technical') return 'AI 复试深挖面试官';
    if (type === 'hr') return 'AI HR 面试官';
    return 'AI 初试面试官';
  };
  const getInterviewerAvatarUrl = () => {
    const type = getActiveInterviewType();
    if (type === 'technical') return '/ai-avatar-technical-opt.png';
    if (type === 'hr') return '/ai-avatar-hr-opt.png';
    return '/ai-avatar.png';
  };

  useEffect(() => {
    planLoaderMountedRef.current = true;
    return () => {
      planLoaderMountedRef.current = false;
    };
  }, []);

  const getWarmupQuestion = (interviewType: string) => {
    if (interviewType === 'technical') return '你最引以为傲的职业成就是什么？或者一个你最近解决过的棘手问题是什么？';
    if (interviewType === 'hr') return '请用三个关键词定义你的个人工作风格，并分别说明一个真实体现该关键词的例子。';
    return '请先做一个1分钟的自我介绍，重点突出与你目标岗位最相关的经历与优势。';
  };

  useEffect(() => {
    // Ensure warmup is present if plan is empty (e.g. initial load or restart)
    if (currentStep === 'chat' && interviewPlan.length === 0) {
      const interviewType = getActiveInterviewType();
      const warmup = getWarmupQuestion(interviewType);
      setInterviewPlan([warmup]);
    }
  }, [currentStep, interviewPlan.length]);

  const getFallbackPlanByType = (interviewType: string): string[] => {
    if (interviewType === 'technical') {
      return [
        '请介绍一个你最有代表性的项目，并说明你负责的技术模块。',
        '该项目的核心技术方案是如何设计的？为什么这样选型？',
        '上线后遇到过哪些性能或稳定性问题？你如何定位与优化？',
        '请描述一次你处理复杂故障或线上事故的过程。',
        '如果业务量翻倍，你会如何改造当前架构？',
        '你如何保障代码质量与可维护性？',
        '回到这个项目，你认为最大的技术遗憾和改进方向是什么？',
      ];
    }
    if (interviewType === 'hr') {
      return [
        '请分享一次你与同事意见冲突并最终达成一致的案例。',
        '你如何在高压和紧急任务下保持交付质量？',
        '请讲一个你主动推动改进并产生结果的经历。',
        '你过去离职/转岗的主要考虑是什么？',
        '你为什么想加入这个岗位/公司？',
        '如果入职，你前3个月的工作目标是什么？',
      ];
    }
    return [
      '请介绍一个最有代表性的项目，并说明你的职责与结果。',
      '这个项目中最困难的问题是什么？你如何解决？',
      '请举例说明一次跨团队协作并推动结果落地的经历。',
      '你最匹配这个岗位的能力是什么？请给出证据。',
      '如果你入职该岗位，前3个月会如何规划与交付？',
      '请补充一个能体现你岗位匹配度的关键成果。'
    ];
  };
  const getWarmupQuestionByType = (interviewType: string): string => {
    if (interviewType === 'technical') {
      return '你最引以为傲的职业成就是什么？或者一个你最近解决过的棘手问题是什么？';
    }
    if (interviewType === 'hr') {
      return '请用三个关键词定义你的个人工作风格，并分别说明一个真实体现该关键词的例子。';
    }
    return '请先做一个1分钟的自我介绍，重点突出与你目标岗位最相关的经历与优势。';
  };
  const normalizeQuestionText = (value: any): string =>
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[\s\.,;:!?，。！？；：、（）()\[\]{}<>《》“”"'`~\-—_]+/g, '');
  const isSameOrSimilarQuestion = (a: any, b: any): boolean => {
    const na = normalizeQuestionText(a);
    const nb = normalizeQuestionText(b);
    if (!na || !nb) return false;
    return na === nb || na.includes(nb) || nb.includes(na);
  };
  const composeInterviewPlan = (interviewType: string, baseQuestions: string[]): string[] => {
    const warmup = String(getWarmupQuestionByType(interviewType) || '').trim();
    const dedupedBase = (baseQuestions || []).map((q) => String(q || '').trim()).filter(Boolean);
    if (!warmup) return dedupedBase;
    const rest = dedupedBase.filter((q) => !isSameOrSimilarQuestion(q, warmup));
    return [warmup, ...rest];
  };
  const sanitizePlanQuestions = (items: any[], interviewType: string): string[] => {
    const selfIntroRe = /(自我介绍|介绍一下你自己|简单介绍一下自己)/;
    const minCount = 4;
    const maxCount = 12;
    const unique: string[] = [];
    for (const it of (items || [])) {
      const q = String(it || '').trim();
      if (!q) continue;
      if (selfIntroRe.test(q)) continue;
      if (unique.includes(q)) continue;
      unique.push(q);
      if (unique.length >= maxCount) break;
    }
    if (unique.length < minCount) {
      for (const fallback of getFallbackPlanByType(interviewType)) {
        if (!fallback || selfIntroRe.test(fallback) || unique.includes(fallback)) continue;
        unique.push(fallback);
        if (unique.length >= minCount) break;
      }
    }
    return unique.slice(0, maxCount);
  };
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

  const handleIgnoreSuggestion = async (suggestion: any) => {
    const suggestionId = String(suggestion?.id || '').trim();
    if (!suggestionId) return;
    const confirmed = await confirmDialog('确认忽略这条优化建议吗？忽略后将不再显示。');
    if (!confirmed) return;

    const nextSuggestions = (suggestions || []).filter((s: any) => String(s?.id || '') !== suggestionId);
    setSuggestions(nextSuggestions as any);
    setChatMessages(prev => prev.map(msg =>
      msg.suggestion?.id === suggestionId
        ? { ...msg, suggestion: { ...msg.suggestion!, status: 'ignored' as const } }
        : msg
    ));
    await persistSuggestionsState(nextSuggestions as any);

    if (resumeData?.id && report) {
      const updatedAt = new Date().toISOString();
      const snapshotForPersist = {
        score,
        summary: report.summary || '',
        strengths: report.strengths || [],
        weaknesses: report.weaknesses || [],
        missingKeywords: report.missingKeywords || [],
        scoreBreakdown: report.scoreBreakdown || { experience: 0, skills: 0, format: 0 },
        suggestions: nextSuggestions,
        updatedAt,
        jdText: jdText || resumeData.lastJdText || '',
        targetCompany: targetCompany || resumeData.targetCompany || '',
      };
      saveLastAnalysis({
        resumeId: resumeData.id,
        jdText: snapshotForPersist.jdText,
        targetCompany: snapshotForPersist.targetCompany,
        snapshot: snapshotForPersist,
        updatedAt,
      });
    }

    showToast('已忽略该建议', 'info');
  };

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

  useEffect(() => {
    if (!resumeData) return;
    if (forcedResumeSelectRef.current && currentStep === 'resume_select') return;
    const effectiveJdText = (jdText || resumeData.lastJdText || '').trim();
    if (!effectiveJdText) return;
    const activeInterviewType = String(localStorage.getItem('ai_interview_type') || 'general').toLowerCase();

    const jdKey = makeJdKey(effectiveJdText);
    const marker = `${String(resumeData.id || '')}:${jdKey}:${activeInterviewType}:${currentStep}`;
    if (recoveredSessionKeyRef.current === marker) return;

    const session = getAnalysisSession(effectiveJdText) as any;
    if (!session) return;

    const status = String(session.state || '');
    const hasInterviewMessages = hasInterviewSessionMessages(effectiveJdText, activeInterviewType);

    // Refresh/re-entry recovery: interrupted interview should resume in chat with existing history.
    if (
      hasInterviewMessages &&
      (status === 'interview_in_progress' || status === 'paused') &&
      currentStep !== 'chat'
    ) {
      if (!jdText) setJdText(effectiveJdText);
      restoreInterviewSession(effectiveJdText, activeInterviewType);
      openChat('internal');
      recoveredSessionKeyRef.current = marker;
      return;
    }

    // If interview state is prepared but no chat history yet, route to micro-intro instead of JD input.
    if (
      !hasInterviewMessages &&
      status === 'interview_in_progress' &&
      (currentStep === 'jd_input' || currentStep === 'resume_select' || currentStep === 'report')
    ) {
      navigateToStep('micro_intro', true);
      recoveredSessionKeyRef.current = marker;
      return;
    }

    // If analysis finished previously and user lands on JD input accidentally, take them back to report.
    if (
      status === 'report_ready' &&
      (currentStep === 'jd_input' || currentStep === 'resume_select') &&
      (resumeData.analysisSnapshot || loadLastAnalysis())
    ) {
      navigateToStep('report', true);
      recoveredSessionKeyRef.current = marker;
      return;
    }
  }, [
    currentStep,
    getAnalysisSession,
    jdText,
    loadLastAnalysis,
    makeJdKey,
    navigateToStep,
    openChat,
    resumeData,
    hasInterviewSessionMessages,
    restoreInterviewSession,
    setJdText,
  ]);

  useEffect(() => {
    if (!isInterviewMode) return;
    if (!resumeData) return;
    const effectiveJdText = (jdText || resumeData.lastJdText || '').trim();
    if (!effectiveJdText) return;
    const interviewType = getActiveInterviewType();
    const storageKey = getPlanStorageKey(effectiveJdText);

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

  // ================= RENDER STEPS =================
  if (currentStep === 'resume_select') {
    return (
      <ResumeSelectPage
        allResumes={allResumes}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        isOptimizedOpen={isOptimizedOpen}
        setIsOptimizedOpen={setIsOptimizedOpen}
        isUnoptimizedOpen={isUnoptimizedOpen}
        setIsUnoptimizedOpen={setIsUnoptimizedOpen}
        onBack={handleResumeSelectBack}
        onSelectResume={(resumeId, preferReport) => handleResumeSelect(resumeId, !!preferReport)}
        selectedResumeId={selectedResumeId}
        isReading={resumeReadState.status === 'loading'}
        isInterviewMode={isInterviewMode}
      />
    );
  }
  // 2. JD Input
  if (currentStep === 'jd_input') {
    return (
      <JdInputPage
        allResumes={allResumes}
        selectedResumeId={selectedResumeId}
        isSameResumeId={isSameResumeId}
        resumeData={resumeData}
        resumeReadState={resumeReadState}
        targetCompany={targetCompany}
        setTargetCompany={setTargetCompany}
        jdText={jdText}
        setJdText={setJdText}
        isUploading={isUploading}
        onScreenshotUpload={handleScreenshotUpload}
        onBack={handleStepBack}
        onPrev={() => setCurrentStep('resume_select')}
        onStart={handleStartAnalysisClick}
        showJdEmptyModal={showJdEmptyModal}
        setShowJdEmptyModal={setShowJdEmptyModal}
        startAnalysis={startAnalysis}
        isInterviewMode={isInterviewMode}
      />
    );
  }
  // 3. Analyzing
  if (currentStep === 'analyzing') {
    return (
      <ReportPage
        mode="analyzing"
        hasJdInput={hasJdInput}
        handleStepBack={handleStepBack}
        score={score}
        originalScore={originalScore}
        report={report}
        suggestions={suggestions as any[]}
        setSuggestions={setSuggestions as any}
        getScoreColor={getScoreColor}
        getSuggestionModuleLabel={getSuggestionModuleLabelOf}
        getDisplayOriginalValue={getDisplayOriginalValueOf}
        persistSuggestionFeedback={persistSuggestionFeedback as any}
        handleIgnoreSuggestion={handleIgnoreSuggestion as any}
        handleAcceptSuggestionInChat={handleAcceptSuggestionInChat as any}
        acceptingSuggestionIds={acceptingSuggestionIds}
        handleAnalyzeOtherResume={handleAnalyzeOtherResume}
        handleExportPDF={handleExportPDF}
        handleStartMicroInterview={handleStartMicroInterview}
      />
    );
  }
  // 4. Report View (Simplified, focus on Chat Entry)
  if (currentStep === 'report') {
    return (
      <ReportPage
        mode="report"
        hasJdInput={hasJdInput}
        handleStepBack={handleStepBack}
        score={score}
        originalScore={originalScore}
        report={report}
        suggestions={suggestions as any[]}
        setSuggestions={setSuggestions as any}
        getScoreColor={getScoreColor}
        getSuggestionModuleLabel={getSuggestionModuleLabelOf}
        getDisplayOriginalValue={getDisplayOriginalValueOf}
        persistSuggestionFeedback={persistSuggestionFeedback as any}
        handleIgnoreSuggestion={handleIgnoreSuggestion as any}
        handleAcceptSuggestionInChat={handleAcceptSuggestionInChat as any}
        acceptingSuggestionIds={acceptingSuggestionIds}
        handleAnalyzeOtherResume={handleAnalyzeOtherResume}
        handleExportPDF={handleExportPDF}
        handleStartMicroInterview={handleStartMicroInterview}
      />
    );
  }
  if (currentStep === 'micro_intro') {
    return (
      <div className="flex flex-col min-h-screen bg-background-light dark:bg-background-dark animate-in fade-in duration-300">
        <header className="sticky top-0 z-40 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md border-b border-slate-200 dark:border-white/5">
          <div className="flex items-center justify-between h-14 px-4 relative">
            <button onClick={handleStepBack} className="p-2 -ml-2 rounded-full hover:bg-slate-200 dark:hover:bg-white/10 text-slate-900 dark:text-white" type="button">
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <h1 className="text-base font-bold tracking-tight">进入微访谈前</h1>
            <div className="w-8"></div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 pb-[calc(5.75rem+env(safe-area-inset-bottom))]">
          <div className="bg-white dark:bg-surface-dark rounded-2xl p-6 shadow-md border border-slate-200 dark:border-white/5 mb-4">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3">初始评分</p>
            <div className={`text-6xl font-black tracking-tight ${getScoreColor(originalScore || score)}`}>
              {Math.round(originalScore || score)}
              <span className="text-2xl text-slate-400 font-normal ml-1">/100</span>
            </div>
            {report?.scoreBreakdown && (
              <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                <div className="rounded-lg bg-slate-50 dark:bg-white/5 p-2">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">经验</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{report.scoreBreakdown.experience}</p>
                </div>
                <div className="rounded-lg bg-slate-50 dark:bg-white/5 p-2">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">技能</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{report.scoreBreakdown.skills}</p>
                </div>
                <div className="rounded-lg bg-slate-50 dark:bg-white/5 p-2">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">格式</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{report.scoreBreakdown.format}</p>
                </div>
              </div>
            )}
          </div>

          <div className="bg-blue-50/50 dark:bg-blue-900/10 rounded-2xl p-5 border border-blue-100 dark:border-blue-900/20 mb-6">
            <h3 className="flex items-center gap-2 font-bold text-blue-800 dark:text-blue-400 text-base mb-2">
              <span className="material-symbols-outlined text-[20px]">summarize</span>
              诊断总结
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {report?.summary || 'AI 已完成诊断，建议通过微访谈补齐关键细节后再进入最终版本。'}
            </p>
          </div>

          <button
            onClick={handleStartMicroInterview}
            className="w-full h-12 rounded-xl shadow-lg bg-primary hover:bg-blue-600 text-white transition-all active:scale-[0.98] shadow-blue-500/20 text-sm font-bold"
            type="button"
          >
            进入微访谈
          </button>
        </main>
      </div>
    );
  }
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
      try { localStorage.removeItem(getPlanStorageKey(effectiveJdText)); } catch { }
    }
    setInterviewPlan([]);
    setPlanFetchTrigger(v => v + 1);
  };

  // 5. Chat Page (Full Screen with Interactive Cards)
  if (currentStep === 'chat') {
    return (
      <ChatPage
        ToastOverlay={ToastOverlay}
        WaveformVisualizer={(props: any) => <WaveformVisualizer {...props} visualizerData={visualizerData} />}
        handleStepBack={handleStepBack}
        onEndInterview={endInterviewFromChat}
        onRestartInterview={handleRestartInterview}
        userAvatar={userAvatar}
        chatMessages={chatMessages}
        isSending={isSending}
        messagesEndRef={messagesEndRef}
        messagesContainerRef={messagesContainerRef}
        onMessagesScroll={handleMessagesScroll}
        expandedReferences={expandedReferences}
        setExpandedReferences={setExpandedReferences}
        parseReferenceReply={parseReferenceReply}
        audioPlayerRef={audioPlayerRef}
        playingAudioId={playingAudioId}
        setPlayingAudioId={setPlayingAudioId}
        hasVoiceBlob={hasVoiceBlobForMsg}
        transcribingByMsgId={transcribingByMsgId}
        transcribeExistingVoiceMessage={transcribeExistingVoiceMessage}
        keyboardOffset={keyboardOffset}
        inputBarHeight={inputBarHeight}
        inputBarRef={inputBarRef}
        isKeyboardOpen={isKeyboardOpen}
        audioError={audioError}
        setAudioError={setAudioError}
        inputMode={inputMode}
        isRecording={isRecording}
        audioSupported={audioSupported}
        holdCancel={holdCancel}
        toggleMode={toggleChatInputMode}
        textareaRef={textareaRef}
        inputMessage={inputMessage}
        setInputMessage={setInputMessage}
        handleSendMessage={() => { void handleSendMessage(); }}
        holdTalkBtnRef={holdTalkBtnRef}
        onHoldPointerDown={onHoldPointerDown}
        onHoldPointerMove={onHoldPointerMove}
        onHoldPointerUp={onHoldPointerUp}
        onHoldPointerCancel={onHoldPointerCancel}
        interviewPlan={interviewPlan}
        interviewAnsweredCount={interviewAnsweredCount}
        interviewTotalCount={interviewPlan.length}
        interviewerTitle={getInterviewerTitle()}
        aiAvatarUrl={getInterviewerAvatarUrl()}
      />
    );
  }

  return null;
};

export default AiAnalysis;
