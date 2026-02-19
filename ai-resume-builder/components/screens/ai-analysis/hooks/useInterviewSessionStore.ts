import { DatabaseService } from '../../../../src/database-service';
import type { ResumeData } from '../../../../types';
import type { ChatMessage } from '../types';
import {
  makeInterviewScopedKey,
  makeInterviewSessionKey,
  makeJdKey,
  normalizeInterviewMode,
  normalizeInterviewType,
  parseInterviewScopedKey
} from '../id-utils';
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
  isInterviewMode?: boolean;
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
  isInterviewMode = false,
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
  const getCurrentInterviewMode = () => normalizeInterviewMode(getActiveInterviewMode());

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
    const interviewMode = normalizeInterviewMode(overrideInterviewMode || getCurrentInterviewMode() || 'comprehensive');
    const typedModeKey = makeInterviewSessionKey(sessionJdText, interviewType, interviewMode);
    const typedKey = makeInterviewSessionKey(sessionJdText, interviewType);
    const legacyJdKey = makeJdKey(sessionJdText);
    const typedModeSession = sessions?.[typedModeKey];
    const typedSession = sessions?.[typedKey];
    const legacySession = sessions?.[legacyJdKey];
    const expectedChatMode = isInterviewMode ? 'interview' : 'micro';
    const fallbackCandidates = Object.entries(sessions || {})
      .map(([key, value]) => {
        const parsed = parseInterviewScopedKey(String(key || ''));
        const entryJdKey = String(parsed.jdKey || '').trim();
        const data = value as any;
        const dataJdKey =
          String(data?.jdKey || '').trim() ||
          makeJdKey(String(data?.jdText || '').trim());
        const matchByKey = entryJdKey && entryJdKey === legacyJdKey;
        const matchByData = dataJdKey && dataJdKey === legacyJdKey;
        const matchByLegacyKey = String(key || '').trim() === legacyJdKey;
        if (!(matchByKey || matchByData || matchByLegacyKey)) return null;
        return data;
      })
      .filter(Boolean) as any[];
    const modeMatchedFallback = fallbackCandidates.filter((session: any) => {
      const chatMode = String(session?.chatMode || '').trim().toLowerCase();
      return !chatMode || chatMode === expectedChatMode;
    });
    const latestFallback = (modeMatchedFallback.length ? modeMatchedFallback : fallbackCandidates).reduce((acc: any, curr: any) => {
      const accAt = Date.parse(String(acc?.updatedAt || ''));
      const currAt = Date.parse(String(curr?.updatedAt || ''));
      if (!Number.isFinite(accAt)) return curr;
      if (!Number.isFinite(currAt)) return acc;
      return currAt > accAt ? curr : acc;
    }, null);
    const typedModeMatched = typedModeSession
      ? (isSessionModeMatched(typedModeSession, interviewMode) ? typedModeSession : typedModeSession)
      : null;
    const typedMatched = isSessionModeMatched(typedSession, interviewMode) ? typedSession : null;
    const legacyMatched = isSessionModeMatched(legacySession, interviewMode) ? legacySession : null;
    return {
      interviewType,
      interviewMode,
      typedModeKey,
      typedKey,
      legacyJdKey,
      session: typedModeMatched || typedMatched || legacyMatched || latestFallback || null,
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
    if (!resumeData) return null;
    const interviewType = getCurrentInterviewType();
    const interviewMode = getCurrentInterviewMode();
    const jdKey = makeJdKey(sessionJdText || '__no_jd__');
    const byJd = (resumeData as any).analysisSessionByJd || {};
    const scopedKey = makeInterviewScopedKey(jdKey, interviewType, interviewMode);
    const typedKey = makeInterviewScopedKey(jdKey, interviewType);
    if (byJd[scopedKey]) return byJd[scopedKey];
    if (byJd[typedKey]) return byJd[typedKey];
    if (byJd[jdKey]) return byJd[jdKey];
    if (sessionJdText) return null;
    const entries = Object.values(byJd || {}) as any[];
    if (!entries.length) return null;
    const filtered = entries.filter((item: any) => {
      const itemType = normalizeInterviewType(item?.interviewType || parseInterviewScopedKey(String(item?.sessionKey || '')).interviewType || '');
      const itemMode = normalizeInterviewMode(item?.interviewMode || parseInterviewScopedKey(String(item?.sessionKey || '')).interviewMode || '');
      return itemType === interviewType && itemMode === interviewMode;
    });
    const source = filtered.length ? filtered : entries;
    return source.reduce((acc: any, curr: any) => {
      const accAt = Date.parse(String(acc?.updatedAt || ''));
      const currAt = Date.parse(String(curr?.updatedAt || ''));
      if (!Number.isFinite(accAt)) return curr;
      if (!Number.isFinite(currAt)) return acc;
      return currAt > accAt ? curr : acc;
    }, null);
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
    const rawSessionJdText = (patch?.jdText ?? jdText ?? resumeData.lastJdText ?? '').trim();
    const sessionJdText = rawSessionJdText;
    const jdKeyBase = sessionJdText || '__no_jd__';
    const jdKey = makeJdKey(jdKeyBase);
    const interviewType = getCurrentInterviewType();
    const interviewMode = getCurrentInterviewMode();
    const sessionKey = makeInterviewScopedKey(jdKey, interviewType, interviewMode);
    const byJd = (resumeData as any).analysisSessionByJd || {};
    const prev = byJd[sessionKey] || byJd[makeInterviewScopedKey(jdKey, interviewType)] || byJd[jdKey] || {};
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
      sessionKey,
      interviewType,
      interviewMode,
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
        [sessionKey]: nextSession,
      },
      lastJdText: sessionJdText || resumeData.lastJdText || '',
      targetCompany: targetCompany || resumeData.targetCompany || '',
    };

    if (setResumeData) {
      setResumeData(updatedResumeData);
    }

    const step = String(patch?.step || nextSession.step || '').trim().toLowerCase();
    const isInterviewFlowStep = step === 'chat' || step === 'interview_report' || step === 'comparison';
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
    overrideInterviewType?: string,
    overrideInterviewMode?: string
  ) => {
    if (!resumeData?.id) return;
    const sessionJdText = (overrideJdText ?? jdText ?? resumeData.lastJdText ?? '').trim();
    const interviewType = normalizeInterviewType(overrideInterviewType || getCurrentInterviewType());
    const interviewMode = normalizeInterviewMode(overrideInterviewMode || getCurrentInterviewMode() || 'comprehensive');
    const sessionKey = makeInterviewSessionKey(sessionJdText, interviewType, interviewMode);
    const currentSessions = resumeData.interviewSessions || {};
    const updatedSessions = {
      ...currentSessions,
      [sessionKey]: {
        jdText: sessionJdText,
        interviewType,
        interviewMode,
        chatMode: isInterviewMode ? 'interview' : 'micro',
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
    const interviewMode = normalizeInterviewMode(_overrideInterviewMode || getCurrentInterviewMode());
    const sessionKey = makeInterviewSessionKey(sessionJdText, interviewType, interviewMode);
    const typedLegacyKey = makeInterviewSessionKey(sessionJdText, interviewType);
    const legacyJdKey = makeJdKey(sessionJdText);

    const currentSessions = resumeData.interviewSessions || {};
    const updatedSessions = { ...currentSessions };
    delete updatedSessions[sessionKey];
    delete updatedSessions[typedLegacyKey];
    // Keep full JD legacy key cleanup for old data only.
    if (updatedSessions[legacyJdKey]) delete updatedSessions[legacyJdKey];

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
