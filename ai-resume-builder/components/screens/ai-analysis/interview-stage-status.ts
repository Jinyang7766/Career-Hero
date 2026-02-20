import { parseInterviewScopedKey } from './id-utils';

type StageStatus = 'todo' | 'current' | 'done';

const getTypeIndex = (type: string) => {
  if (type === 'general') return 0;
  if (type === 'technical') return 1;
  if (type === 'hr') return 2;
  return -1;
};

const normalizeType = (value: any) => {
  const t = String(value || '').trim().toLowerCase();
  if (t === 'general' || t === 'technical' || t === 'hr') return t;
  return '';
};

const normalizeMode = (value: any) => {
  const m = String(value || '').trim().toLowerCase();
  if (m === 'simple' || m === 'comprehensive') return m;
  return '';
};

const isInterviewSceneSession = (
  sessionKey: string,
  session: any,
  interviewSessions: any
) => {
  const chatMode = String(session?.chatMode || '').trim().toLowerCase();
  if (chatMode) return chatMode === 'interview';

  // Legacy entries without chatMode: infer by step + matching interview chat session.
  const step = String(session?.step || '').trim().toLowerCase();
  if (step === 'final_report' || step === 'comparison' || step === 'report' || step === 'micro_intro') {
    return false;
  }
  if (step === 'interview_report') return true;

  if (step !== 'chat') return false;

  const parsedState = parseInterviewScopedKey(String(sessionKey || ''));
  const stateType = String(session?.interviewType || parsedState.interviewType || '').trim().toLowerCase();
  const stateMode = String(session?.interviewMode || parsedState.interviewMode || '').trim().toLowerCase();
  const stateJdKey = String(session?.jdKey || parsedState.jdKey || '').trim();
  return Object.entries(interviewSessions || {}).some(([interviewKey, iv]: [string, any]) => {
    if (String(iv?.chatMode || '').trim().toLowerCase() !== 'interview') return false;
    const parsed = parseInterviewScopedKey(String(interviewKey || ''));
    const ivType = String(iv?.interviewType || parsed.interviewType || '').trim().toLowerCase();
    const ivMode = String(iv?.interviewMode || parsed.interviewMode || '').trim().toLowerCase();
    const ivJdKey = String(iv?.jdKey || parsed.jdKey || '').trim();
    if (stateType && ivType && stateType !== ivType) return false;
    if (stateMode && ivMode && stateMode !== ivMode) return false;
    if (stateJdKey && ivJdKey && stateJdKey !== ivJdKey) return false;
    return true;
  });
};

const applyDone = (arr: StageStatus[], idx: number) => {
  if (idx < 0 || idx > 2) return;
  arr[idx] = 'done';
};

const applyCurrent = (arr: StageStatus[], idx: number) => {
  if (idx < 0 || idx > 2) return;
  if (arr[idx] !== 'done') arr[idx] = 'current';
};

const hasPlanForScene = ({
  resumeId,
  jdKey,
  interviewType,
  interviewMode,
}: {
  resumeId: string;
  jdKey: string;
  interviewType: string;
  interviewMode: string;
}) => {
  if (typeof localStorage === 'undefined') return false;
  if (!resumeId || !jdKey || !interviewType || !interviewMode) return false;
  try {
    const prefixes = [
      `ai_interview_plan_${resumeId}_${jdKey}_${interviewType}_${interviewMode}_`,
      `ai_interview_plan_`,
    ];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = String(localStorage.key(i) || '');
      if (!key.startsWith(prefixes[1])) continue;
      const isLegacy = key.startsWith(prefixes[0]);
      const containsScene = key.includes(`_${resumeId}_${jdKey}_${interviewType}_${interviewMode}_`) ||
        key.includes(`_${jdKey}_${interviewType}_${interviewMode}_`);
      if (!isLegacy && !containsScene) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const q = Array.isArray(parsed?.questions) ? parsed.questions : [];
      if (q.length > 0) return true;
    }
  } catch {
    return false;
  }
  return false;
};

export const deriveInterviewStageStatus = (rowData: any) => {
  const analysisSessionByJd = rowData?.analysisSessionByJd || {};
  const interviewSessions = rowData?.interviewSessions || {};
  const resumeId = String(rowData?.id || '').trim();
  const stageStatus: StageStatus[] = ['todo', 'todo', 'todo'];
  const byMode: { simple: StageStatus[]; comprehensive: StageStatus[] } = {
    simple: ['todo', 'todo', 'todo'],
    comprehensive: ['todo', 'todo', 'todo'],
  };

  Object.entries(analysisSessionByJd || {}).forEach(([key, session]: [string, any]) => {
    if (!isInterviewSceneSession(key, session, interviewSessions)) return;
    const parsed = parseInterviewScopedKey(String(key || ''));
    const interviewType = normalizeType(session?.interviewType || parsed.interviewType || '');
    if (!interviewType) return;
    const idx = getTypeIndex(interviewType);
    if (idx === -1) return;
    const interviewMode = normalizeMode(session?.interviewMode || parsed.interviewMode || '') || 'comprehensive';
    const step = String(session?.step || '').trim().toLowerCase();
    const state = String(session?.state || '').trim().toLowerCase();
    const jdKey = String(session?.jdKey || parsed.jdKey || '').trim();

    if (step === 'interview_report') {
      applyDone(stageStatus, idx);
      applyDone(byMode[interviewMode], idx);
      return;
    }

    if (state === 'interview_in_progress' || state === 'paused' || step === 'chat') {
      applyCurrent(stageStatus, idx);
      applyCurrent(byMode[interviewMode], idx);
      return;
    }

    if (hasPlanForScene({ resumeId, jdKey, interviewType, interviewMode })) {
      applyCurrent(stageStatus, idx);
      applyCurrent(byMode[interviewMode], idx);
    }
  });

  Object.entries(interviewSessions || {}).forEach(([key, session]: [string, any]) => {
    if (String(session?.chatMode || '').trim().toLowerCase() !== 'interview') return;
    const messages = Array.isArray(session?.messages) ? session.messages : [];
    if (!messages.length) return;
    const parsed = parseInterviewScopedKey(String(key || ''));
    const interviewType = normalizeType(session?.interviewType || parsed.interviewType || '');
    if (!interviewType) return;
    const idx = getTypeIndex(interviewType);
    if (idx === -1) return;
    const interviewMode = normalizeMode(session?.interviewMode || parsed.interviewMode || '') || 'comprehensive';
    applyCurrent(stageStatus, idx);
    applyCurrent(byMode[interviewMode], idx);
  });

  return {
    interviewStageStatus: stageStatus,
    interviewStageStatusByMode: byMode,
  };
};
