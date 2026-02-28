import React from 'react';
import ChatPage from './ChatPage';
import ResumeSelectPage from './pages/ResumeSelectPage';
import JdInputPage from './pages/JdInputPage';
import PostInterviewReportPage from './pages/PostInterviewReportPage';
import FinalResumeReportPage from './pages/FinalResumeReportPage';
import InterviewReportPage from './pages/InterviewReportPage';
import FinalAnalysisLoadingPage from './pages/FinalAnalysisLoadingPage';
import InterviewReportLoadingPage from './pages/InterviewReportLoadingPage';
import type { AiAnalysisStep } from './step-types';

type Params = {
  currentStep: AiAnalysisStep;
  allResumes: any[];
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  isOptimizedOpen: boolean;
  setIsOptimizedOpen: (v: boolean) => void;
  isUnoptimizedOpen: boolean;
  setIsUnoptimizedOpen: (v: boolean) => void;
  handleResumeSelectBack: () => void;
  handleResumeSelect: (
    resumeId: string | number,
    preferReport: boolean,
    targetStep?: 'chat' | 'comparison' | 'final_report'
  ) => void;
  selectedResumeId: string | number | null;
  resumeReadState: any;
  isInterviewMode?: boolean;
  pointsRemaining?: number | null;
  isSameResumeId: (a: any, b: any) => boolean;
  resumeData: any;
  targetCompany: string;
  setTargetCompany: (v: string) => void;
  jdText: string;
  setJdText: (v: string) => void;
  isUploading: boolean;
  handleScreenshotUpload: (e: React.ChangeEvent<HTMLInputElement>) => void | Promise<void>;
  handleStepBack: () => void;
  setCurrentStep: (v: AiAnalysisStep) => void;
  handleStartAnalysisClick: (interviewType?: string) => void;
  showJdEmptyModal: boolean;
  setShowJdEmptyModal: (v: boolean) => void;
  startAnalysis: (interviewType?: string) => void | Promise<void>;
  onRestartCompletedInterviewScene?: () => Promise<void> | void;
  interviewEntryConfirmPendingRef?: React.MutableRefObject<boolean>;
  score: number;
  originalScore: number;
  getScoreColor: (s: number) => string;
  onFinalReportFeedback?: (rating: 'up' | 'down', reason?: string) => Promise<boolean> | boolean;
  onInterviewReportFeedback?: (rating: 'up' | 'down', reason?: string) => Promise<boolean> | boolean;
  ToastOverlay: React.ComponentType;
  WaveformVisualizer: React.ComponentType<{ active: boolean; cancel: boolean }>;
  interruptCurrentThinking: () => void;
  endInterviewFromChat: () => void;
  skipInterviewQuestionFromChat: () => void;
  handleRestartInterview: () => void;
  userAvatar: string;
  chatMessages: any[];
  isSending: boolean;
  hasPendingReply: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  messagesContainerRef: React.RefObject<HTMLDivElement | null>;
  handleMessagesScroll: () => void;
  expandedReferences: Record<string, boolean>;
  setExpandedReferences: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  parseReferenceReply: (text: string) => any;
  audioPlayerRef: React.RefObject<HTMLAudioElement | null>;
  playingAudioId: string | null;
  setPlayingAudioId: React.Dispatch<React.SetStateAction<string | null>>;
  hasVoiceBlobForMsg: (msgId: string) => boolean;
  transcribingByMsgId: Record<string, boolean>;
  transcribeExistingVoiceMessage: (msgId: string) => void;
  keyboardOffset: number;
  inputBarHeight: number;
  inputBarRef: React.RefObject<HTMLDivElement | null>;
  isKeyboardOpen: boolean;
  audioError: string;
  setAudioError: (v: string) => void;
  inputMode: 'text' | 'voice';
  isRecording: boolean;
  audioSupported: boolean;
  holdCancel: boolean;
  toggleChatInputMode: () => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  inputMessage: string;
  setInputMessage: (v: string) => void;
  handleSendMessage: () => void;
  holdTalkBtnRef: React.RefObject<HTMLButtonElement | null>;
  onHoldPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onHoldPointerMove: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onHoldPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onHoldPointerCancel: (e: React.PointerEvent<HTMLButtonElement>) => void;
  interviewPlan: string[];
  interviewAnsweredCount: number;
  currentQuestionElapsedSec: number;
  getInterviewerTitle: () => string;
  getInterviewerAvatarUrl: () => string;
  onChatMessageFeedback?: (message: any, rating: 'up' | 'down', reason?: string) => Promise<boolean> | boolean;
  postInterviewSummary: string;
  interviewReportSummary: string;
  interviewReportScore: number;
  interviewReportAdvice: string[];
  postInterviewOriginalResume: any;
  postInterviewGeneratedResume: any;
  postInterviewAnnotations: Array<{ id: string; title: string; reason: string; section: string; targetId?: string; targetField?: string }>;
  handlePostInterviewFeedback: (rating: 'up' | 'down', reason?: string) => Promise<boolean> | boolean;
  handleCompleteAndSavePostInterview: (editedResume?: any) => Promise<void> | void;
  finalReportScore: number;
  finalReportSummary: string;
  finalReportAdvice: string[];
  handleStartInterviewFromFinalReport: () => void | Promise<void>;
  handleGoToComparisonFromFinalReport: () => void | Promise<void>;
  isFinalReportGenerating?: boolean;
};

export const renderAiAnalysisStep = (p: Params) => {
  if (p.currentStep === 'resume_select') {
    return (
      <ResumeSelectPage
        allResumes={p.allResumes}
        searchQuery={p.searchQuery}
        setSearchQuery={p.setSearchQuery}
        isOptimizedOpen={p.isOptimizedOpen}
        setIsOptimizedOpen={p.setIsOptimizedOpen}
        isUnoptimizedOpen={p.isUnoptimizedOpen}
        setIsUnoptimizedOpen={p.setIsUnoptimizedOpen}
        onBack={p.handleResumeSelectBack}
        onSelectResume={(resumeId, preferReport, targetStep) => p.handleResumeSelect(resumeId, !!preferReport, targetStep)}
        selectedResumeId={p.selectedResumeId}
        isReading={p.resumeReadState.status === 'loading'}
        isInterviewMode={p.isInterviewMode}
        pointsRemaining={p.pointsRemaining}
      />
    );
  }

  if (p.currentStep === 'jd_input') {
    return (
      <JdInputPage
        allResumes={p.allResumes}
        selectedResumeId={p.selectedResumeId}
        isSameResumeId={p.isSameResumeId}
        resumeData={p.resumeData}
        resumeReadState={p.resumeReadState}
        targetCompany={p.targetCompany}
        setTargetCompany={p.setTargetCompany}
        jdText={p.jdText}
        setJdText={p.setJdText}
        isUploading={p.isUploading}
        onScreenshotUpload={p.handleScreenshotUpload}
        onBack={p.handleStepBack}
        onStart={p.handleStartAnalysisClick}
        onViewReport={() => p.setCurrentStep('interview_report')}
        showJdEmptyModal={p.showJdEmptyModal}
        setShowJdEmptyModal={p.setShowJdEmptyModal}
        startAnalysis={p.startAnalysis}
        onRestartCompletedInterviewScene={p.onRestartCompletedInterviewScene}
        isInterviewMode={p.isInterviewMode}
        interviewEntryConfirmPendingRef={p.interviewEntryConfirmPendingRef}
      />
    );
  }

  if (p.currentStep === 'analyzing') {
    return <FinalAnalysisLoadingPage />;
  }

  if (p.currentStep === 'chat') {
    if (!p.isInterviewMode) {
      if (p.isFinalReportGenerating) {
        return <FinalAnalysisLoadingPage />;
      }
      return (
        <FinalResumeReportPage
          score={p.finalReportScore}
          summary={p.finalReportSummary}
          advice={p.finalReportAdvice}
          getScoreColor={p.getScoreColor}
          onBack={p.handleStepBack}
          onStartInterview={() => { void p.handleStartInterviewFromFinalReport(); }}
          onGoToComparison={() => { void p.handleGoToComparisonFromFinalReport(); }}
          onFeedback={p.onFinalReportFeedback}
        />
      );
    }
    return (
      <ChatPage
        isInterviewMode={!!p.isInterviewMode}
        ToastOverlay={p.ToastOverlay}
        WaveformVisualizer={p.WaveformVisualizer}
        handleStepBack={p.handleStepBack}
        onInterruptThinking={p.interruptCurrentThinking}
        onEndInterview={p.endInterviewFromChat}
        onSkipQuestion={p.skipInterviewQuestionFromChat}
        onRestartInterview={p.handleRestartInterview}
        userAvatar={p.userAvatar}
        chatMessages={p.chatMessages}
        isSending={p.isSending}
        hasPendingReply={p.hasPendingReply}
        messagesEndRef={p.messagesEndRef}
        messagesContainerRef={p.messagesContainerRef}
        onMessagesScroll={p.handleMessagesScroll}
        expandedReferences={p.expandedReferences}
        setExpandedReferences={p.setExpandedReferences}
        parseReferenceReply={p.parseReferenceReply}
        audioPlayerRef={p.audioPlayerRef}
        playingAudioId={p.playingAudioId}
        setPlayingAudioId={p.setPlayingAudioId}
        hasVoiceBlob={p.hasVoiceBlobForMsg}
        transcribingByMsgId={p.transcribingByMsgId}
        transcribeExistingVoiceMessage={p.transcribeExistingVoiceMessage}
        keyboardOffset={p.keyboardOffset}
        inputBarHeight={p.inputBarHeight}
        inputBarRef={p.inputBarRef}
        isKeyboardOpen={p.isKeyboardOpen}
        audioError={p.audioError}
        setAudioError={p.setAudioError}
        inputMode={p.inputMode}
        isRecording={p.isRecording}
        audioSupported={p.audioSupported}
        holdCancel={p.holdCancel}
        toggleMode={p.toggleChatInputMode}
        textareaRef={p.textareaRef}
        inputMessage={p.inputMessage}
        setInputMessage={p.setInputMessage}
        handleSendMessage={p.handleSendMessage}
        holdTalkBtnRef={p.holdTalkBtnRef}
        onHoldPointerDown={p.onHoldPointerDown}
        onHoldPointerMove={p.onHoldPointerMove}
        onHoldPointerUp={p.onHoldPointerUp}
        onHoldPointerCancel={p.onHoldPointerCancel}
        interviewPlan={p.interviewPlan}
        interviewAnsweredCount={p.interviewAnsweredCount}
        interviewTotalCount={p.interviewPlan.length}
        currentQuestionElapsedSec={p.currentQuestionElapsedSec}
        interviewerTitle={p.getInterviewerTitle()}
        aiAvatarUrl={p.getInterviewerAvatarUrl()}
        onMessageFeedback={p.onChatMessageFeedback}
      />
    );
  }

  if (p.currentStep === 'comparison') {
    if (p.isFinalReportGenerating) {
      return <FinalAnalysisLoadingPage />;
    }
    return (
      <PostInterviewReportPage
        originalResume={p.postInterviewOriginalResume}
        generatedResume={p.postInterviewGeneratedResume}
        annotations={p.postInterviewAnnotations}
        onFeedback={p.handlePostInterviewFeedback}
        onCompleteAndSave={p.handleCompleteAndSavePostInterview}
        onBack={p.handleStepBack}
      />
    );
  }

  if (p.currentStep === 'interview_report') {
    return (
      <InterviewReportPage
        summary={p.interviewReportSummary}
        score={p.interviewReportScore}
        advice={p.interviewReportAdvice}
        onBack={p.handleStepBack}
        onFeedback={p.onInterviewReportFeedback}
      />
    );
  }

  if (p.currentStep === 'interview_report_loading') {
    return <InterviewReportLoadingPage />;
  }

  if (p.currentStep === 'final_report') {
    if (p.isFinalReportGenerating) {
      return <FinalAnalysisLoadingPage />;
    }
    return (
      <FinalResumeReportPage
        score={p.finalReportScore}
        summary={p.finalReportSummary}
        advice={p.finalReportAdvice}
        getScoreColor={p.getScoreColor}
        onBack={p.handleStepBack}
        onStartInterview={() => { void p.handleStartInterviewFromFinalReport(); }}
        onGoToComparison={() => { void p.handleGoToComparisonFromFinalReport(); }}
        onFeedback={p.onFinalReportFeedback}
      />
    );
  }

  // Defensive fallback: never render a blank screen when step state is corrupted.
  console.warn('[AI_ANALYSIS] unexpected step, fallback to resume_select:', p.currentStep);
  return (
    <ResumeSelectPage
      allResumes={p.allResumes}
      searchQuery={p.searchQuery}
      setSearchQuery={p.setSearchQuery}
      isOptimizedOpen={p.isOptimizedOpen}
      setIsOptimizedOpen={p.setIsOptimizedOpen as any}
      isUnoptimizedOpen={p.isUnoptimizedOpen}
      setIsUnoptimizedOpen={p.setIsUnoptimizedOpen as any}
      onBack={p.handleResumeSelectBack}
      onSelectResume={(resumeId, preferReport, targetStep) => p.handleResumeSelect(resumeId, !!preferReport, targetStep)}
      selectedResumeId={p.selectedResumeId}
      isReading={p.resumeReadState?.status === 'loading'}
      isInterviewMode={p.isInterviewMode}
      pointsRemaining={p.pointsRemaining}
    />
  );
};
