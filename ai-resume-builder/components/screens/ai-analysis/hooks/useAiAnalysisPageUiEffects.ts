import { useEffect, useRef } from 'react';
import type { AiAnalysisPageEffectsParams } from './useAiAnalysisPageEffects.types';

export const resolveInterviewLegacyEntryStep = (hasSelectedInterviewResume: boolean) =>
  hasSelectedInterviewResume ? 'interview_scene' : 'resume_select';

export const useAiAnalysisPageUiEffects = ({
  currentStep,
  setCurrentStep,
  setIsNavHidden,
  prevStepRef,
  setTargetCompany,
  setJdText,
  planLoaderMountedRef,
  currentUserId,
  userAvatarUrl,
  setUserAvatar,
  pathname,
  isInterviewMode,
  resumeId,
  forcedResumeSelectRef,
  setStepHistory,
  setSelectedResumeId,
  sourceResumeIdRef,
  setOptimizedResumeId,
  setAnalysisResumeId,
}: AiAnalysisPageEffectsParams) => {
  const navHiddenRef = useRef(false);
  const forceAppliedRef = useRef(false);
  useEffect(() => {
    if (!setIsNavHidden) return;
    const nextHidden = currentStep === 'chat';
    if (navHiddenRef.current === nextHidden) return;
    navHiddenRef.current = nextHidden;
    setIsNavHidden(nextHidden);
  }, [currentStep, setIsNavHidden]);

  useEffect(() => {
    if (!setIsNavHidden) return;
    return () => {
      navHiddenRef.current = false;
      setIsNavHidden(false);
    };
  }, [setIsNavHidden]);

  useEffect(() => {
    const hasSelectedInterviewResume = String(resumeId || '').trim().length > 0;
    // Keep interview scene fields stable when returning to JD input,
    // otherwise scene matching cannot detect "continue interview".
    if (!isInterviewMode && currentStep === 'jd_input' && prevStepRef.current !== 'jd_input') {
      setTargetCompany('');
      setJdText('');
    }
    if (isInterviewMode && currentStep === 'jd_input') {
      // Legacy interview sessions might still recover with `jd_input`.
      // Normalize once so interview flow is represented by `interview_scene` only.
      // When no resume is selected, force back to resume selection first.
      setCurrentStep(resolveInterviewLegacyEntryStep(hasSelectedInterviewResume));
    }
    if (isInterviewMode && currentStep === 'interview_scene' && !hasSelectedInterviewResume) {
      setCurrentStep('resume_select');
    }
    prevStepRef.current = currentStep;
  }, [currentStep, isInterviewMode, prevStepRef, resumeId, setCurrentStep, setJdText, setTargetCompany]);

  useEffect(() => {
    planLoaderMountedRef.current = true;
    return () => {
      planLoaderMountedRef.current = false;
    };
  }, [planLoaderMountedRef]);

  useEffect(() => {
    const uid = String(currentUserId || '').trim();
    const remoteAvatar = String(userAvatarUrl || '').trim();
    if (remoteAvatar) {
      setUserAvatar(remoteAvatar);
      if (uid) localStorage.setItem(`user_avatar:${uid}`, remoteAvatar);
      localStorage.setItem('user_avatar', remoteAvatar);
      return;
    }
    const saved = uid
      ? localStorage.getItem(`user_avatar:${uid}`)
      : localStorage.getItem('user_avatar');
    if (saved) setUserAvatar(saved);
  }, [currentUserId, userAvatarUrl, setUserAvatar]);

  useEffect(() => {
    const path = (pathname || '').toLowerCase();
    const forceKey = 'ai_interview_force_resume_select';
    if (!isInterviewMode) return;
    if (path !== '/ai-interview') return;
    if (localStorage.getItem(forceKey) !== '1') return;
    if (forceAppliedRef.current) return;
    // Keep force flag until user leaves the forced entry step so recovery
    // effects cannot auto-restore to sub-pages during the same entry cycle.

    forceAppliedRef.current = true;
    forcedResumeSelectRef.current = true;
    setStepHistory([]);
    setSelectedResumeId(null);
    sourceResumeIdRef.current = null;
    setOptimizedResumeId(null);
    setAnalysisResumeId(null);
    setCurrentStep('resume_select');
  }, [
    forcedResumeSelectRef,
    isInterviewMode,
    pathname,
    setAnalysisResumeId,
    setCurrentStep,
    setOptimizedResumeId,
    setSelectedResumeId,
    setStepHistory,
    sourceResumeIdRef,
  ]);

  useEffect(() => {
    const forcedEntryStep = 'resume_select';
    if (!isInterviewMode) return;
    if (currentStep !== forcedEntryStep) {
      forcedResumeSelectRef.current = false;
      forceAppliedRef.current = false;
      const forceKey = 'ai_interview_force_resume_select';
      try {
        localStorage.removeItem(forceKey);
      } catch {
        // ignore storage failures
      }
    }
  }, [currentStep, forcedResumeSelectRef, isInterviewMode]);
};
