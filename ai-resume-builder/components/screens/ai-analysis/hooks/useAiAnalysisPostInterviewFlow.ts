import type { ResumeData } from '../../../../types';
import type React from 'react';
import { useFinalDiagnosisReportGenerator } from './useFinalDiagnosisReportGenerator';
import { usePostInterviewFeedback } from './usePostInterviewFeedback';
import { usePostInterviewFinalize } from './usePostInterviewFinalize';
import { usePostInterviewReportData } from './usePostInterviewReportData';

type Params = {
  currentStep: string;
  originalResumeData: ResumeData | null;
  resumeData: ResumeData | null;
  suggestions: any[];
  postInterviewSummary: string;
  reportSummary?: string;
  score: number;
  weaknesses: string[];
  jdText: string;
  makeJdKey: (v: string) => string;
  userProfile: any;
  getRagEnabledFlag: () => boolean;
  getBackendAuthToken: () => Promise<string>;
  buildApiUrl: (path: string) => string;
  chatMessagesRef: React.MutableRefObject<any[]>;
  currentUserId?: string;
  showToast: (msg: string, type?: 'info' | 'success' | 'error', ms?: number) => void;
  sourceResumeIdRef: React.MutableRefObject<string | number | null>;
  targetCompany: string;
  allResumes: any[];
  isSameResumeId: (a: any, b: any) => boolean;
  setResumeData: (v: any) => void;
  setSelectedResumeId: (v: string | number | null) => void;
  setAnalysisResumeId: (v: string | number | null) => void;
  setOptimizedResumeId: (v: string | number | null) => void;
  navigateToStep: (...args: any[]) => any;
};

export const useAiAnalysisPostInterviewFlow = ({
  currentStep,
  originalResumeData,
  resumeData,
  suggestions,
  postInterviewSummary,
  reportSummary,
  score,
  weaknesses,
  jdText,
  makeJdKey,
  userProfile,
  getRagEnabledFlag,
  getBackendAuthToken,
  buildApiUrl,
  chatMessagesRef,
  currentUserId,
  showToast,
  sourceResumeIdRef,
  targetCompany,
  allResumes,
  isSameResumeId,
  setResumeData,
  setSelectedResumeId,
  setAnalysisResumeId,
  setOptimizedResumeId,
  navigateToStep,
}: Params) => {
  const {
    postInterviewOriginalResume,
    postInterviewGeneratedResume,
    postInterviewAnnotations,
    effectivePostInterviewSummary,
    finalReportScore,
    finalReportSummary,
    finalReportAdvice,
  } = usePostInterviewReportData({
    originalResumeData,
    resumeData: resumeData as ResumeData,
    suggestions,
    postInterviewSummary,
    reportSummary,
    baseScore: score,
    weaknesses,
  });

  const finalReportOverride = useFinalDiagnosisReportGenerator({
    currentStep,
    resumeData,
    postInterviewGeneratedResume,
    jdText,
    effectivePostInterviewSummary,
    finalReportSummary,
    finalReportScore,
    finalReportAdvice,
    makeJdKey,
    userProfile,
    getRagEnabledFlag,
    getBackendAuthToken,
    buildApiUrl,
    chatMessagesRef: chatMessagesRef as any,
  });

  const { handlePostInterviewFeedback } = usePostInterviewFeedback({
    currentUserId,
    showToast,
    effectivePostInterviewSummary,
    postInterviewGeneratedResume,
    postInterviewOriginalResume,
    resumeId: resumeData?.id,
  });

  const { handleCompleteAndSavePostInterview } = usePostInterviewFinalize({
    currentUserId,
    generatedResume: postInterviewGeneratedResume as any,
    sourceResumeIdRef: sourceResumeIdRef as any,
    resumeData: resumeData as any,
    jdText,
    targetCompany,
    allResumes: allResumes as any,
    makeJdKey,
    isSameResumeId,
    setResumeData: setResumeData as any,
    setSelectedResumeId,
    setAnalysisResumeId,
    setOptimizedResumeId,
    showToast,
    navigateToStep: navigateToStep as any,
    finalReportScore,
    finalReportSummary,
    finalReportAdvice,
  });

  return {
    postInterviewOriginalResume,
    postInterviewGeneratedResume,
    postInterviewAnnotations,
    effectivePostInterviewSummary,
    finalReportScore,
    finalReportSummary,
    finalReportAdvice,
    finalReportOverride,
    handlePostInterviewFeedback,
    handleCompleteAndSavePostInterview,
  };
};
