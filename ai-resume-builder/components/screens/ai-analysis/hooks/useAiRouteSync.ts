import { useEffect } from 'react';
import type { MutableRefObject } from 'react';

type Step = 'resume_select' | 'jd_input' | 'analyzing' | 'report' | 'micro_intro' | 'chat' | 'interview_report_loading' | 'interview_report' | 'comparison' | 'final_report';

export const deriveInitialStepFromPath = (): Step => {
  const path = (window.location.pathname || '').toLowerCase();
    if (path.startsWith('/ai-analysis')) {
      const rest = path.slice('/ai-analysis'.length).replace(/^\/+/, '');
      const sub = (rest.split('/').filter(Boolean)[0] || '');
      if (sub === 'jd') return 'jd_input';
      if (sub === 'analyzing') return 'analyzing';
      if (sub === 'report') return 'report';
      if (sub === 'micro-interview') return 'micro_intro';
      if (sub === 'chat') return 'chat';
      if (sub === 'interview-report-loading') return 'interview_report_loading';
      if (sub === 'interview-report') return 'interview_report';
      if (sub === 'comparison') return 'comparison';
      if (sub === 'final-report') return 'final_report';
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
  const normalizePath = (value: string) => {
    const path = String(value || '').split('?')[0].split('#')[0].trim().toLowerCase();
    if (!path) return '';
    const stripped = path.replace(/\/+$/, '');
    return stripped || '/';
  };

  useEffect(() => {
    const currentPath = normalizePath(window.location.pathname || '');
    if (!currentPath.startsWith('/ai-analysis')) return;

    const base = '/ai-analysis';
    const targetPath = (() => {
      switch (currentStep) {
        case 'resume_select': return base;
        case 'jd_input': return `${base}/jd`;
        case 'analyzing': return `${base}/analyzing`;
        case 'report': return selectedResumeId ? `${base}/report/${selectedResumeId}` : `${base}/report`;
        case 'micro_intro': return `${base}/micro-interview`;
        case 'chat': return `${base}/chat`;
        case 'interview_report_loading': return `${base}/interview-report-loading`;
        case 'interview_report': return selectedResumeId ? `${base}/interview-report/${selectedResumeId}` : `${base}/interview-report`;
        case 'comparison': return selectedResumeId ? `${base}/comparison/${selectedResumeId}` : `${base}/comparison`;
        case 'final_report': return selectedResumeId ? `${base}/final-report/${selectedResumeId}` : `${base}/final-report`;
        default: return base;
      }
    })();
    const normalizedTargetPath = normalizePath(targetPath);
    if (currentPath !== normalizedTargetPath) {
      navigate(targetPath, { replace: true });
    }
  }, [currentStep, selectedResumeId, navigate]);

  useEffect(() => {
    const path = normalizePath(window.location.pathname || '');
    if (!path.startsWith('/ai-analysis')) return;
    const rest = path.slice('/ai-analysis'.length).replace(/^\/+/, '');
    const parts = rest ? rest.split('/').filter(Boolean) : [];
    const sub = parts[0] || '';
    const id = parts[1] || '';
    if ((sub === 'report' || sub === 'interview-report' || sub === 'comparison' || sub === 'final-report') && id) {
      const normalizedId = String(id);
      const selectedId = selectedResumeId == null ? '' : String(selectedResumeId);
      if (selectedId !== normalizedId) {
        setSelectedResumeId(normalizedId);
        sourceResumeIdRef.current = normalizedId;
        setAnalysisResumeId(normalizedId);
      }
    }
  }, [selectedResumeId, setSelectedResumeId, sourceResumeIdRef, setAnalysisResumeId]);
};
