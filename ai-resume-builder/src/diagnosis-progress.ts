const clampProgress = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const normalizeStep = (value: any) => String(value || '').trim().toLowerCase();
const toTime = (value: any) => {
  const time = Date.parse(String(value || ''));
  return Number.isFinite(time) ? time : 0;
};
const isInterviewSession = (session: any) => {
  const chatMode = String(session?.chatMode || '').trim().toLowerCase();
  if (chatMode === 'interview') return true;
  const step = normalizeStep(session?.step);
  return step === 'interview_report';
};

const getStepProgress = (step: string) => {
  const map: Record<string, number> = {
    jd_input: 15,
    analyzing: 35,
    report: 60,
    micro_intro: 72,
    chat: 82,
    interview_report: 95,
    comparison: 95,
    final_report: 100,
  };
  return map[String(step || '').trim()] ?? 0;
};

const getStateProgress = (state: string) => {
  const map: Record<string, number> = {
    idle: 5,
    jd_ready: 15,
    analyzing: 35,
    report_ready: 60,
    interview_in_progress: 78,
    paused: 80,
    interview_done: 95,
    error: 20,
  };
  return map[String(state || '').trim()] ?? 0;
};

export const deriveLatestAnalysisStep = (resumeData: any): string | undefined => {
  const rowData = resumeData || {};
  const sessions = (Object.values(rowData.analysisSessionByJd || {}) as Array<any>)
    .filter((session) => !isInterviewSession(session));
  if (!sessions.length) return undefined;

  const best = sessions.reduce((acc: any, curr: any) => {
    const accStep = normalizeStep(acc?.step);
    const currStep = normalizeStep(curr?.step);
    const accScore = getStepProgress(accStep);
    const currScore = getStepProgress(currStep);

    if (currScore > accScore) return curr;
    if (currScore < accScore) return acc;
    return toTime(curr?.updatedAt) >= toTime(acc?.updatedAt) ? curr : acc;
  }, sessions[0]);

  const step = normalizeStep(best?.step);
  return step || undefined;
};

export const deriveDiagnosisProgress = (resumeData: any): number | undefined => {
  const rowData = resumeData || {};
  const sessions = (Object.values(rowData.analysisSessionByJd || {}) as Array<any>)
    .filter((session) => !isInterviewSession(session));
  const analysisSnapshot = rowData.analysisSnapshot || null;
  const hasBinding = !!(rowData.analysisBindings && Object.keys(rowData.analysisBindings).length > 0);

  if (!sessions.length) {
    if (analysisSnapshot && typeof analysisSnapshot.score === 'number' && analysisSnapshot.score > 0) return 60;
    if (hasBinding) return 20;
    return undefined;
  }

  let progress = sessions.reduce((maxValue, session) => {
    const step = normalizeStep(session?.step);
    const fromStep = getStepProgress(step);
    const fromState = getStateProgress(String(session?.state || ''));
    const current = step === 'final_report' ? 100 : Math.max(fromStep, fromState);
    return Math.max(maxValue, current);
  }, 0);

  if (analysisSnapshot && typeof analysisSnapshot.score === 'number' && analysisSnapshot.score > 0) {
    progress = Math.max(progress, 60);
  }

  return clampProgress(progress);
};
