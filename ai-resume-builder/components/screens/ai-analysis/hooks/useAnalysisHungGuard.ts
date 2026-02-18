import { useEffect } from 'react';

type Params = {
  currentStep: string;
  setCurrentStep: (step: any) => void;
  isAnalysisStillInProgress: () => boolean;
  inprogressAtKey: string;
  cancelInFlightAnalysis: (message?: string) => void;
};

export const useAnalysisHungGuard = ({
  currentStep,
  setCurrentStep,
  isAnalysisStillInProgress,
  inprogressAtKey,
  cancelInFlightAnalysis,
}: Params) => {
  useEffect(() => {
    if (currentStep !== 'analyzing') return;

    const HUNG_MS = 90 * 1000;
    const getStartedAt = () => {
      const raw = localStorage.getItem(inprogressAtKey);
      const at = raw ? Number(raw) : NaN;
      return Number.isFinite(at) ? at : null;
    };

    const check = () => {
      const inProgress = isAnalysisStillInProgress();
      if (!inProgress) {
        setCurrentStep('jd_input');
        return;
      }

      const at = getStartedAt();
      if (!at) return;
      const elapsed = Date.now() - at;
      if (elapsed > HUNG_MS) {
        cancelInFlightAnalysis('切换到后台后诊断超时，请返回重试。');
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') check();
    };
    const onFocus = () => check();

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    const intervalId = window.setInterval(check, 5000);
    check();

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
      window.clearInterval(intervalId);
    };
  }, [currentStep, setCurrentStep, isAnalysisStillInProgress, inprogressAtKey, cancelInFlightAnalysis]);
};


