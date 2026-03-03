import type { UserProfile } from '../useUserProfile';
import type { GuidedFlowStep } from './types';
import { isGuidedStepAtOrAfter } from './step-model';

export const isCareerProfileComplete = (
  profile: Pick<UserProfile, 'career_profile_latest'> | null | undefined
): boolean => {
  const latest = profile?.career_profile_latest;
  if (!latest || typeof latest !== 'object') return false;
  const summary = String((latest as any)?.summary || '').trim();
  const experiences = (latest as any)?.experiences;
  return Boolean(summary) && Array.isArray(experiences) && experiences.length >= 1;
};

export const isGuidedStepAtOrAfterStep3 = (step: GuidedFlowStep | null): boolean => {
  return isGuidedStepAtOrAfter(step, 'step3_mode_and_resume');
};

export const isGuidedStepAtOrAfterStep4 = (step: GuidedFlowStep | null): boolean =>
  isGuidedStepAtOrAfter(step, 'step4_report');

export const hasGuidedFlowResumeSelection = (
  resumeLike: { id?: string | number | null } | null | undefined
): boolean => {
  const id = (resumeLike as any)?.id;
  if (id === null || id === undefined) return false;
  return String(id).trim().length > 0;
};
