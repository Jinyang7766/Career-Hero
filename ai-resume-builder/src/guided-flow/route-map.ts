import { View } from '../../types';
import type { GuidedFlowStep } from './types';

const normalizePath = (pathname: string): string => {
  const path = String(pathname || '').split('?')[0].split('#')[0].trim().toLowerCase();
  if (!path) return '/';
  const stripped = path.replace(/\/+$/, '');
  return stripped || '/';
};

export const deriveGuidedFlowStepFromLocation = (
  pathname: string,
  currentView?: View
): GuidedFlowStep | null => {
  const path = normalizePath(pathname);

  if (path === '/career-profile' || path === '/career-profile/upload' || path === '/career-profile/followup') {
    return 'step1_profile_input';
  }
  if (path.startsWith('/career-profile/result')) return 'step2_profile_confirm';

  if (path === '/ai-interview' || path.startsWith('/ai-interview/')) {
    return 'step6_interview';
  }

  if (path === '/ai-analysis' || path === '/ai-analysis/jd') {
    return 'step3_mode_and_resume';
  }

  if (path === '/ai-analysis/comparison' || path.startsWith('/ai-analysis/comparison/')) {
    return 'step5_refine';
  }

  if (
    path === '/ai-analysis/interview-report-loading' ||
    path === '/ai-analysis/interview-report' ||
    path.startsWith('/ai-analysis/interview-report/')
  ) {
    return 'step6_interview';
  }

  if (
    path === '/ai-analysis/analyzing' ||
    path === '/ai-analysis/report' ||
    path === '/ai-analysis/final-report' ||
    path.startsWith('/ai-analysis/final-report/') ||
    path === '/ai-analysis/chat'
  ) {
    return currentView === View.AI_INTERVIEW ? 'step6_interview' : 'step4_report';
  }

  return null;
};
