import { useCallback } from 'react';

type Params = {
  setSelectedResumeId: (value: string | number | null) => void;
  sourceResumeIdRef: { current: string | number | null };
  setAnalysisResumeId: (value: string | number | null) => void;
  resetOptimizedCreationState: () => void;
  clearLastAnalysis: () => void;
  setJdText: (value: string) => void;
  setSuggestions: (value: any[]) => void;
  setReport: (value: any) => void;
  setScore: (value: number) => void;
  setOriginalScore: (value: number) => void;
  setChatMessages: (value: any[]) => void;
  setIsFromCache: (value: boolean) => void;
  setOptimizedResumeId: (value: string | number | null) => void;
  setAnalysisInProgress: (value: boolean) => void;
  setCurrentStep: (value: any) => void;
};

export const useAnalyzeOtherResumeReset = ({
  setSelectedResumeId,
  sourceResumeIdRef,
  setAnalysisResumeId,
  resetOptimizedCreationState,
  clearLastAnalysis,
  setJdText,
  setSuggestions,
  setReport,
  setScore,
  setOriginalScore,
  setChatMessages,
  setIsFromCache,
  setOptimizedResumeId,
  setAnalysisInProgress,
  setCurrentStep,
}: Params) => {
  const handleAnalyzeOtherResume = useCallback(() => {
    setSelectedResumeId(null);
    sourceResumeIdRef.current = null;
    setAnalysisResumeId(null);
    resetOptimizedCreationState();
    clearLastAnalysis();
    setJdText('');
    setSuggestions([]);
    setReport(null);
    setScore(0);
    setOriginalScore(0);
    setChatMessages([]);
    setIsFromCache(false);
    setOptimizedResumeId(null);
    setAnalysisInProgress(false);
    setCurrentStep('jd_input');
  }, [
    clearLastAnalysis,
    resetOptimizedCreationState,
    setAnalysisInProgress,
    setAnalysisResumeId,
    setChatMessages,
    setCurrentStep,
    setIsFromCache,
    setJdText,
    setOptimizedResumeId,
    setOriginalScore,
    setReport,
    setScore,
    setSelectedResumeId,
    setSuggestions,
    sourceResumeIdRef,
  ]);

  return { handleAnalyzeOtherResume };
};
