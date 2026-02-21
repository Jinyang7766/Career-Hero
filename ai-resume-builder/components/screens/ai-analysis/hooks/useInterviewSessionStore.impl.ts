import { useEffect, useRef } from 'react';
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
import { getActiveInterviewFocus, getActiveInterviewMode, getActiveInterviewType } from '../interview-plan-utils';
import {
  buildAnalysisSessionStorageKey,
  buildInterviewSessionStorageKey,
  isSessionChatModeMatched,
  isSessionModeMatched,
  isSessionSceneMatched,
  normalizeSceneText,
  pickFirstNonEmptyText,
} from '../interview-session-key-utils';

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
  const resumeDataRef = useRef<ResumeData>(resumeData);
  useEffect(() => {
    resumeDataRef.current = resumeData;
  }, [resumeData]);
  const getLatestResumeData = () => resumeDataRef.current;
  const LAST_ANALYSIS_KEY = 'ai_last_analysis_snapshot';
  const getScopedLastAnalysisKey = () => {
    const uid = String(currentUserId || '').trim();
    if (!uid) return LAST_ANALYSIS_KEY;
    return `${LAST_ANALYSIS_KEY}:${uid}`;
  };
  const getCurrentInterviewType = () => normalizeInterviewType(getActiveInterviewType());
  const getCurrentInterviewMode = () => normalizeInterviewMode(getActiveInterviewMode());
  const getCurrentChatMode = () => (isInterviewMode ? 'interview' : 'micro') as 'interview' | 'micro';
  const getCurrentInterviewFocus = () => normalizeSceneText(getActiveInterviewFocus());

  const resolveInterviewSession = (
    sessions: any,
    sessionJdText: string,
    overrideInterviewType?: string,
    overrideInterviewMode?: string
  ) => {
    const interviewType = normalizeInterviewType(overrideInterviewType || getCurrentInterviewType());
    const interviewMode = normalizeInterviewMode(overrideInterviewMode || getCurrentInterviewMode() || 'comprehensive');
    const chatMode = isInterviewMode ? 'interview' : 'micro';
    const expectedTargetCompany = normalizeSceneText(targetCompany || resumeData?.targetCompany || '');
    const expectedInterviewFocus = getCurrentInterviewFocus();
    const expectedResumeId = String((getLatestResumeData() as any)?.id || '').trim();
    const typedModeKey = buildInterviewSessionStorageKey({
      jdText: sessionJdText,
      interviewType,
      interviewMode,
      targetCompany: expectedTargetCompany,
      interviewFocus: expectedInterviewFocus,
      resumeId: expectedResumeId,
      chatMode,
    });
    const typedKey = makeInterviewSessionKey(sessionJdText, interviewType);
    const legacyJdKey = makeJdKey(sessionJdText);
    const typedModeSession = sessions?.[typedModeKey];
    const typedSession = sessions?.[typedKey];
    const legacySession = sessions?.[legacyJdKey];
    const expectedChatMode = chatMode;
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
      return chatMode === expectedChatMode;
    });
    const latestFallback = modeMatchedFallback.reduce((acc: any, curr: any) => {
      const accAt = Date.parse(String(acc?.updatedAt || ''));
      const currAt = Date.parse(String(curr?.updatedAt || ''));
      if (!Number.isFinite(accAt)) return curr;
      if (!Number.isFinite(currAt)) return acc;
      return currAt > accAt ? curr : acc;
    }, null);
    const typedModeMatched = typedModeSession
      ? (
        isSessionModeMatched(typedModeSession, interviewMode) &&
        isSessionChatModeMatched(typedModeSession, expectedChatMode) &&
        (!isInterviewMode || isSessionSceneMatched({
          session: typedModeSession,
          expectedChatMode,
          expectedTargetCompany,
          expectedInterviewFocus,
          expectedResumeId,
        }))
          ? typedModeSession
          : null
      )
      : null;
    const typedMatched =
      isSessionModeMatched(typedSession, interviewMode) &&
      isSessionChatModeMatched(typedSession, expectedChatMode) &&
      (!isInterviewMode || isSessionSceneMatched({
        session: typedSession,
        expectedChatMode,
        expectedTargetCompany,
        expectedInterviewFocus,
        expectedResumeId,
      }))
        ? typedSession
        : null;
    const legacyMatched =
      isSessionModeMatched(legacySession, interviewMode) &&
      isSessionChatModeMatched(legacySession, expectedChatMode) &&
      (!isInterviewMode || isSessionSceneMatched({
        session: legacySession,
        expectedChatMode,
        expectedTargetCompany,
        expectedInterviewFocus,
        expectedResumeId,
      }))
        ? legacySession
        : null;
    const strictModeMatchedFallback = isInterviewMode
      ? modeMatchedFallback.filter((session: any) => isSessionSceneMatched({
        session,
        expectedChatMode,
        expectedTargetCompany,
        expectedInterviewFocus,
        expectedResumeId,
      }))
      : modeMatchedFallback;
    const strictLatestFallback = (strictModeMatchedFallback.length ? strictModeMatchedFallback : []).reduce((acc: any, curr: any) => {
      const accAt = Date.parse(String(acc?.updatedAt || ''));
      const currAt = Date.parse(String(curr?.updatedAt || ''));
      if (!Number.isFinite(accAt)) return curr;
      if (!Number.isFinite(currAt)) return acc;
      return currAt > accAt ? curr : acc;
    }, null);
    return {
      interviewType,
      interviewMode,
      typedModeKey,
      typedKey,
      legacyJdKey,
      session: typedModeMatched || typedMatched || legacyMatched || strictLatestFallback || latestFallback || null,
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
    const currentResumeData = getLatestResumeData();
    const sessionJdText = pickFirstNonEmptyText(overrideJdText, jdText, currentResumeData?.lastJdText);
    if (!currentResumeData) return null;
    const interviewType = getCurrentInterviewType();
    const interviewMode = getCurrentInterviewMode();
    const chatMode = getCurrentChatMode();
    const jdKey = makeJdKey(sessionJdText || '__no_jd__');
    const byJd = (currentResumeData as any).analysisSessionByJd || {};
    const scopedModeKey = buildAnalysisSessionStorageKey({ jdKey, interviewType, interviewMode, chatMode });
    const typedModeKey = buildAnalysisSessionStorageKey({ jdKey, interviewType, chatMode });
    if (byJd[scopedModeKey]) return byJd[scopedModeKey];
    if (byJd[typedModeKey]) return byJd[typedModeKey];
    const legacyScoped = byJd[makeInterviewScopedKey(jdKey, interviewType, interviewMode)];
    if (legacyScoped && String(legacyScoped?.chatMode || '').trim().toLowerCase() === chatMode) return legacyScoped;
    const legacyTyped = byJd[makeInterviewScopedKey(jdKey, interviewType)];
    if (legacyTyped && String(legacyTyped?.chatMode || '').trim().toLowerCase() === chatMode) return legacyTyped;
    const legacyPlain = byJd[jdKey];
    if (legacyPlain && String(legacyPlain?.chatMode || '').trim().toLowerCase() === chatMode) return legacyPlain;
    if (sessionJdText) return null;
    const entries = Object.values(byJd || {}) as any[];
    if (!entries.length) return null;
    const filtered = entries.filter((item: any) => {
      const itemType = normalizeInterviewType(item?.interviewType || parseInterviewScopedKey(String(item?.sessionKey || '')).interviewType || '');
      const itemMode = normalizeInterviewMode(item?.interviewMode || parseInterviewScopedKey(String(item?.sessionKey || '')).interviewMode || '');
      const itemChatMode = String(item?.chatMode || '').trim().toLowerCase();
      return itemType === interviewType && itemMode === interviewMode && itemChatMode === chatMode;
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
      interviewSummary: string;
      force: boolean;
    }>
  ) => {
    const currentResumeData = getLatestResumeData();
    if (!currentResumeData?.id) return;
    const rawSessionJdText = pickFirstNonEmptyText(patch?.jdText, jdText, currentResumeData.lastJdText);
    const sessionJdText = rawSessionJdText;
    const jdKeyBase = sessionJdText || '__no_jd__';
    const jdKey = makeJdKey(jdKeyBase);
    const interviewType = getCurrentInterviewType();
    const interviewMode = getCurrentInterviewMode();
    const chatMode = getCurrentChatMode();
    const sessionKey = buildAnalysisSessionStorageKey({ jdKey, interviewType, interviewMode, chatMode });
    const byJd = (currentResumeData as any).analysisSessionByJd || {};
    const prev =
      byJd[sessionKey] ||
      byJd[buildAnalysisSessionStorageKey({ jdKey, interviewType, chatMode })] ||
      Object.values(byJd || {}).find((entry: any) => {
        if (!entry) return false;
        const entryChatMode = String(entry?.chatMode || '').trim().toLowerCase();
        if (entryChatMode !== chatMode) return false;
        const entryType = normalizeInterviewType(entry?.interviewType || parseInterviewScopedKey(String(entry?.sessionKey || '')).interviewType || '');
        const entryMode = normalizeInterviewMode(entry?.interviewMode || parseInterviewScopedKey(String(entry?.sessionKey || '')).interviewMode || '');
        const entryJdKey = String(entry?.jdKey || '').trim() || makeJdKey(String(entry?.jdText || '').trim() || '__no_jd__');
        return entryType === interviewType && entryMode === interviewMode && entryJdKey === jdKey;
      }) ||
      {};
    const now = new Date().toISOString();
    const force = !!patch?.force;

    if (!force && prev.state === state) {
      // Avoid noisy writes on every render/send while preserving real transitions.
      const prevAt = Date.parse(String(prev.updatedAt || ''));
      const ageMs = Number.isFinite(prevAt) ? (Date.now() - prevAt) : Number.MAX_SAFE_INTEGER;
      if (ageMs < 12000 && !patch?.error && !patch?.lastMessageAt && !patch?.interviewSummary) {
        return;
      }
    }

    const nextSession = {
      ...prev,
      resumeId: currentResumeData?.id,
      chatMode,
      state,
      jdKey,
      sessionKey,
      interviewType,
      interviewMode,
      interviewFocus: getCurrentInterviewFocus(),
      jdText: sessionJdText,
      targetCompany: patch?.targetCompany ?? targetCompany ?? resumeData.targetCompany ?? '',
      score: (typeof patch?.score === 'number' ? patch.score : prev.score),
      step: patch?.step ?? prev.step,
      error: patch?.error ?? '',
      lastMessageAt: patch?.lastMessageAt ?? prev.lastMessageAt,
      interviewSummary: patch?.interviewSummary ?? prev.interviewSummary ?? '',
      updatedAt: now,
    };

    const updatedResumeData = {
      ...currentResumeData,
      analysisSessionByJd: {
        ...byJd,
        [sessionKey]: nextSession,
      },
      lastJdText: sessionJdText || currentResumeData.lastJdText || '',
      targetCompany: targetCompany || currentResumeData.targetCompany || '',
    };

    resumeDataRef.current = updatedResumeData as ResumeData;
    if (setResumeData) {
      setResumeData(updatedResumeData);
    }

    await DatabaseService.updateResume(
      String(currentResumeData.id),
      { resume_data: updatedResumeData },
      { touchUpdatedAt: false }
    );
  };

  const restoreInterviewSession = (overrideJdText?: string, overrideInterviewType?: string, overrideInterviewMode?: string) => {
    const currentResumeData = getLatestResumeData();
    if (!currentResumeData) return;
    const sessionJdText = pickFirstNonEmptyText(overrideJdText, jdText, currentResumeData.lastJdText);
    if (!jdText && sessionJdText) {
      setJdText(sessionJdText);
    }
    if (!targetCompany && currentResumeData.targetCompany) {
      setTargetCompany(currentResumeData.targetCompany);
    }

    const sessions = currentResumeData.interviewSessions || {};
    if (!sessionJdText) {
      const expectedChatMode = isInterviewMode ? 'interview' : 'micro';
      const expectedInterviewType = normalizeInterviewType(overrideInterviewType || getCurrentInterviewType());
      const expectedInterviewMode = normalizeInterviewMode(overrideInterviewMode || getCurrentInterviewMode());
      const expectedTargetCompany = normalizeSceneText(targetCompany || currentResumeData?.targetCompany || '');
      const expectedInterviewFocus = getCurrentInterviewFocus();
      const expectedResumeId = String((currentResumeData as any)?.id || '').trim();
      const expectedJdKey = makeJdKey('__no_jd__');
      const fallbackCandidates = Object.values(sessions || {}) as any[];
      const modeMatched = fallbackCandidates.filter((session: any) => {
        const chatMode = String(session?.chatMode || '').trim().toLowerCase();
        if (chatMode !== expectedChatMode) return false;
        const sessionResumeId = String(session?.resumeId || '').trim();
        if (sessionResumeId && sessionResumeId !== expectedResumeId) return false;
        const sessionJdKey =
          String(session?.jdKey || '').trim() ||
          makeJdKey(String(session?.jdText || '').trim() || '__no_jd__');
        if (sessionJdKey !== expectedJdKey) return false;
        if (!isInterviewMode) return true;
        const sessionType = normalizeInterviewType(session?.interviewType || '');
        const sessionMode = normalizeInterviewMode(session?.interviewMode || '');
        if (sessionType !== expectedInterviewType) return false;
        if (sessionMode !== expectedInterviewMode) return false;
        return isSessionSceneMatched({
          session,
          expectedChatMode,
          expectedTargetCompany,
          expectedInterviewFocus,
          expectedResumeId,
        });
      });
      const candidatePool = modeMatched;
      const latestFallback = candidatePool.reduce((acc: any, curr: any) => {
        const accAt = Date.parse(String(acc?.updatedAt || ''));
        const currAt = Date.parse(String(curr?.updatedAt || ''));
        if (!Number.isFinite(accAt)) return curr;
        if (!Number.isFinite(currAt)) return acc;
        return currAt > accAt ? curr : acc;
      }, null);
      if (latestFallback && Array.isArray(latestFallback.messages) && latestFallback.messages.length) {
        setChatMessages(latestFallback.messages as ChatMessage[]);
        setChatInitialized(true);
      } else {
        setChatMessages([]);
        setChatInitialized(false);
      }
      return;
    }

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
    const currentResumeData = getLatestResumeData();
    if (!currentResumeData?.id) return;
    const sessionJdText = pickFirstNonEmptyText(overrideJdText, jdText, currentResumeData.lastJdText);
    const interviewType = normalizeInterviewType(overrideInterviewType || getCurrentInterviewType());
    const interviewMode = normalizeInterviewMode(overrideInterviewMode || getCurrentInterviewMode() || 'comprehensive');
    const sessionKey = buildInterviewSessionStorageKey({
      jdText: sessionJdText,
      interviewType,
      interviewMode,
      targetCompany: targetCompany || currentResumeData.targetCompany || '',
      interviewFocus: getCurrentInterviewFocus(),
      resumeId: currentResumeData?.id,
      chatMode: isInterviewMode ? 'interview' : 'micro',
    });
    const currentSessions = currentResumeData.interviewSessions || {};
    const updatedSessions = {
      ...currentSessions,
      [sessionKey]: {
        jdText: sessionJdText,
        jdKey: makeJdKey(sessionJdText || '__no_jd__'),
        resumeId: currentResumeData?.id,
        interviewType,
        interviewMode,
        interviewFocus: getCurrentInterviewFocus(),
        targetCompany: targetCompany || currentResumeData.targetCompany || '',
        chatMode: isInterviewMode ? 'interview' : 'micro',
        messages: messages.map((m) => ({ id: m.id, role: m.role, text: m.text })),
        updatedAt: new Date().toISOString(),
      },
    };

    const updatedResumeData = {
      ...currentResumeData,
      interviewSessions: updatedSessions,
      lastJdText: sessionJdText,
      targetCompany: targetCompany || currentResumeData.targetCompany || '',
    };

    resumeDataRef.current = updatedResumeData as ResumeData;
    if (setResumeData) {
      setResumeData(updatedResumeData);
    }

    await DatabaseService.updateResume(
      String(currentResumeData.id),
      { resume_data: updatedResumeData },
      { touchUpdatedAt: false }
    );
  };

  const hasInterviewSessionMessages = (overrideJdText?: string, overrideInterviewType?: string, overrideInterviewMode?: string) => {
    const currentResumeData = getLatestResumeData();
    if (!currentResumeData) return false;
    const sessionJdText = pickFirstNonEmptyText(overrideJdText, jdText, currentResumeData.lastJdText);
    if (!sessionJdText) return false;
    const sessions = currentResumeData.interviewSessions || {};
    const { session } = resolveInterviewSession(sessions, sessionJdText, overrideInterviewType, overrideInterviewMode);
    return !!(session && Array.isArray(session.messages) && session.messages.length > 0);
  };

  const clearInterviewSession = async (overrideJdText?: string, overrideInterviewType?: string, _overrideInterviewMode?: string) => {
    const currentResumeData = getLatestResumeData();
    if (!currentResumeData?.id) return;
    const sessionJdText = pickFirstNonEmptyText(overrideJdText, jdText, currentResumeData.lastJdText);
    const interviewType = normalizeInterviewType(overrideInterviewType || getCurrentInterviewType());
    const interviewMode = normalizeInterviewMode(_overrideInterviewMode || getCurrentInterviewMode());
    const sessionKey = buildInterviewSessionStorageKey({
      jdText: sessionJdText,
      interviewType,
      interviewMode,
      targetCompany: targetCompany || currentResumeData.targetCompany || '',
      interviewFocus: getCurrentInterviewFocus(),
      resumeId: currentResumeData?.id,
      chatMode: isInterviewMode ? 'interview' : 'micro',
    });
    const typedLegacyKey = makeInterviewSessionKey(sessionJdText, interviewType);
    const legacyJdKey = makeJdKey(sessionJdText || '__no_jd__');
    const currentResumeId = String(currentResumeData?.id || '').trim();

    const currentSessions = currentResumeData.interviewSessions || {};
    const updatedSessions = { ...currentSessions };
    delete updatedSessions[sessionKey];
    delete updatedSessions[typedLegacyKey];
    // Keep full JD legacy key cleanup for old data only.
    if (updatedSessions[legacyJdKey]) delete updatedSessions[legacyJdKey];
    if (!isInterviewMode) {
      // Micro interview restart should clear all micro chat sessions under current JD
      // regardless of legacy type/mode keys, otherwise intro may be suppressed by leftovers.
      Object.entries(updatedSessions).forEach(([key, session]: [string, any]) => {
        const chatMode = String(session?.chatMode || '').trim().toLowerCase();
        const sessionJdKey =
          String(session?.jdKey || '').trim() ||
          makeJdKey(String(session?.jdText || '').trim() || '__no_jd__');
        const sessionResumeId = String(session?.resumeId || '').trim();
        const resumeMatched = !sessionResumeId || sessionResumeId === currentResumeId;
        if (!resumeMatched) return;
        if (!sessionJdText && chatMode === 'micro') {
          // No-JD micro restart: clear all micro sessions for this resume to avoid fallback restore.
          delete updatedSessions[key];
          return;
        }
        if (chatMode === 'micro' && sessionJdKey === legacyJdKey) {
          delete updatedSessions[key];
        }
      });
    } else {
      // Interview restart should clear all history in current scene scope
      // (same resume + same JD + same type + same mode), regardless of scene hash.
      Object.entries(updatedSessions).forEach(([key, session]: [string, any]) => {
        const chatMode = String(session?.chatMode || '').trim().toLowerCase();
        if (chatMode !== 'interview') return;
        const sessionJdKey =
          String(session?.jdKey || '').trim() ||
          makeJdKey(String(session?.jdText || '').trim() || '__no_jd__');
        if (sessionJdKey !== legacyJdKey) return;
        const sessionType = normalizeInterviewType(session?.interviewType || parseInterviewScopedKey(String(key || '')).interviewType || '');
        const sessionMode = normalizeInterviewMode(session?.interviewMode || parseInterviewScopedKey(String(key || '')).interviewMode || '');
        if (sessionType !== interviewType) return;
        if (sessionMode !== interviewMode) return;
        const sessionResumeId = String(session?.resumeId || '').trim();
        const resumeMatched = !sessionResumeId || sessionResumeId === currentResumeId;
        if (!resumeMatched) return;
        delete updatedSessions[key];
      });
    }

    const updatedResumeData = {
      ...currentResumeData,
      interviewSessions: updatedSessions,
    };

    resumeDataRef.current = updatedResumeData as ResumeData;
    if (setResumeData) {
      setResumeData(updatedResumeData);
    }

    setChatMessages([]);
    setChatInitialized(false);

    await DatabaseService.updateResume(
      String(currentResumeData.id),
      { resume_data: updatedResumeData },
      { touchUpdatedAt: false }
    );
  };

  const clearInterviewSceneState = async (overrideJdText?: string, overrideInterviewType?: string, _overrideInterviewMode?: string) => {
    const currentResumeData = getLatestResumeData();
    if (!currentResumeData?.id) return;
    const sessionJdText = pickFirstNonEmptyText(overrideJdText, jdText, currentResumeData.lastJdText);
    const interviewType = normalizeInterviewType(overrideInterviewType || getCurrentInterviewType());
    const interviewMode = normalizeInterviewMode(_overrideInterviewMode || getCurrentInterviewMode());
    const jdKey = makeJdKey(sessionJdText || '__no_jd__');
    const byJd = { ...((currentResumeData as any).analysisSessionByJd || {}) };
    const expectedChatMode = getCurrentChatMode();
    Object.entries(byJd).forEach(([key, session]: [string, any]) => {
      if (!session) return;
      const entryChatMode = String(session?.chatMode || '').trim().toLowerCase();
      if (entryChatMode !== expectedChatMode) return;
      const parsed = parseInterviewScopedKey(String(key || ''));
      const entryType = normalizeInterviewType(session?.interviewType || parsed.interviewType || '');
      const entryMode = normalizeInterviewMode(session?.interviewMode || parsed.interviewMode || '');
      const entryJdKey = String(session?.jdKey || parsed.jdKey || '').trim() || makeJdKey(String(session?.jdText || '').trim() || '__no_jd__');
      if (entryJdKey !== jdKey) return;
      if (entryType !== interviewType) return;
      if (entryMode !== interviewMode) return;
      delete byJd[key];
    });

    const updatedResumeData = {
      ...currentResumeData,
      analysisSessionByJd: byJd,
    };
    resumeDataRef.current = updatedResumeData as ResumeData;
    if (setResumeData) {
      setResumeData(updatedResumeData);
    }
    await DatabaseService.updateResume(
      String(currentResumeData.id),
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
    clearInterviewSceneState,
  };
};
