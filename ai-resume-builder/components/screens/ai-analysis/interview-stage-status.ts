import { makeJdKey } from './id-utils';

type StageStatus = 'todo' | 'current' | 'done';
type StageCandidate = { status: StageStatus; updatedAt: number };

const getTypeIndex = (type: string) => {
  if (type === 'general') return 0;
  if (type === 'technical') return 1;
  if (type === 'pressure') return 2;
  return -1;
};

const normalizeType = (value: any) => {
  const t = String(value || '').trim().toLowerCase();
  if (t === 'general' || t === 'technical') return t;
  if (t === 'pressure' || t === 'hr') return 'pressure';
  return '';
};

const normalizeMode = (value: any) => {
  const m = String(value || '').trim().toLowerCase();
  if (m === 'simple' || m === 'comprehensive') return m;
  return '';
};

const parseScopedParts = (key: string) => {
  const parts = String(key || '').trim().split('__').filter(Boolean);
  const tail = String(parts[parts.length - 1] || '').trim().toLowerCase();
  const chatModeSuffix = tail === 'interview' ? tail : '';
  return {
    jdKey: String(parts[0] || '').trim(),
    interviewType: normalizeType(parts[1] || ''),
    interviewMode: normalizeMode(parts[2] || ''),
    chatModeSuffix,
  };
};

const resolveInterviewType = (session: any, sessionKey: string) => {
  const explicit = normalizeType(session?.interviewType || '');
  if (explicit) return explicit;
  return parseScopedParts(sessionKey).interviewType;
};

const resolveInterviewMode = (session: any, sessionKey: string) => {
  const explicit = normalizeMode(session?.interviewMode || '');
  if (explicit) return explicit;
  return parseScopedParts(sessionKey).interviewMode || 'comprehensive';
};

const resolveJdKey = (session: any, sessionKey: string) => {
  const explicit = String(session?.jdKey || '').trim();
  if (explicit) return explicit;
  return parseScopedParts(sessionKey).jdKey;
};

const normalizeSceneText = (value: any) =>
  String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

const parseUpdatedAt = (value: any) => {
  const time = Date.parse(String(value || '').trim());
  return Number.isFinite(time) ? time : 0;
};

const statusRank = (status: StageStatus) => {
  if (status === 'current') return 2;
  if (status === 'done') return 1;
  return 0;
};

const pickLatestCandidate = (
  existing: StageCandidate | null,
  incoming: StageCandidate
) => {
  if (!existing) return incoming;
  if (incoming.updatedAt > existing.updatedAt) return incoming;
  if (incoming.updatedAt < existing.updatedAt) return existing;
  return statusRank(incoming.status) > statusRank(existing.status) ? incoming : existing;
};

const mergeCandidates = (
  left: StageCandidate | null,
  right: StageCandidate | null
) => {
  if (!left) return right;
  if (!right) return left;
  return pickLatestCandidate(left, right);
};

const buildSceneKey = ({
  jdKey,
  interviewType,
  interviewMode,
  resumeId,
  targetCompany,
  interviewFocus,
}: {
  jdKey: string;
  interviewType: string;
  interviewMode: string;
  resumeId: any;
  targetCompany: any;
  interviewFocus: any;
}) => {
  const normalizedResumeId = String(resumeId || '').trim() || 'unknown';
  const normalizedCompany = normalizeSceneText(targetCompany) || 'none';
  const normalizedFocus = normalizeSceneText(interviewFocus) || 'none';
  return `${jdKey}__${interviewType}__${interviewMode}__rid=${normalizedResumeId}__tc=${normalizedCompany}__focus=${normalizedFocus}`;
};

const hasMatchingInterviewChatSession = (
  sessionKey: string,
  session: any,
  interviewSessions: any
) => {
  const parsedState = parseScopedParts(sessionKey);
  const stateType = resolveInterviewType(session, sessionKey);
  const stateMode = resolveInterviewMode(session, sessionKey);
  const stateJdKey = resolveJdKey(session, sessionKey);
  const stateResumeId = String(session?.resumeId || '').trim();
  const stateCompany = normalizeSceneText(session?.targetCompany);
  const stateFocus = normalizeSceneText(session?.interviewFocus);

  return Object.entries(interviewSessions || {}).some(([interviewKey, iv]: [string, any]) => {
    if (String(iv?.chatMode || '').trim().toLowerCase() !== 'interview') return false;

    const ivType = resolveInterviewType(iv, interviewKey);
    const ivMode = resolveInterviewMode(iv, interviewKey);
    const ivJdKey = resolveJdKey(iv, interviewKey);
    const ivResumeId = String(iv?.resumeId || '').trim();
    const ivCompany = normalizeSceneText(iv?.targetCompany);
    const ivFocus = normalizeSceneText(iv?.interviewFocus);

    if (stateType && ivType && stateType !== ivType) return false;
    if (stateMode && ivMode && stateMode !== ivMode) return false;
    if (stateJdKey && ivJdKey && stateJdKey !== ivJdKey) return false;
    if (stateResumeId && ivResumeId && stateResumeId !== ivResumeId) return false;
    if (stateCompany && ivCompany && stateCompany !== ivCompany) return false;
    if (stateFocus && ivFocus && stateFocus !== ivFocus) return false;
    return true;
  });
};

const isInterviewSceneSession = (
  sessionKey: string,
  session: any,
  interviewSessions: any
) => {
  const parsed = parseScopedParts(sessionKey);
  const chatMode = String(session?.chatMode || '').trim().toLowerCase();
  if (chatMode) return chatMode === 'interview';

  // Legacy entries without chatMode: infer by step + matching interview chat session.
  const step = String(session?.step || '').trim().toLowerCase();
  if (step === 'comparison' || step === 'report') {
    return false;
  }
  const hasInterviewIdentity = !!resolveInterviewType(session, sessionKey);
  if (step === 'interview_report' || step === 'final_report') {
    if (hasInterviewIdentity) return true;
    return hasMatchingInterviewChatSession(sessionKey, session, interviewSessions);
  }

  if (step !== 'chat') return false;
  if (hasInterviewIdentity) return true;
  return hasMatchingInterviewChatSession(sessionKey, session, interviewSessions);
};

const resolveSessionJdKey = (session: any, sessionKey: string) => {
  const resolved = resolveJdKey(session, sessionKey);
  if (resolved) return resolved;
  return makeJdKey(String(session?.jdText || '').trim() || '__no_jd__');
};

const applyCandidate = (
  arr: Array<StageCandidate | null>,
  idx: number,
  status: StageStatus,
  updatedAt: number
) => {
  if (idx < 0 || idx > 2) return;
  const next = { status, updatedAt };
  arr[idx] = pickLatestCandidate(arr[idx], next);
};

export const deriveInterviewStageStatus = (rowData: any) => {
  const analysisSessionByJd = rowData?.analysisSessionByJd || {};
  const interviewSessions = rowData?.interviewSessions || {};
  const fallbackResumeId = String(rowData?.id || '').trim();
  const activeJdKey = makeJdKey(String(rowData?.lastJdText || '').trim() || '__no_jd__');
  const activeTargetCompany = normalizeSceneText(rowData?.targetCompany || '');
  const activeInterviewFocus = normalizeSceneText(rowData?.interviewFocus || '');
  const byModeCandidates: { simple: Array<StageCandidate | null>; comprehensive: Array<StageCandidate | null> } = {
    simple: [null, null, null],
    comprehensive: [null, null, null],
  };
  const completedSceneKeys = new Set<string>();
  const isSceneBaselineMatched = (sessionKey: string, session: any) => {
    const sessionJdKey = resolveSessionJdKey(session, sessionKey);
    if (sessionJdKey !== activeJdKey) return false;
    const sessionCompany = normalizeSceneText(session?.targetCompany || '');
    if (sessionCompany !== activeTargetCompany) return false;
    const sessionFocus = normalizeSceneText(session?.interviewFocus || '');
    if (activeInterviewFocus && sessionFocus !== activeInterviewFocus) return false;
    const sessionResumeId = String(session?.resumeId || '').trim();
    if (sessionResumeId && fallbackResumeId && sessionResumeId !== fallbackResumeId) return false;
    return true;
  };

  Object.entries(analysisSessionByJd || {}).forEach(([key, session]: [string, any]) => {
    if (!isInterviewSceneSession(key, session, interviewSessions)) return;
    if (!isSceneBaselineMatched(key, session)) return;
    const interviewType = resolveInterviewType(session, key);
    if (!interviewType) return;
    const idx = getTypeIndex(interviewType);
    if (idx === -1) return;
    const interviewMode = resolveInterviewMode(session, key);
    const jdKey = resolveJdKey(session, key);
    const state = String(session?.state || '').trim().toLowerCase();
    const step = String(session?.step || '').trim().toLowerCase();
    const updatedAt = parseUpdatedAt(session?.updatedAt || session?.lastMessageAt);
    const sceneKey = buildSceneKey({
      jdKey,
      interviewType,
      interviewMode,
      resumeId: session?.resumeId || fallbackResumeId,
      targetCompany: session?.targetCompany,
      interviewFocus: session?.interviewFocus,
    });

    if (state === 'interview_done' && (step === 'interview_report' || step === 'final_report')) {
      completedSceneKeys.add(sceneKey);
      applyCandidate(byModeCandidates[interviewMode], idx, 'done', updatedAt);
      return;
    }

    if (state === 'interview_in_progress' || state === 'paused' || step === 'chat') {
      applyCandidate(byModeCandidates[interviewMode], idx, 'current', updatedAt);
    }
  });

  Object.entries(interviewSessions || {}).forEach(([key, session]: [string, any]) => {
    if (String(session?.chatMode || '').trim().toLowerCase() !== 'interview') return;
    if (!isSceneBaselineMatched(key, session)) return;
    const messages = Array.isArray(session?.messages) ? session.messages : [];
    if (!messages.length) return;
    const interviewType = resolveInterviewType(session, key);
    if (!interviewType) return;
    const idx = getTypeIndex(interviewType);
    if (idx === -1) return;
    const interviewMode = resolveInterviewMode(session, key);
    const jdKey = resolveJdKey(session, key);
    const sceneKey = buildSceneKey({
      jdKey,
      interviewType,
      interviewMode,
      resumeId: session?.resumeId || fallbackResumeId,
      targetCompany: session?.targetCompany,
      interviewFocus: session?.interviewFocus,
    });
    if (completedSceneKeys.has(sceneKey)) return;
    const updatedAt = parseUpdatedAt(session?.updatedAt || session?.lastMessageAt);
    applyCandidate(byModeCandidates[interviewMode], idx, 'current', updatedAt);
  });

  const byMode: { simple: StageStatus[]; comprehensive: StageStatus[] } = {
    simple: byModeCandidates.simple.map((item) => item?.status || 'todo'),
    comprehensive: byModeCandidates.comprehensive.map((item) => item?.status || 'todo'),
  };
  const stageStatus: StageStatus[] = [0, 1, 2].map((idx) => {
    const merged = mergeCandidates(byModeCandidates.simple[idx], byModeCandidates.comprehensive[idx]);
    return merged?.status || 'todo';
  }) as StageStatus[];

  return {
    interviewStageStatus: stageStatus,
    interviewStageStatusByMode: byMode,
  };
};
