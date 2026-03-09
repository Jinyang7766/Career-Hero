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
import { normalizeAnalysisMode } from '../analysis-mode';
import {
  buildAnalysisSessionStorageKey,
  buildInterviewSessionStorageKey,
  isSessionSceneMatched,
  normalizeSceneText,
  pickFirstNonEmptyText,
} from '../interview-session-key-utils';
import { pickLatestByUpdatedAt } from '../interview-session-helpers';
import { resolveInterviewSessionWithContext } from '../interview-session-resolver';

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
  const getCurrentChatMode = () => (isInterviewMode ? 'interview' : 'analysis') as 'interview' | 'analysis';
  const getCurrentInterviewFocus = () => normalizeSceneText(getActiveInterviewFocus());
  const getCurrentAnalysisMode = () => normalizeAnalysisMode((getLatestResumeData() as any)?.analysisMode);
  const inferSessionAnalysisMode = (session: any) => {
    const explicit = String(session?.analysisMode || '').trim().toLowerCase();
    if (explicit === 'generic' || explicit === 'targeted') return explicit;
    return String(session?.jdText || '').trim() ? 'targeted' : 'generic';
  };
  const isSessionAnalysisModeMatched = (session: any, chatMode: 'interview' | 'analysis') => {
    if (chatMode !== 'analysis') return true;
    return inferSessionAnalysisMode(session) === getCurrentAnalysisMode();
  };

  const resolveInterviewSession = (
    sessions: any,
    sessionJdText: string,
    overrideInterviewType?: string,
    overrideInterviewMode?: string
  ) => resolveInterviewSessionWithContext({
    sessions,
    sessionJdText,
    overrideInterviewType,
    overrideInterviewMode,
    isInterviewMode,
    targetCompany,
    resumeData,
    getCurrentInterviewType,
    getCurrentInterviewMode,
    getCurrentInterviewFocus,
    getLatestResumeData,
  });

  const saveLastAnalysis = (payload: {
    resumeId: string | number;
    jdText: string;
    targetCompany?: string;
    targetRole?: string;
    analysisMode?: 'generic' | 'targeted';
    snapshot: any;
    updatedAt: string;
    analysisReportId?: string;
    optimizedResumeId?: string | number;
  }) => {
    try {
      const normalizedPayload = {
        ...payload,
        analysisMode: normalizeAnalysisMode(payload?.analysisMode),
        targetCompany: String(payload?.targetCompany || '').trim(),
        targetRole: String(payload?.targetRole || payload?.targetCompany || '').trim(),
      };
      localStorage.setItem(getScopedLastAnalysisKey(), JSON.stringify(normalizedPayload));
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
    const sessionJdText = isInterviewMode
      ? pickFirstNonEmptyText(overrideJdText, jdText, currentResumeData?.lastJdText)
      : pickFirstNonEmptyText(overrideJdText, jdText);
    if (!currentResumeData) return null;
    const interviewType = getCurrentInterviewType();
    const interviewMode = getCurrentInterviewMode();
    const chatMode = getCurrentChatMode();
    const jdKey = makeJdKey(sessionJdText || '__no_jd__');
    const byJd = (currentResumeData as any).analysisSessionByJd || {};
    const scopedModeKey = buildAnalysisSessionStorageKey({ jdKey, interviewType, interviewMode, chatMode });
    const typedModeKey = buildAnalysisSessionStorageKey({ jdKey, interviewType, chatMode });
    const scopedSession = byJd[scopedModeKey];
    if (scopedSession && isSessionAnalysisModeMatched(scopedSession, chatMode)) return scopedSession;
    const typedSession = byJd[typedModeKey];
    if (typedSession && isSessionAnalysisModeMatched(typedSession, chatMode)) return typedSession;
    const legacyScoped = byJd[makeInterviewScopedKey(jdKey, interviewType, interviewMode)];
    if (legacyScoped && String(legacyScoped?.chatMode || '').trim().toLowerCase() === chatMode && isSessionAnalysisModeMatched(legacyScoped, chatMode)) return legacyScoped;
    const legacyTyped = byJd[makeInterviewScopedKey(jdKey, interviewType)];
    if (legacyTyped && String(legacyTyped?.chatMode || '').trim().toLowerCase() === chatMode && isSessionAnalysisModeMatched(legacyTyped, chatMode)) return legacyTyped;
    const legacyPlain = byJd[jdKey];
    if (legacyPlain && String(legacyPlain?.chatMode || '').trim().toLowerCase() === chatMode && isSessionAnalysisModeMatched(legacyPlain, chatMode)) return legacyPlain;
    if (sessionJdText) return null;
    if (!isInterviewMode && chatMode === 'analysis') return null;
    const entries = Object.values(byJd || {}) as any[];
    if (!entries.length) return null;
    const filtered = entries.filter((item: any) => {
      const itemType = normalizeInterviewType(item?.interviewType || parseInterviewScopedKey(String(item?.sessionKey || '')).interviewType || '');
      const itemChatMode = String(item?.chatMode || '').trim().toLowerCase();
      return itemType === interviewType && itemChatMode === chatMode && isSessionAnalysisModeMatched(item, chatMode);
    });
    const source = filtered.length ? filtered : entries;
    return pickLatestByUpdatedAt(source as any[]) as any;
  };

  const persistAnalysisSessionState = async (
    state: AnalysisSessionState,
    patch?: Partial<{
      jdText: string;
      targetCompany: string;
      targetRole: string;
      score: number;
      step: string;
      error: string;
      lastMessageAt: string;
      interviewSummary: string;
      analysisMode: 'generic' | 'targeted';
      force: boolean;
    }>
  ) => {
    const currentResumeData = getLatestResumeData();
    if (!currentResumeData?.id) return;
    const interviewType = getCurrentInterviewType();
    const interviewMode = getCurrentInterviewMode();
    const chatMode = getCurrentChatMode();
    const rawSessionJdText = chatMode === 'analysis'
      ? String(patch?.jdText ?? jdText ?? '').trim()
      : pickFirstNonEmptyText(patch?.jdText, jdText, currentResumeData.lastJdText);
    const sessionJdText = rawSessionJdText;
    const jdKeyBase = sessionJdText || '__no_jd__';
    const jdKey = makeJdKey(jdKeyBase);
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
        const entryJdKey = String(entry?.jdKey || '').trim() || makeJdKey(String(entry?.jdText || '').trim() || '__no_jd__');
        return entryType === interviewType && entryJdKey === jdKey;
      }) ||
      {};
    const now = new Date().toISOString();
    const force = !!patch?.force;
    const persistedTargetCompany = String(
      patch?.targetCompany ?? targetCompany ?? resumeData.targetCompany ?? ''
    ).trim();
    const persistedTargetRole = isInterviewMode
      ? String(currentResumeData.targetRole || '').trim()
      : String(
          patch?.targetRole ??
          patch?.targetCompany ??
          targetCompany ??
          currentResumeData.targetRole ??
          resumeData.targetRole ??
          currentResumeData.targetCompany ??
          resumeData.targetCompany ??
          ''
        ).trim();
    const persistedAnalysisMode = normalizeAnalysisMode(
      patch?.analysisMode || (currentResumeData as any)?.analysisMode
    );

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
      interviewFocus: getCurrentInterviewFocus(),
      jdText: sessionJdText,
      targetCompany: persistedTargetCompany,
      targetRole: persistedTargetRole,
      analysisMode: persistedAnalysisMode,
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
      lastJdText: chatMode === 'analysis'
        ? sessionJdText
        : (sessionJdText || currentResumeData.lastJdText || ''),
      targetCompany: persistedTargetCompany || currentResumeData.targetCompany || '',
      targetRole: isInterviewMode
        ? (currentResumeData as any).targetRole || ''
        : (persistedTargetRole || (currentResumeData as any).targetRole || ''),
      interviewFocus: getCurrentInterviewFocus() || (currentResumeData as any).interviewFocus || '',
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
      const expectedChatMode = isInterviewMode ? 'interview' : 'analysis';
      const expectedInterviewType = normalizeInterviewType(overrideInterviewType || getCurrentInterviewType());
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
        if (sessionType !== expectedInterviewType) return false;
        return isSessionSceneMatched({
          session,
          expectedChatMode,
          expectedTargetCompany,
          expectedInterviewFocus,
          expectedResumeId,
        });
      });
      const candidatePool = modeMatched;
      const latestFallback = pickLatestByUpdatedAt(candidatePool as any[]) as any;
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
      chatMode: isInterviewMode ? 'interview' : 'analysis',
    });
    const currentSessions = currentResumeData.interviewSessions || {};
    const updatedSessions = {
      ...currentSessions,
      [sessionKey]: {
        jdText: sessionJdText,
        jdKey: makeJdKey(sessionJdText || '__no_jd__'),
        resumeId: currentResumeData?.id,
        interviewType,
        interviewFocus: getCurrentInterviewFocus(),
        targetCompany: targetCompany || currentResumeData.targetCompany || '',
        chatMode: isInterviewMode ? 'interview' : 'analysis',
        messages: messages.map((m) => ({ id: m.id, role: m.role, text: m.text })),
        updatedAt: new Date().toISOString(),
      },
    };

    const updatedResumeData = {
      ...currentResumeData,
      interviewSessions: updatedSessions,
      lastJdText: sessionJdText,
      targetCompany: targetCompany || currentResumeData.targetCompany || '',
      interviewFocus: getCurrentInterviewFocus() || (currentResumeData as any).interviewFocus || '',
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
      chatMode: isInterviewMode ? 'interview' : 'analysis',
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
      // Non-interview restart should clear all analysis chat sessions under current JD
      // regardless of legacy type/mode keys, otherwise intro may be suppressed by leftovers.
      Object.entries(updatedSessions).forEach(([key, session]: [string, any]) => {
        const chatMode = String(session?.chatMode || '').trim().toLowerCase();
        const sessionJdKey =
          String(session?.jdKey || '').trim() ||
          makeJdKey(String(session?.jdText || '').trim() || '__no_jd__');
        const sessionResumeId = String(session?.resumeId || '').trim();
        const resumeMatched = !sessionResumeId || sessionResumeId === currentResumeId;
        if (!resumeMatched) return;
        if (!sessionJdText && chatMode === 'analysis') {
          // No-JD restart: clear all analysis sessions for this resume to avoid fallback restore.
          delete updatedSessions[key];
          return;
        }
        if (chatMode === 'analysis' && sessionJdKey === legacyJdKey) {
          delete updatedSessions[key];
        }
      });
    } else {
      // Interview restart should clear all history in current scene scope
      // (same resume + same JD + same type + same mode), regardless of scene hash.
      Object.entries(updatedSessions).forEach(([key, session]: [string, any]) => {
        const chatMode = String(session?.chatMode || '').trim().toLowerCase();
        // Legacy session rows may not have chatMode. In interview mode, treat missing as interview-compatible.
        if (chatMode && chatMode !== 'interview') return;
        const sessionResumeId = String(session?.resumeId || '').trim();
        const resumeMatched = !sessionResumeId || sessionResumeId === currentResumeId;
        if (!resumeMatched) return;
        const sessionJdKey =
          String(session?.jdKey || '').trim() ||
          makeJdKey(String(session?.jdText || '').trim() || '__no_jd__');
        if (sessionJdKey !== legacyJdKey) return;
        const sessionType = normalizeInterviewType(session?.interviewType || parseInterviewScopedKey(String(key || '')).interviewType || '');
        if (sessionType !== interviewType) return;
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
    void _overrideInterviewMode;
    const jdKey = makeJdKey(sessionJdText || '__no_jd__');
    const byJd = { ...((currentResumeData as any).analysisSessionByJd || {}) };
    const expectedChatMode = getCurrentChatMode();
    Object.entries(byJd).forEach(([key, session]: [string, any]) => {
      if (!session) return;
      const entryChatMode = String(session?.chatMode || '').trim().toLowerCase();
      // Legacy analysisSession entries may not carry chatMode.
      // In interview mode, these legacy rows can still lock JD input and must be cleared.
      if (isInterviewMode) {
        if (entryChatMode && entryChatMode !== 'interview') return;
      } else {
        if (entryChatMode !== expectedChatMode) return;
      }
      const parsed = parseInterviewScopedKey(String(key || ''));
      const entryType = normalizeInterviewType(session?.interviewType || parsed.interviewType || '');
      const entryJdKey = String(session?.jdKey || parsed.jdKey || '').trim() || makeJdKey(String(session?.jdText || '').trim() || '__no_jd__');
      if (entryJdKey !== jdKey) return;
      if (entryType !== interviewType) return;
      const entryResumeId = String(session?.resumeId || '').trim();
      const currentResumeId = String((currentResumeData as any)?.id || '').trim();
      if (entryResumeId && currentResumeId && entryResumeId !== currentResumeId) return;
      delete byJd[key];
    });

    const updatedResumeData = {
      ...currentResumeData,
      analysisSessionByJd: byJd,
      interviewFocus: isInterviewMode ? '' : ((currentResumeData as any).interviewFocus || ''),
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
