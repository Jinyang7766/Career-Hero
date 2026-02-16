import { useEffect, useRef } from 'react';
import { supabase } from '../../../../src/supabase-client';

type Params = {
  loadLastAnalysis: () => any;
  setStepHistory: (v: any[]) => void;
  setCurrentStep: (v: any) => void;
  setChatEntrySource: (v: 'internal' | 'preview' | null) => void;
  setLastChatStep: (v: any) => void;
};

export const useAnalysisRuntime = ({
  loadLastAnalysis,
  setStepHistory,
  setCurrentStep,
  setChatEntrySource,
  setLastChatStep,
}: Params) => {
  const ANALYSIS_COMPLETED_KEY = 'ai_analysis_completed_once';
  const ANALYSIS_USER_KEY = 'ai_analysis_user_id';
  const INPROGRESS_AT_KEY = 'ai_analysis_in_progress_at';
  const INPROGRESS_SID_KEY = 'ai_analysis_in_progress_sid';
  const SESSION_SID_KEY = 'ai_analysis_session_sid';
  const LAST_ANALYSIS_KEY = 'ai_last_analysis_snapshot';

  const analysisUserIdRef = useRef<string | null>(null);
  const sessionSidRef = useRef<string | null>(null);
  const analysisRunIdRef = useRef<string | null>(null);
  const analysisAbortRef = useRef<AbortController | null>(null);

  const setAnalysisResumeId = (id: string | number | null) => {
    if (id === null || id === undefined) {
      localStorage.removeItem('ai_analysis_resume_id');
      return;
    }
    localStorage.setItem('ai_analysis_resume_id', String(id));
  };

  const setAnalysisInProgress = (value: boolean) => {
    if (value) {
      localStorage.setItem('ai_analysis_in_progress', '1');
      localStorage.setItem(INPROGRESS_AT_KEY, String(Date.now()));
      if (sessionSidRef.current) {
        localStorage.setItem(INPROGRESS_SID_KEY, sessionSidRef.current);
      }
    } else {
      localStorage.removeItem('ai_analysis_in_progress');
      localStorage.removeItem(INPROGRESS_AT_KEY);
      localStorage.removeItem(INPROGRESS_SID_KEY);
    }
  };

  useEffect(() => {
    try {
      const existing = sessionStorage.getItem(SESSION_SID_KEY);
      const sid = existing || `${Date.now()}_${Math.random().toString(16).slice(2)}`;
      sessionStorage.setItem(SESSION_SID_KEY, sid);
      sessionSidRef.current = sid;
    } catch {
      sessionSidRef.current = null;
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const uid = user?.id || null;
        analysisUserIdRef.current = uid;

        const storedUid = localStorage.getItem(ANALYSIS_USER_KEY);
        if (uid && storedUid && storedUid !== uid) {
          [
            'ai_analysis_step',
            'ai_analysis_in_progress',
            INPROGRESS_AT_KEY,
            'ai_analysis_resume_id',
            LAST_ANALYSIS_KEY,
            ANALYSIS_COMPLETED_KEY,
            'ai_analysis_entry_source',
            'ai_analysis_has_activity',
            'ai_chat_prev_step',
            'ai_chat_entry_source'
          ].forEach((k) => localStorage.removeItem(k));

          setStepHistory([]);
          setChatEntrySource(null);
          setLastChatStep(null);
          setCurrentStep('resume_select');
        }

        if (uid) {
          localStorage.setItem(ANALYSIS_USER_KEY, uid);
        }
      } catch (error) {
        console.warn('Failed to validate analysis storage against current user:', error);
      }
    })();
  }, []);

  const isAnalysisStillInProgress = () => {
    const flag = localStorage.getItem('ai_analysis_in_progress') === '1';
    if (!flag) return false;

    const storedSid = localStorage.getItem(INPROGRESS_SID_KEY);
    if (storedSid && sessionSidRef.current && storedSid !== sessionSidRef.current) {
      localStorage.removeItem('ai_analysis_in_progress');
      localStorage.removeItem(INPROGRESS_AT_KEY);
      localStorage.removeItem(INPROGRESS_SID_KEY);
      return false;
    }

    const atRaw = localStorage.getItem(INPROGRESS_AT_KEY);
    const at = atRaw ? Number(atRaw) : NaN;
    if (!Number.isFinite(at)) {
      localStorage.removeItem('ai_analysis_in_progress');
      localStorage.removeItem(INPROGRESS_AT_KEY);
      localStorage.removeItem(INPROGRESS_SID_KEY);
      return false;
    }
    const MAX_MS = 3 * 60 * 1000;
    if (Date.now() - at > MAX_MS) {
      localStorage.removeItem('ai_analysis_in_progress');
      localStorage.removeItem(INPROGRESS_AT_KEY);
      localStorage.removeItem(INPROGRESS_SID_KEY);
      return false;
    }
    return true;
  };

  useEffect(() => {
    const entrySource = localStorage.getItem('ai_analysis_entry_source');
    if (entrySource !== 'bottom_nav') return;

    const hasCompletedAnalysis = localStorage.getItem(ANALYSIS_COMPLETED_KEY) === '1';
    const hasSnapshot = !!loadLastAnalysis();
    if (hasCompletedAnalysis || hasSnapshot) return;

    setStepHistory([]);
    setCurrentStep('resume_select');
    setChatEntrySource(null);
    setLastChatStep(null);
    localStorage.setItem('ai_analysis_step', 'resume_select');
    localStorage.removeItem('ai_analysis_in_progress');
    localStorage.removeItem('ai_chat_prev_step');
    localStorage.removeItem('ai_chat_entry_source');
  }, []);

  const markAnalysisCompleted = () => localStorage.setItem(ANALYSIS_COMPLETED_KEY, '1');

  return {
    analysisRunIdRef,
    analysisAbortRef,
    inprogressAtKey: INPROGRESS_AT_KEY,
    setAnalysisResumeId,
    setAnalysisInProgress,
    isAnalysisStillInProgress,
    markAnalysisCompleted,
  };
};

