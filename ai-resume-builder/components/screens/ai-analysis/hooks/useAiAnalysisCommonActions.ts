import { useCallback } from 'react';
import { View } from '../../../../types';

type Params = {
  navigateToView: (view: View, options?: any) => void;
  navigateToStep: (step: any, replace?: boolean) => void;
  onRetryAnalysisFromIntro?: () => void;
};

export const useAiAnalysisCommonActions = ({
  navigateToView,
  navigateToStep,
  onRetryAnalysisFromIntro,
}: Params) => {
  const getScoreColor = useCallback((s: number) => {
    if (s >= 90) return 'text-green-500';
    if (s >= 70) return 'text-primary';
    return 'text-orange-500';
  }, []);

  const handleResumeSelectBack = useCallback(() => {
    navigateToView(View.DASHBOARD, { root: true, replace: true });
  }, [navigateToView]);

  const handleRetryAnalysisFromIntro = useCallback(() => {
    onRetryAnalysisFromIntro?.();
    navigateToStep('jd_input', true);
  }, [navigateToStep, onRetryAnalysisFromIntro]);

  return {
    getScoreColor,
    handleResumeSelectBack,
    handleRetryAnalysisFromIntro,
  };
};
