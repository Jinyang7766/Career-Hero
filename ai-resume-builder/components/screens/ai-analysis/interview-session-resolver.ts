import {
  makeInterviewSessionKey,
  makeJdKey,
  normalizeInterviewMode,
  normalizeInterviewType,
  parseInterviewScopedKey,
} from './id-utils';
import {
  buildInterviewSessionStorageKey,
  isSessionChatModeMatched,
  isSessionModeMatched,
  isSessionSceneMatched,
  normalizeSceneText,
} from './interview-session-key-utils';
import { pickLatestByUpdatedAt } from './interview-session-helpers';

type Params = {
  sessions: any;
  sessionJdText: string;
  overrideInterviewType?: string;
  overrideInterviewMode?: string;
  isInterviewMode: boolean;
  targetCompany: string;
  resumeData: any;
  getCurrentInterviewType: () => string;
  getCurrentInterviewMode: () => string;
  getCurrentInterviewFocus: () => string;
  getLatestResumeData: () => any;
};

export const resolveInterviewSessionWithContext = ({
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
}: Params) => {
  const interviewType = normalizeInterviewType(overrideInterviewType || getCurrentInterviewType());
  const interviewMode = normalizeInterviewMode(overrideInterviewMode || getCurrentInterviewMode() || 'comprehensive');
  const chatMode = isInterviewMode ? 'interview' : 'analysis';
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
      return {
        session: data,
        parsed,
      };
    })
    .filter(Boolean) as Array<{ session: any; parsed: ReturnType<typeof parseInterviewScopedKey> }>;

  const modeMatchedFallback = fallbackCandidates
    .filter((entry) => {
      const session = entry.session;
      const parsed = entry.parsed;
      const sessionChatMode = String(session?.chatMode || '').trim().toLowerCase();
      if (sessionChatMode !== expectedChatMode) return false;
      const sessionType = normalizeInterviewType(session?.interviewType || parsed.interviewType || '');
      if (sessionType !== interviewType) return false;
      const sessionMode = normalizeInterviewMode(session?.interviewMode || parsed.interviewMode || '');
      if (sessionMode !== interviewMode) return false;
      return true;
    })
    .map((entry) => entry.session);

  const latestFallback = pickLatestByUpdatedAt(modeMatchedFallback as any[]) as any;
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

  const strictLatestFallback = pickLatestByUpdatedAt(
    (strictModeMatchedFallback.length ? strictModeMatchedFallback : []) as any[]
  ) as any;

  const relaxedLatestFallback = isInterviewMode ? null : latestFallback;

  return {
    interviewType,
    interviewMode,
    typedModeKey,
    typedKey,
    legacyJdKey,
    session: typedModeMatched || typedMatched || legacyMatched || strictLatestFallback || relaxedLatestFallback || null,
  };
};
