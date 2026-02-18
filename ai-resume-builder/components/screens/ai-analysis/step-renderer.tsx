import React from 'react';
import ChatPage from './ChatPage';
import ResumeSelectPage from './pages/ResumeSelectPage';
import JdInputPage from './pages/JdInputPage';
import ReportPage from './pages/ReportPage';
import MicroInterviewIntroPage from './pages/MicroInterviewIntroPage';

type Step = 'resume_select' | 'jd_input' | 'analyzing' | 'report' | 'micro_intro' | 'chat' | 'comparison';

type Params = {
  currentStep: Step;
  allResumes: any[];
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  isOptimizedOpen: boolean;
  setIsOptimizedOpen: (v: boolean) => void;
  isUnoptimizedOpen: boolean;
  setIsUnoptimizedOpen: (v: boolean) => void;
  handleResumeSelectBack: () => void;
  handleResumeSelect: (resumeId: string | number, preferReport: boolean) => void;
  selectedResumeId: string | number | null;
  resumeReadState: any;
  isInterviewMode?: boolean;
  isSameResumeId: (a: any, b: any) => boolean;
  resumeData: any;
  targetCompany: string;
  setTargetCompany: (v: string) => void;
  jdText: string;
  setJdText: (v: string) => void;
  isUploading: boolean;
  handleScreenshotUpload: (e: React.ChangeEvent<HTMLInputElement>) => void | Promise<void>;
  handleStepBack: () => void;
  setCurrentStep: (v: Step) => void;
  handleStartAnalysisClick: (interviewType?: string) => void;
  showJdEmptyModal: boolean;
  setShowJdEmptyModal: (v: boolean) => void;
  startAnalysis: (interviewType?: string) => void | Promise<void>;
  hasJdInput: () => boolean;
  score: number;
  originalScore: number;
  report: any;
  suggestions: any[];
  setSuggestions: React.Dispatch<React.SetStateAction<any[]>>;
  getScoreColor: (s: number) => string;
  getSuggestionModuleLabelOf: (s: any) => string;
  getDisplayOriginalValueOf: (s: any) => React.ReactNode;
  persistSuggestionFeedback: (suggestion: any, rating: 'up' | 'down') => void;
  handleIgnoreSuggestion: (suggestion: any) => void | Promise<void>;
  handleAcceptSuggestionInChat: (suggestion: any) => void;
  acceptingSuggestionIds: Set<string>;
  handleAnalyzeOtherResume: () => void;
  handleExportPDF: () => void;
  handleStartMicroInterview: () => void;
  ToastOverlay: React.ComponentType;
  WaveformVisualizer: React.ComponentType<{ active: boolean; cancel: boolean }>;
  endInterviewFromChat: () => void;
  handleRestartInterview: () => void;
  userAvatar: string;
  chatMessages: any[];
  isSending: boolean;
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
  getInterviewerTitle: () => string;
  getInterviewerAvatarUrl: () => string;
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
        onSelectResume={(resumeId, preferReport) => p.handleResumeSelect(resumeId, !!preferReport)}
        selectedResumeId={p.selectedResumeId}
        isReading={p.resumeReadState.status === 'loading'}
        isInterviewMode={p.isInterviewMode}
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
        onPrev={() => p.setCurrentStep('resume_select')}
        onStart={p.handleStartAnalysisClick}
        showJdEmptyModal={p.showJdEmptyModal}
        setShowJdEmptyModal={p.setShowJdEmptyModal}
        startAnalysis={p.startAnalysis}
        isInterviewMode={p.isInterviewMode}
      />
    );
  }

  if (p.currentStep === 'analyzing' || p.currentStep === 'report') {
    return (
      <ReportPage
        mode={p.currentStep === 'analyzing' ? 'analyzing' : 'report'}
        hasJdInput={p.hasJdInput}
        handleStepBack={p.handleStepBack}
        score={p.score}
        originalScore={p.originalScore}
        report={p.report}
        suggestions={p.suggestions}
        setSuggestions={p.setSuggestions as any}
        getScoreColor={p.getScoreColor}
        getSuggestionModuleLabel={p.getSuggestionModuleLabelOf}
        getDisplayOriginalValue={p.getDisplayOriginalValueOf}
        persistSuggestionFeedback={p.persistSuggestionFeedback as any}
        handleIgnoreSuggestion={p.handleIgnoreSuggestion as any}
        handleAcceptSuggestionInChat={p.handleAcceptSuggestionInChat as any}
        acceptingSuggestionIds={p.acceptingSuggestionIds}
        handleAnalyzeOtherResume={p.handleAnalyzeOtherResume}
        handleExportPDF={p.handleExportPDF}
        handleStartMicroInterview={p.handleStartMicroInterview}
      />
    );
  }

  if (p.currentStep === 'micro_intro') {
    return (
      <MicroInterviewIntroPage
        score={p.score}
        originalScore={p.originalScore}
        summary={p.report?.summary}
        scoreBreakdown={p.report?.scoreBreakdown as any}
        getScoreColor={p.getScoreColor}
        onBack={p.handleStepBack}
        onStart={p.handleStartMicroInterview}
      />
    );
  }

  if (p.currentStep === 'chat') {
    return (
      <ChatPage
        ToastOverlay={p.ToastOverlay}
        WaveformVisualizer={p.WaveformVisualizer}
        handleStepBack={p.handleStepBack}
        onEndInterview={p.endInterviewFromChat}
        onRestartInterview={p.handleRestartInterview}
        userAvatar={p.userAvatar}
        chatMessages={p.chatMessages}
        isSending={p.isSending}
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
        interviewerTitle={p.getInterviewerTitle()}
        aiAvatarUrl={p.getInterviewerAvatarUrl()}
      />
    );
  }

  return null;
};
