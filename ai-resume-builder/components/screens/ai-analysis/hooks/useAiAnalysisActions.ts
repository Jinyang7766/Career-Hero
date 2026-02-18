import { useCallback } from 'react';
import { View } from '../../../../types';

type Params = {
  navigateToView: (view: View, options?: any) => void;
  navigateToStep: (step: any, replace?: boolean) => void;
  openChat: (source: 'internal' | 'preview') => void;
  currentStep?: string;
};

export const useAiAnalysisActions = ({
  navigateToView,
  navigateToStep,
  openChat,
  currentStep,
}: Params) => {
  const getScoreColor = useCallback((s: number) => {
    if (s >= 90) return 'text-green-500';
    if (s >= 70) return 'text-primary';
    return 'text-orange-500';
  }, []);

  const handleResumeSelectBack = useCallback(() => {
    navigateToView(View.DASHBOARD, { root: true, replace: true });
  }, [navigateToView]);

  const handleStartMicroInterview = useCallback(() => {
    openChat('internal');
  }, [openChat]);

  const handleRetryAnalysisFromIntro = useCallback(() => {
    navigateToStep('jd_input', true);
  }, [navigateToStep]);

  return {
    getScoreColor,
    handleResumeSelectBack,
    handleStartMicroInterview,
    handleRetryAnalysisFromIntro,
  };
};
