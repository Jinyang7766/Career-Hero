import type { MutableRefObject } from 'react';

export type AiExternalEntriesParams = {
  currentUserId?: string;
  currentStep?: string;
  isInterviewMode?: boolean;
  setResumeData?: (v: any) => void;
  sourceResumeIdRef: MutableRefObject<string | number | null>;
  setSelectedResumeId: (v: string | number | null) => void;
  setAnalysisResumeId: (v: string | number | null) => void;
  setOptimizedResumeId: (v: string | number | null) => void;
  setTargetCompany: (v: string) => void;
  setJdText: (v: string) => void;
  makeJdKey: (text: string) => string;
  setChatMessages: (v: any) => void;
  setChatInitialized: (v: boolean) => void;
  openChat: (source: 'internal' | 'preview', options?: { skipRestore?: boolean }) => void;
  setStepHistory: (v: any[]) => void;
  setChatEntrySource?: (v: 'internal' | 'preview' | null) => void;
  setLastChatStep?: (v: any) => void;
  setCurrentStep: (v: any) => void;
  setForceReportEntry: (v: boolean) => void;
  handleResumeSelect: (
    id: string | number,
    preferReport?: boolean,
    targetStep?: 'report' | 'chat' | 'final_report'
  ) => Promise<void> | void;
};

