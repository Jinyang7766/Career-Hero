import { useEffect } from 'react';
import type { MutableRefObject } from 'react';

type Step = 'resume_select' | 'jd_input' | 'analyzing' | 'report' | 'chat' | 'comparison';

export const deriveInitialStepFromPath = (): Step => {
  const path = (window.location.pathname || '').toLowerCase();
  if (path.startsWith('/ai-analysis')) {
    const rest = path.slice('/ai-analysis'.length).replace(/^\/+/, '');
    const sub = (rest.split('/').filter(Boolean)[0] || '');
    if (sub === 'jd') return 'jd_input';
    if (sub === 'analyzing') return 'analyzing';
    if (sub === 'report') return 'report';
    if (sub === 'chat') return 'chat';
    if (sub === 'comparison') return 'comparison';
  }
  return 'resume_select';
};

type Params = {
  currentStep: Step;
  selectedResumeId: string | number | null;
  setSelectedResumeId: (v: string | number | null) => void;
  sourceResumeIdRef: MutableRefObject<string | number | null>;
  setAnalysisResumeId: (v: string | number | null) => void;
  navigate: (to: string, options?: { replace?: boolean }) => void;
};

export const useAiRouteSync = ({
  currentStep,
  selectedResumeId,
  setSelectedResumeId,
  sourceResumeIdRef,
  setAnalysisResumeId,
  navigate,
}: Params) => {
  useEffect(() => {
    const currentPath = window.location.pathname.toLowerCase();
    if (!currentPath.startsWith('/ai-analysis')) return;

    const base = '/ai-analysis';
    const targetPath = (() => {
      switch (currentStep) {
        case 'resume_select': return base;
        case 'jd_input': return `${base}/jd`;
        case 'analyzing': return `${base}/analyzing`;
        case 'report': return selectedResumeId ? `${base}/report/${selectedResumeId}` : `${base}/report`;
        case 'chat': return `${base}/chat`;
        case 'comparison': return selectedResumeId ? `${base}/comparison/${selectedResumeId}` : `${base}/comparison`;
        default: return base;
      }
    })();
    if (currentPath !== targetPath.toLowerCase()) {
      navigate(targetPath, { replace: true });
    }
  }, [currentStep, selectedResumeId, navigate]);

  useEffect(() => {
    const path = (window.location.pathname || '').toLowerCase();
    if (!path.startsWith('/ai-analysis')) return;
    const rest = path.slice('/ai-analysis'.length).replace(/^\/+/, '');
    const parts = rest ? rest.split('/').filter(Boolean) : [];
    const sub = parts[0] || '';
    const id = parts[1] || '';
    if ((sub === 'report' || sub === 'comparison') && id) {
      setSelectedResumeId(id);
      sourceResumeIdRef.current = id;
      setAnalysisResumeId(id);
    }
  }, [setSelectedResumeId, sourceResumeIdRef, setAnalysisResumeId]);
};
