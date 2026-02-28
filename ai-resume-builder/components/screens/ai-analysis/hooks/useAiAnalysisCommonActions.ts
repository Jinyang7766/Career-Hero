import { useCallback } from 'react';
import { View } from '../../../../types';

type Params = {
  navigateToView: (view: View, options?: any) => void;
};

export const useAiAnalysisCommonActions = ({
  navigateToView,
}: Params) => {
  const getScoreColor = useCallback((s: number) => {
    if (s >= 90) return 'text-green-500';
    if (s >= 70) return 'text-primary';
    return 'text-orange-500';
  }, []);

  const handleResumeSelectBack = useCallback(() => {
    navigateToView(View.DASHBOARD, { root: true, replace: true });
  }, [navigateToView]);

  return {
    getScoreColor,
    handleResumeSelectBack,
  };
};
