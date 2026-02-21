import { makeInterviewScopedKey, makeInterviewSessionKey } from './id-utils';

export const pickFirstNonEmptyText = (...values: Array<any>) => {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
};

export const normalizeSceneText = (value: any) =>
  String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

export const hashSceneSignature = (value: string) => {
  const normalized = normalizeSceneText(value) || 'scene_default';
  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 31 + normalized.charCodeAt(i)) | 0;
  }
  return `s_${Math.abs(hash)}`;
};

export const buildInterviewSessionStorageKey = ({
  jdText,
  interviewType,
  interviewMode,
  targetCompany,
  interviewFocus,
  resumeId,
  chatMode,
}: {
  jdText: string;
  interviewType: string;
  interviewMode: string;
  targetCompany?: string;
  interviewFocus?: string;
  resumeId?: string | number | null;
  chatMode: 'interview' | 'micro';
}) => {
  const baseKey = makeInterviewSessionKey(jdText, interviewType, interviewMode);
  if (chatMode !== 'interview') return baseKey;
  const signature = [
    `rid=${String(resumeId ?? '').trim() || 'unknown'}`,
    `tc=${normalizeSceneText(targetCompany) || 'none'}`,
    `focus=${normalizeSceneText(interviewFocus) || 'none'}`,
    `mode=${String(chatMode).trim().toLowerCase()}`,
  ].join('|');
  return `${baseKey}__scene_${hashSceneSignature(signature)}`;
};

export const buildAnalysisSessionStorageKey = ({
  jdKey,
  interviewType,
  interviewMode,
  chatMode,
}: {
  jdKey: string;
  interviewType: any;
  interviewMode?: any;
  chatMode: 'interview' | 'micro';
}) => `${makeInterviewScopedKey(jdKey, interviewType, interviewMode)}__${chatMode}`;

export const isSessionModeMatched = (session: any, desiredMode: string) => {
  const current = String(desiredMode || '').trim().toLowerCase();
  const sessionMode = String(session?.interviewMode || '').trim().toLowerCase();
  if (!current) return true;
  if (!sessionMode) return false;
  return sessionMode === current;
};

export const isSessionChatModeMatched = (session: any, expectedMode: string) => {
  const expected = String(expectedMode || '').trim().toLowerCase();
  const chatMode = String(session?.chatMode || '').trim().toLowerCase();
  if (!expected) return true;
  if (!chatMode) return false;
  return chatMode === expected;
};

export const isSessionSceneMatched = ({
  session,
  expectedChatMode,
  expectedTargetCompany,
  expectedInterviewFocus,
  expectedResumeId,
}: {
  session: any;
  expectedChatMode: string;
  expectedTargetCompany: string;
  expectedInterviewFocus: string;
  expectedResumeId: string;
}) => {
  const chatMode = String(session?.chatMode || '').trim().toLowerCase();
  if (!chatMode || chatMode !== expectedChatMode) return false;
  const sessionTargetCompany = normalizeSceneText(session?.targetCompany);
  const sessionInterviewFocus = normalizeSceneText(session?.interviewFocus);
  const sessionResumeId = String(session?.resumeId || '').trim();
  return (
    sessionTargetCompany === expectedTargetCompany &&
    sessionInterviewFocus === expectedInterviewFocus &&
    sessionResumeId === expectedResumeId
  );
};
