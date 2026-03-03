import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { ResumeData } from '../../../../types';
import type { AnalysisReport, ChatMessage, Suggestion } from '../types';
import { deriveInitialStepFromPath } from './useAiRouteSync';
import type { AiAnalysisStep } from '../step-types';
import { pushRuntimeTrace } from '../../../../src/runtime-diagnostics';

const DEFAULT_AVATAR = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='12' fill='%23f1f5f9'/%3E%3Cg transform='translate(4.8, 4.8) scale(0.6)' fill='%2394a3b8'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'%3E%3C/path%3E%3C/g%3E%3C/svg%3E`;

export const useAiAnalysisPageState = () => {
  const [currentStep, setCurrentStepRaw] = useState<AiAnalysisStep>(() => deriveInitialStepFromPath());
  const stepSwitchGuardRef = useRef<{ windowStart: number; count: number }>({ windowStart: Date.now(), count: 0 });
  const setCurrentStep = useState<Dispatch<SetStateAction<AiAnalysisStep>>>(() => (
    (next) => {
      setCurrentStepRaw((prev) => {
        const resolved = typeof next === 'function'
          ? (next as (p: AiAnalysisStep) => AiAnalysisStep)(prev)
          : next;
        if (resolved === prev) return prev;
        const now = Date.now();
        const guard = stepSwitchGuardRef.current;
        if (now - guard.windowStart > 1200) {
          guard.windowStart = now;
          guard.count = 0;
        }
        guard.count += 1;
        pushRuntimeTrace('ai_analysis', 'step_transition', {
          prev,
          next: resolved,
          windowCount: guard.count,
        });
        // Safety net for accidental step oscillation loops (prevents React #185).
        if (guard.count > 40) {
          console.warn('[AI_ANALYSIS] blocked excessive step switching loop', { prev, next: resolved });
          pushRuntimeTrace('ai_analysis', 'step_transition_blocked', {
            prev,
            next: resolved,
            windowCount: guard.count,
          });
          return prev;
        }
        return resolved;
      });
    }
  ))[0];
  const [selectedResumeIdRaw, setSelectedResumeIdRaw] = useState<string | number | null>(null);
  const selectedResumeId = selectedResumeIdRaw;
  const setSelectedResumeId = useState<(v: string | number | null) => void>(() => (
    (v) => {
      const normalized = v === null || v === undefined || String(v).trim() === '' ? null : String(v);
      setSelectedResumeIdRaw((prev) => {
        const prevNorm = prev === null || prev === undefined || String(prev).trim() === '' ? null : String(prev);
        if (prevNorm === normalized) return prev;
        return normalized;
      });
    }
  ))[0];
  const [searchQuery, setSearchQuery] = useState('');
  const sourceResumeIdRef = useRef<string | number | null>(null);
  const forcedResumeSelectRef = useRef(false);
  const prevStepRef = useRef<AiAnalysisStep | null>(null);

  const [originalResumeData, setOriginalResumeData] = useState<ResumeData | null>(null);
  const [jdText, setJdText] = useState('');
  const [targetCompany, setTargetCompany] = useState('');

  const [originalScore, setOriginalScore] = useState(0);
  const [score, setScore] = useState(0);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [postInterviewSummary, setPostInterviewSummary] = useState('');

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const chatMessagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => {
    chatMessagesRef.current = chatMessages;
  }, [chatMessages]);
  const [inputMessage, setInputMessage] = useState('');
  const [interviewPlan, setInterviewPlan] = useState<string[]>([]);
  const [planFetchTrigger, setPlanFetchTrigger] = useState(0);
  const planLoaderMountedRef = useRef(true);
  const planAutoHealRef = useRef<string>('');

  const [isInterviewEntry, setIsInterviewEntry] = useState(false);
  const [forceReportEntry, setForceReportEntry] = useState(false);
  const [expandedReferences, setExpandedReferences] = useState<Record<string, boolean>>({});
  const [chatInitialized, setChatInitialized] = useState(false);
  const recoveredSessionKeyRef = useRef<string>('');
  const chatIntroScheduledRef = useRef(false);
  const interviewEntryConfirmPendingRef = useRef(false);

  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const [userAvatar, setUserAvatar] = useState(DEFAULT_AVATAR);

  const [isFromCache, setIsFromCache] = useState(false);
  const [optimizedResumeId, setOptimizedResumeId] = useState<string | number | null>(null);
  const [isOptimizedOpen, setIsOptimizedOpen] = useState(true);
  const [isUnoptimizedOpen, setIsUnoptimizedOpen] = useState(true);

  return {
    currentStep,
    setCurrentStep,
    selectedResumeId,
    setSelectedResumeId,
    searchQuery,
    setSearchQuery,
    sourceResumeIdRef,
    forcedResumeSelectRef,
    prevStepRef,
    originalResumeData,
    setOriginalResumeData,
    jdText,
    setJdText,
    targetCompany,
    setTargetCompany,
    originalScore,
    setOriginalScore,
    score,
    setScore,
    suggestions,
    setSuggestions,
    report,
    setReport,
    postInterviewSummary,
    setPostInterviewSummary,
    chatMessages,
    setChatMessages,
    chatMessagesRef,
    inputMessage,
    setInputMessage,
    interviewPlan,
    setInterviewPlan,
    planFetchTrigger,
    setPlanFetchTrigger,
    planLoaderMountedRef,
    planAutoHealRef,
    isInterviewEntry,
    setIsInterviewEntry,
    forceReportEntry,
    setForceReportEntry,
    expandedReferences,
    setExpandedReferences,
    chatInitialized,
    setChatInitialized,
    recoveredSessionKeyRef,
    chatIntroScheduledRef,
    interviewEntryConfirmPendingRef,
    playingAudioId,
    setPlayingAudioId,
    audioPlayerRef,
    userAvatar,
    setUserAvatar,
    isFromCache,
    setIsFromCache,
    optimizedResumeId,
    setOptimizedResumeId,
    isOptimizedOpen,
    setIsOptimizedOpen,
    isUnoptimizedOpen,
    setIsUnoptimizedOpen,
  };
};
