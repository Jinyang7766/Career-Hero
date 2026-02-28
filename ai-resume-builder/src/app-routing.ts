import { View } from '../types';

export const viewToPath = (view: View) => {
  switch (view) {
    case View.LOGIN: return '/login';
    case View.SIGNUP: return '/signup';
    case View.FORGOT_PASSWORD: return '/forgot-password';
    case View.DASHBOARD: return '/dashboard';
    case View.ALL_RESUMES: return '/all-resumes';
    case View.AI_ANALYSIS: return '/ai-analysis';
    case View.PROFILE: return '/profile';
    case View.CAREER_PROFILE: return '/career-profile';
    case View.CAREER_PROFILE_RESULT: return '/career-profile/result';
    case View.EDITOR: return '/editor';
    case View.PREVIEW: return '/preview';
    case View.TEMPLATES: return '/templates';
    case View.SETTINGS: return '/settings';
    case View.ACCOUNT_SECURITY: return '/account-security';
    case View.HELP: return '/help';
    case View.HISTORY: return '/history';
    case View.POINTS_HISTORY: return '/points-history';
    case View.DELETION_PENDING: return '/deletion-pending';
    case View.MEMBER_CENTER: return '/member-center';
    case View.AI_INTERVIEW: return '/ai-interview';
    case View.TERMS_OF_SERVICE: return '/terms-of-service';
    case View.PRIVACY_POLICY: return '/privacy-policy';
    default: return '/dashboard';
  }
};

export const pathToView = (pathname: string): View => {
  const p = (pathname || '').toLowerCase();
  if (p === '/' || p === '') return View.DASHBOARD;
  if (p.startsWith('/ai-analysis')) return View.AI_ANALYSIS;
  if (p.startsWith('/dashboard')) return View.DASHBOARD;
  if (p.startsWith('/all-resumes')) return View.ALL_RESUMES;
  if (p.startsWith('/career-profile/result')) return View.CAREER_PROFILE_RESULT;
  if (p.startsWith('/career-profile')) return View.CAREER_PROFILE;
  if (p.startsWith('/profile')) return View.PROFILE;
  if (p.startsWith('/editor')) return View.EDITOR;
  if (p.startsWith('/preview')) return View.PREVIEW;
  if (p.startsWith('/templates')) return View.TEMPLATES;
  if (p.startsWith('/settings')) return View.SETTINGS;
  if (p.startsWith('/account-security')) return View.ACCOUNT_SECURITY;
  if (p.startsWith('/help')) return View.HELP;
  if (p.startsWith('/history')) return View.HISTORY;
  if (p.startsWith('/points-history')) return View.POINTS_HISTORY;
  if (p.startsWith('/member-center')) return View.MEMBER_CENTER;
  if (p.startsWith('/deletion-pending')) return View.DELETION_PENDING;
  if (p.startsWith('/signup')) return View.SIGNUP;
  if (p.startsWith('/forgot-password')) return View.FORGOT_PASSWORD;
  if (p.startsWith('/ai-interview')) return View.AI_INTERVIEW;
  if (p.startsWith('/terms-of-service')) return View.TERMS_OF_SERVICE;
  if (p.startsWith('/privacy-policy')) return View.PRIVACY_POLICY;
  return View.LOGIN;
};
