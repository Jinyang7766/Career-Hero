import { DatabaseService } from '../../../../src/database-service';
import type { ResumeData } from '../../../../types';
import type { ChatMessage } from '../types';
import { makeInterviewSessionKey, makeJdKey, normalizeInterviewType } from '../id-utils';
import { getActiveInterviewMode, getActiveInterviewType } from '../interview-plan-utils';

type AnalysisSessionState =
  | 'idle'
  | 'jd_ready'
  | 'analyzing'
  | 'report_ready'
  | 'interview_in_progress'
  | 'paused'
  | 'interview_done'
  | 'error';

type Params = {
  currentUserId?: string;
  resumeData: ResumeData;
  setResumeData?: (v: ResumeData) => void;
  jdText: string;
  setJdText: (v: string) => void;
  targetCompany: string;
  setTargetCompany: (v: string) => void;
  setChatMessages: (v: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  setChatInitialized: (v: boolean) => void;
};

export const useInterviewSessionStore = ({
  currentUserId,
  resumeData,
  setResumeData,
  jdText,
  setJdText,
  targetCompany,
  setTargetCompany,
  setChatMessages,
  setChatInitialized,
}: Params) => {
  const LAST_ANALYSIS_KEY = 'ai_last_analysis_snapshot';
  const getScopedLastAnalysisKey = () => {
    const uid = String(currentUserId || '').trim();
    if (!uid) return LAST_ANALYSIS_KEY;
    return `${LAST_ANALYSIS_KEY}:${uid}`;
  };
  const getCurrentInterviewType = () => normalizeInterviewType(getActiveInterviewType());
  const getCurrentInterviewMode = () => {
    const mode = String(getActiveInterviewMode() || '').trim().toLowerCase();
    return mode === 'simple' ? 'simple' : 'comprehensive';
  };

  const isSessionModeMatched = (session: any, desiredMode: string) => {
    const current = String(desiredMode || '').trim().toLowerCase();
    const sessionMode = String(session?.interviewMode || '').trim().toLowerCase();
    if (!current) return true;
    // Legacy session without mode marker: do not auto-continue to avoid simple/comprehensive cross-hit.
    if (!sessionMode) return false;
    return sessionMode === current;
  };

  const resolveInterviewSession = (
    sessions: any,
    sessionJdText: string,
    overrideInterviewType?: string,
    overrideInterviewMode?: string
  ) => {
    const interviewType = normalizeInterviewType(overrideInterviewType || getCurrentInterviewType());
    const interviewMode = String(overrideInterviewMode || getCurrentInterviewMode() || 'comprehensive').trim().toLowerCase();
    const typedKey = makeInterviewSessionKey(sessionJdText, interviewType);
    const legacyJdKey = makeJdKey(sessionJdText);
    const typedSession = sessions?.[typedKey];
    const legacySession = sessions?.[legacyJdKey];
    const typedMatched = isSessionModeMatched(typedSession, interviewMode) ? typedSession : null;
    const legacyMatched = isSessionModeMatched(legacySession, interviewMode) ? legacySession : null;
    return {
      interviewType,
      interviewMode,
      typedKey,
      legacyJdKey,
      session: typedMatched || legacyMatched || null,
    };
  };

  const saveLastAnalysis = (payload: {
    resumeId: string | number;
    jdText: string;
    targetCompany?: string;
    snapshot: any;
    updatedAt: string;
    analysisReportId?: string;
    optimizedResumeId?: string | number;
  }) => {
    try {
      localStorage.setItem(getScopedLastAnalysisKey(), JSON.stringify(payload));
    } catch (error) {
      console.warn('Failed to save last analysis snapshot:', error);
    }
  };

  const loadLastAnalysis = () => {
    try {
      const raw = localStorage.getItem(getScopedLastAnalysisKey()) || localStorage.getItem(LAST_ANALYSIS_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (error) {
      console.warn('Failed to parse last analysis snapshot:', error);
      return null;
    }
  };

  const clearLastAnalysis = () => {
    localStorage.removeItem(getScopedLastAnalysisKey());
    localStorage.removeItem(LAST_ANALYSIS_KEY);
  };

  const getAnalysisSession = (overrideJdText?: string) => {
    const sessionJdText = (overrideJdText ?? jdText ?? resumeData?.lastJdText ?? '').trim();
    if (!sessionJdText || !resumeData) return null;
    const jdKey = makeJdKey(sessionJdText);
    const byJd = (resumeData as any).analysisSessionByJd || {};
    return byJd[jdKey] || null;
  };

  const persistAnalysisSessionState = async (
    state: AnalysisSessionState,
    patch?: Partial<{
      jdText: string;
      targetCompany: string;
      score: number;
      step: string;
      error: string;
      lastMessageAt: string;
      force: boolean;
    }>
  ) => {
    if (!resumeData?.id) return;
    if (resumeData.optimizationStatus !== 'optimized') return;
    const sessionJdText = (patch?.jdText ?? jdText ?? resumeData.lastJdText ?? '').trim();
    if (!sessionJdText) return;

    const jdKey = makeJdKey(sessionJdText);
    const byJd = (resumeData as any).analysisSessionByJd || {};
    const prev = byJd[jdKey] || {};
    const now = new Date().toISOString();
    const force = !!patch?.force;

    if (!force && prev.state === state) {
      // Avoid noisy writes on every render/send while preserving real transitions.
      const prevAt = Date.parse(String(prev.updatedAt || ''));
      const ageMs = Number.isFinite(prevAt) ? (Date.now() - prevAt) : Number.MAX_SAFE_INTEGER;
      if (ageMs < 12000 && !patch?.error && !patch?.lastMessageAt) {
        return;
      }
    }

    const nextSession = {
      ...prev,
      state,
      jdKey,
      jdText: sessionJdText,
      targetCompany: patch?.targetCompany ?? targetCompany ?? resumeData.targetCompany ?? '',
      score: (typeof patch?.score === 'number' ? patch.score : prev.score),
      step: patch?.step ?? prev.step,
      error: patch?.error ?? '',
      lastMessageAt: patch?.lastMessageAt ?? prev.lastMessageAt,
      updatedAt: now,
    };

    const updatedResumeData = {
      ...resumeData,
      analysisSessionByJd: {
        ...byJd,
        [jdKey]: nextSession,
      },
      lastJdText: sessionJdText || resumeData.lastJdText || '',
      targetCompany: targetCompany || resumeData.targetCompany || '',
    };

    if (setResumeData) {
      setResumeData(updatedResumeData);
    }

    const step = String(patch?.step || nextSession.step || '').trim().toLowerCase();
    const isInterviewFlowStep = step === 'chat' || step === 'comparison';
    const isInterviewFlowState = state === 'interview_in_progress' || state === 'interview_done';
    const touchUpdatedAt = !(isInterviewFlowStep || isInterviewFlowState);
    await DatabaseService.updateResume(
      String(resumeData.id),
      { resume_data: updatedResumeData },
      { touchUpdatedAt }
    );
  };

  const restoreInterviewSession = (overrideJdText?: string, overrideInterviewType?: string, overrideInterviewMode?: string) => {
    if (!resumeData) return;
    const sessionJdText = (overrideJdText ?? jdText ?? resumeData.lastJdText ?? '').trim();
    if (!jdText && sessionJdText) {
      setJdText(sessionJdText);
    }
    if (!targetCompany && resumeData.targetCompany) {
      setTargetCompany(resumeData.targetCompany);
    }

    if (!sessionJdText) {
      setChatMessages([]);
      setChatInitialized(false);
      return;
    }

    const sessions = resumeData.interviewSessions || {};
    const { session } = resolveInterviewSession(sessions, sessionJdText, overrideInterviewType, overrideInterviewMode);

    if (session && session.messages?.length) {
      setChatMessages(session.messages as ChatMessage[]);
      setChatInitialized(true);
    } else {
      setChatMessages([]);
      setChatInitialized(false);
    }
  };

  const persistInterviewSession = async (
    messages: ChatMessage[],
    overrideJdText?: string,
    overrideInterviewType?: string
  ) => {
    if (!resumeData?.id) return;
    if (resumeData.optimizationStatus !== 'optimized') return;
    const sessionJdText = (overrideJdText ?? jdText ?? resumeData.lastJdText ?? '').trim();
    const interviewType = normalizeInterviewType(overrideInterviewType || getCurrentInterviewType());
    const interviewMode = String(overrideInterviewMode || getCurrentInterviewMode() || 'comprehensive').trim().toLowerCase();
    const sessionKey = makeInterviewSessionKey(sessionJdText, interviewType);
    const currentSessions = resumeData.interviewSessions || {};
    const updatedSessions = {
      ...currentSessions,
      [sessionKey]: {
        jdText: sessionJdText,
        interviewType,
        interviewMode,
        messages: messages.map((m) => ({ id: m.id, role: m.role, text: m.text })),
        updatedAt: new Date().toISOString(),
      },
    };

    const updatedResumeData = {
      ...resumeData,
      interviewSessions: updatedSessions,
      lastJdText: sessionJdText,
      targetCompany: targetCompany || resumeData.targetCompany || '',
    };

    if (setResumeData) {
      setResumeData(updatedResumeData);
    }

    await DatabaseService.updateResume(
      String(resumeData.id),
      { resume_data: updatedResumeData },
      { touchUpdatedAt: false }
    );
  };

  const hasInterviewSessionMessages = (overrideJdText?: string, overrideInterviewType?: string, overrideInterviewMode?: string) => {
    if (!resumeData) return false;
    const sessionJdText = (overrideJdText ?? jdText ?? resumeData.lastJdText ?? '').trim();
    if (!sessionJdText) return false;
    const sessions = resumeData.interviewSessions || {};
    const { session } = resolveInterviewSession(sessions, sessionJdText, overrideInterviewType, overrideInterviewMode);
    return !!(session && Array.isArray(session.messages) && session.messages.length > 0);
  };

  const clearInterviewSession = async (overrideJdText?: string, overrideInterviewType?: string, _overrideInterviewMode?: string) => {
    if (!resumeData?.id) return;
    const sessionJdText = (overrideJdText ?? jdText ?? resumeData.lastJdText ?? '').trim();
    const interviewType = normalizeInterviewType(overrideInterviewType || getCurrentInterviewType());
    const sessionKey = makeInterviewSessionKey(sessionJdText, interviewType);
    const legacyJdKey = makeJdKey(sessionJdText);

    const currentSessions = resumeData.interviewSessions || {};
    const updatedSessions = { ...currentSessions };
    delete updatedSessions[sessionKey];
    delete updatedSessions[legacyJdKey];

    const updatedResumeData = {
      ...resumeData,
      interviewSessions: updatedSessions,
    };

    if (setResumeData) {
      setResumeData(updatedResumeData);
    }

    setChatMessages([]);
    setChatInitialized(false);

    await DatabaseService.updateResume(
      String(resumeData.id),
      { resume_data: updatedResumeData },
      { touchUpdatedAt: false }
    );
  };

  return {
    saveLastAnalysis,
    loadLastAnalysis,
    clearLastAnalysis,
    makeJdKey,
    getAnalysisSession,
    persistAnalysisSessionState,
    restoreInterviewSession,
    persistInterviewSession,
    hasInterviewSessionMessages,
    clearInterviewSession,
  };
};
