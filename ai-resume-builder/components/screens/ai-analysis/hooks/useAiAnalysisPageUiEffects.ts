import { useEffect } from 'react';
import type { AiAnalysisPageEffectsParams } from './useAiAnalysisPageEffects.types';

export const useAiAnalysisPageUiEffects = ({
  currentStep,
  setCurrentStep,
  setIsNavHidden,
  prevStepRef,
  setTargetCompany,
  planLoaderMountedRef,
  currentUserId,
  userAvatarUrl,
  setUserAvatar,
  pathname,
  isInterviewMode,
  forcedResumeSelectRef,
  setStepHistory,
  setSelectedResumeId,
  sourceResumeIdRef,
  setOptimizedResumeId,
  setAnalysisResumeId,
}: AiAnalysisPageEffectsParams) => {
  useEffect(() => {
    if (setIsNavHidden) {
      setIsNavHidden(currentStep === 'chat');
    }
    return () => {
      if (setIsNavHidden) setIsNavHidden(false);
    };
  }, [currentStep, setIsNavHidden]);

  useEffect(() => {
    if (currentStep === 'jd_input' && prevStepRef.current !== 'jd_input') {
      setTargetCompany('');
    }
    prevStepRef.current = currentStep;
  }, [currentStep, prevStepRef, setTargetCompany]);

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
    const forceKey = isInterviewMode ? 'ai_interview_force_resume_select' : 'ai_analysis_force_resume_select';
    const expectedPath = isInterviewMode ? '/ai-interview' : '/ai-analysis';
    if (path !== expectedPath) return;
    if (localStorage.getItem(forceKey) !== '1') return;

    localStorage.removeItem(forceKey);
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
    if (currentStep !== 'resume_select') {
      forcedResumeSelectRef.current = false;
    }
  }, [currentStep, forcedResumeSelectRef]);
};

