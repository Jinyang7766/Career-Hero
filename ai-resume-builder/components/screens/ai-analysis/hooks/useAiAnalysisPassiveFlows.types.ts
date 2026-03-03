import type React from 'react';
import type { AnalysisMode } from '../analysis-mode';

export type AiAnalysisPassiveFlowsParams = {
  isInterviewMode?: boolean;
  currentStep: string;
  chatInitialized: boolean;
  chatMessagesRef: React.MutableRefObject<any[]>;
  chatIntroScheduledRef: React.MutableRefObject<boolean>;
  setChatInitialized: (v: boolean) => void;
  setChatMessages: React.Dispatch<React.SetStateAction<any[]>>;
  resumeData: any;
  jdText: string;
  analysisMode?: AnalysisMode;

  chatEntrySource: 'internal' | 'preview' | null;
  score: number;
  suggestionsLength: number;
  setChatEntrySource: (v: 'internal' | 'preview' | null) => void;
  setLastChatStep: (v: any) => void;
  setStepHistory: React.Dispatch<React.SetStateAction<any[]>>;
  setCurrentStep: (v: any) => void;
  selectedResumeId: string | number | null;

  forcedResumeSelect: boolean;
  setJdText: (v: string) => void;
  getAnalysisSession: (...args: any[]) => any;
  makeJdKey: (v: string) => string;
  hasInterviewSessionMessages: (...args: any[]) => boolean;
  restoreInterviewSession: (...args: any[]) => any;
  openChat: (source: 'internal' | 'preview', options?: { skipRestore?: boolean }) => void;
  navigateToStep: (...args: any[]) => any;
  loadLastAnalysis: (...args: any[]) => any;
  recoveredSessionKeyRef: React.MutableRefObject<string>;
  interviewEntryConfirmPendingRef?: React.MutableRefObject<boolean>;

  optimizedResumeId: string | number | null;
  setAllResumes: (v: any) => void;
  targetCompany: string;
  persistAnalysisSessionState: (...args: any[]) => Promise<void>;

  interviewPlanConfigKey: string;
  buildApiUrl: (path: string) => string;
  currentUserId?: string;
  planFetchTrigger: number;
  setInterviewPlan: React.Dispatch<React.SetStateAction<string[]>>;
  getBackendAuthToken: () => Promise<string>;
  planLoaderMountedRef: React.MutableRefObject<boolean>;

  report: any;
  applyAnalysisSnapshot: (...args: any[]) => any;
  setTargetCompany: (v: string) => void;
  setAnalysisResumeId: (v: string | number | null) => void;
  setResumeData: (v: any) => void;
  sourceResumeIdRef: React.MutableRefObject<string | number | null>;

  isAnalysisStillInProgress: () => boolean;
  inprogressAtKey: string;
  cancelInFlightAnalysis: (...args: any[]) => any;
  suppressDiagnosisSessionRecoveryRef: React.MutableRefObject<boolean>;

  setSelectedResumeId: (v: string | number | null) => void;
  setOptimizedResumeId: (v: string | number | null) => void;
  setForceReportEntry: (v: boolean) => void;
  handleResumeSelect: (...args: any[]) => any;
};
