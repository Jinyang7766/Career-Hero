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
  targetRole,
  interviewFocus,
  resumeId,
  chatMode,
}: {
  jdText: string;
  interviewType: string;
  interviewMode: string;
  targetCompany?: string;
  targetRole?: string;
  interviewFocus?: string;
  resumeId?: string | number | null;
  chatMode: 'interview' | 'analysis';
}) => {
  // New keys are mode-agnostic. Keep interviewMode param only for legacy call-site compatibility.
  const baseKey = makeInterviewSessionKey(jdText, interviewType);
  if (chatMode !== 'interview') return baseKey;
  const sceneTarget = normalizeSceneText(targetRole || targetCompany) || 'none';
  const signature = [
    `rid=${String(resumeId ?? '').trim() || 'unknown'}`,
    `tr=${sceneTarget}`,
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
  chatMode: 'interview' | 'analysis';
}) => {
  // New analysis-session keys are mode-agnostic.
  void interviewMode;
  return `${makeInterviewScopedKey(jdKey, interviewType)}__${chatMode}`;
};

export const isSessionModeMatched = (session: any, desiredMode: string) => {
  // Interview mode selection has been removed. Keep this helper permissive so
  // both legacy mode-tagged rows and mode-less rows can be restored.
  void session;
  void desiredMode;
  return true;
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
  const sessionTargetCompany = normalizeSceneText(session?.targetRole || session?.targetCompany);
  const sessionInterviewFocus = normalizeSceneText(session?.interviewFocus);
  const sessionResumeId = String(session?.resumeId || '').trim();
  return (
    sessionTargetCompany === expectedTargetCompany &&
    sessionInterviewFocus === expectedInterviewFocus &&
    sessionResumeId === expectedResumeId
  );
};
