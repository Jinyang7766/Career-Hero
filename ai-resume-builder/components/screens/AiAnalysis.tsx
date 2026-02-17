import React, { useState, useEffect, useRef } from 'react';
import { ScreenProps, ResumeData, View } from '../../types';
import { toSkillList } from '../../src/skill-utils';
import { buildApiUrl } from '../../src/api-config';
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
import {
  parseReferenceReply,
  splitNextQuestion,
  stripMarkdownTableSeparators,
  isAffirmative,
  isEndInterviewCommand
} from './ai-analysis/chat-text';
import type { AnalysisReport, ChatMessage, Suggestion } from './ai-analysis/types';

type Step = 'resume_select' | 'jd_input' | 'analyzing' | 'report' | 'chat' | 'comparison';

const AiAnalysis: React.FC<ScreenProps> = () => {
  const { navigateToView, resumeData, setResumeData, allResumes, loadUserResumes, goBack, setIsNavHidden } = useAppContext();
  const navigate = useNavigate();
  const location = useLocation();

  const AI_AVATAR_URL = '/ai-avatar.png';
  const AI_AVATAR_FALLBACK =
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Hiroshi&top=shortHair&clothing=blazerAndShirt';
  // Skill normalization moved to `src/skill-utils.ts` so resume import and suggestion generation stay consistent.

  const getDisplayOriginalValueOf = (suggestion: Suggestion) => getDisplayOriginalValue(suggestion, resumeData);
  const getSuggestionModuleLabelOf = (suggestion: Suggestion) => getSuggestionModuleLabel(suggestion, resumeData);
  // Navigation State
  const [currentStep, setCurrentStep] = useState<Step>(() => deriveInitialStepFromPath());
  const [selectedResumeId, setSelectedResumeId] = useState<string | number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const sourceResumeIdRef = useRef<string | number | null>(null);

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
    score,
    suggestions,
    isAffirmative,
    isEndInterviewCommand,
    splitNextQuestion,
    stripMarkdownTableSeparators,
    formatInterviewQuestion,
    isSelfIntroQuestion,
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
  });

  const { persistAnalysisSnapshot, persistSuggestionFeedback } = useAnalysisPersistence({
    resumeData,
    setResumeData: setResumeData as any,
    jdText,
    targetCompany,
    setSuggestions: setSuggestions as any,
  });
  // --- Handlers ---
  const { cancelInFlightAnalysis, startAnalysis, handleStartAnalysisClick } = useAnalysisExecution({
    resumeData,
    jdText,
    targetCompany,
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

  const handleIgnoreSuggestionInChat = (suggestionId: string) => {
    setSuggestions(prev => prev.map(s => s.id === suggestionId ? { ...s, status: 'ignored' as const } : s));

    setChatMessages(prev => prev.map(msg =>
      msg.suggestion?.id === suggestionId
        ? { ...msg, suggestion: { ...msg.suggestion!, status: 'ignored' as const } }
        : msg
    ));

    // AI Follow up with conversation instead of automatic suggestion
    setTimeout(() => {
      setChatMessages(prev => [...prev, {
        id: `ai-ignore-${Date.now()}`,
        role: 'model' as const,
        text: '没问题，我们继续下一题。'
      }]);
    }, 600);
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
  });

  useEffect(() => {
    if (!resumeData) return;
    const effectiveJdText = (jdText || resumeData.lastJdText || '').trim();
    if (!effectiveJdText) return;

    const jdKey = makeJdKey(effectiveJdText);
    const marker = `${String(resumeData.id || '')}:${jdKey}:${currentStep}`;
    if (recoveredSessionKeyRef.current === marker) return;

    const session = getAnalysisSession(effectiveJdText) as any;
    if (!session) return;

    const status = String(session.state || '');
    const hasInterviewMessages = !!(resumeData.interviewSessions?.[jdKey]?.messages?.length);

    // Refresh/re-entry recovery: interrupted interview should resume in chat with existing history.
    if (
      hasInterviewMessages &&
      (status === 'interview_in_progress' || status === 'paused') &&
      currentStep !== 'chat'
    ) {
      if (!jdText) setJdText(effectiveJdText);
      restoreInterviewSession(effectiveJdText);
      openChat('internal');
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
    restoreInterviewSession,
    setJdText,
  ]);

  useEffect(() => {
    if (currentStep !== 'chat') return;
    if (chatInitialized) return;
    restoreInterviewSession();
  }, [chatInitialized, currentStep, restoreInterviewSession]);



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
    blobToBase64,
  });

  const getScoreColor = (s: number) => {
    if (s >= 90) return 'text-green-500';
    if (s >= 70) return 'text-primary';
    return 'text-orange-500';
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
        onBack={handleStepBack}
        onSelectResume={(resumeId) => handleResumeSelect(resumeId, false)}
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
        handleAcceptSuggestionInChat={handleAcceptSuggestionInChat as any}
        acceptingSuggestionIds={acceptingSuggestionIds}
        handleAnalyzeOtherResume={handleAnalyzeOtherResume}
        handleExportPDF={handleExportPDF}
        openChat={openChat}
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
        handleAcceptSuggestionInChat={handleAcceptSuggestionInChat as any}
        acceptingSuggestionIds={acceptingSuggestionIds}
        handleAnalyzeOtherResume={handleAnalyzeOtherResume}
        handleExportPDF={handleExportPDF}
        openChat={openChat}
      />
    );
  }
  const endInterviewFromChat = () => { void handleSendMessage('结束面试', null); };

  // 5. Chat Page (Full Screen with Interactive Cards)
  if (currentStep === 'chat') {
    return (
      <ChatPage
        ToastOverlay={ToastOverlay}
        WaveformVisualizer={(props: any) => <WaveformVisualizer {...props} visualizerData={visualizerData} />}
        handleStepBack={handleStepBack}
        onEndInterview={endInterviewFromChat}
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
      />
    );
  }

  return null;
};

export default AiAnalysis;
