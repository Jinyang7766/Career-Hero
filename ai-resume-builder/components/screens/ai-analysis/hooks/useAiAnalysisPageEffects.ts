import { useEffect } from 'react';
import type React from 'react';
import {
  getActiveInterviewFocus,
  getActiveInterviewMode,
  getActiveInterviewType,
  getWarmupQuestion,
} from '../interview-plan-utils';
import type { AiAnalysisStep } from '../step-types';

type Params = {
  currentStep: AiAnalysisStep;
  setCurrentStep: (step: AiAnalysisStep) => void;
  setIsNavHidden?: (hidden: boolean) => void;
  prevStepRef: React.MutableRefObject<AiAnalysisStep | null>;
  setTargetCompany: (v: string) => void;
  setInterviewPlan: React.Dispatch<React.SetStateAction<string[]>>;
  interviewPlanLength: number;
  isInterviewMode?: boolean;
  resumeId: string | number | null | undefined;
  jdText: string;
  resumeLastJdText?: string;
  makeJdKey: (jd: string) => string;
  planAutoHealRef: React.MutableRefObject<string>;
  setPlanFetchTrigger: React.Dispatch<React.SetStateAction<number>>;
  planLoaderMountedRef: React.MutableRefObject<boolean>;
  currentUserId?: string;
  userAvatarUrl?: string;
  setUserAvatar: (v: string) => void;
  pathname: string;
  forcedResumeSelectRef: React.MutableRefObject<boolean>;
  setStepHistory: React.Dispatch<React.SetStateAction<AiAnalysisStep[]>>;
  setSelectedResumeId: (v: string | number | null) => void;
  sourceResumeIdRef: React.MutableRefObject<string | number | null>;
  setOptimizedResumeId: (v: string | number | null) => void;
  setAnalysisResumeId: (v: string | number | null) => void;
};

export const useAiAnalysisPageEffects = ({
  currentStep,
  setCurrentStep,
  setIsNavHidden,
  prevStepRef,
  setTargetCompany,
  setInterviewPlan,
  interviewPlanLength,
  isInterviewMode,
  resumeId,
  jdText,
  resumeLastJdText,
  makeJdKey,
  planAutoHealRef,
  setPlanFetchTrigger,
  planLoaderMountedRef,
  currentUserId,
  userAvatarUrl,
  setUserAvatar,
  pathname,
  forcedResumeSelectRef,
  setStepHistory,
  setSelectedResumeId,
  sourceResumeIdRef,
  setOptimizedResumeId,
  setAnalysisResumeId,
}: Params) => {
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
    if (currentStep === 'chat' && interviewPlanLength === 0) {
      const interviewType = getActiveInterviewType();
      setInterviewPlan([getWarmupQuestion(interviewType)]);
    }
  }, [currentStep, interviewPlanLength, setInterviewPlan]);

  useEffect(() => {
    if (!isInterviewMode) return;
    if (currentStep !== 'chat') return;
    const mode = getActiveInterviewMode();
    const minExpected = mode === 'simple' ? 3 : 4;
    const maxAllowed = mode === 'simple' ? 3 : 12;
    const signature = `${String(resumeId || '')}|${makeJdKey(String(jdText || resumeLastJdText || '').trim() || '__no_jd__')}|${getActiveInterviewType()}|${mode}|${getActiveInterviewFocus()}`;

    if (mode === 'simple' && interviewPlanLength > maxAllowed) {
      setInterviewPlan((prev) => prev.slice(0, maxAllowed));
      return;
    }

    if (mode === 'comprehensive' && interviewPlanLength > 0 && interviewPlanLength < minExpected) {
      if (planAutoHealRef.current === signature) return;
      planAutoHealRef.current = signature;
      setInterviewPlan([]);
      setPlanFetchTrigger((v) => v + 1);
      return;
    }

    if (interviewPlanLength >= minExpected) {
      planAutoHealRef.current = '';
    }
  }, [
    currentStep,
    interviewPlanLength,
    isInterviewMode,
    jdText,
    makeJdKey,
    planAutoHealRef,
    resumeId,
    resumeLastJdText,
    setInterviewPlan,
    setPlanFetchTrigger,
  ]);

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
    if (path !== '/ai-analysis' && path !== '/ai-interview') return;
    if (localStorage.getItem('ai_analysis_force_resume_select') !== '1') return;

    localStorage.removeItem('ai_analysis_force_resume_select');
    forcedResumeSelectRef.current = true;
    setStepHistory([]);
    setSelectedResumeId(null);
    sourceResumeIdRef.current = null;
    setOptimizedResumeId(null);
    setAnalysisResumeId(null);
    setCurrentStep('resume_select');
  }, [
    forcedResumeSelectRef,
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
