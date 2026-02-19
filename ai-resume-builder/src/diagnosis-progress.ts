const clampProgress = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

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

export const deriveDiagnosisProgress = (resumeData: any): number | undefined => {
  const rowData = resumeData || {};
  const sessions = Object.values(rowData.analysisSessionByJd || {}) as Array<any>;
  const analysisSnapshot = rowData.analysisSnapshot || null;
  const hasBinding = !!(rowData.analysisBindings && Object.keys(rowData.analysisBindings).length > 0);

  if (!sessions.length) {
    if (analysisSnapshot && typeof analysisSnapshot.score === 'number' && analysisSnapshot.score > 0) return 60;
    if (hasBinding) return 20;
    return undefined;
  }

  const latest = sessions.reduce((acc, curr) => {
    const accAt = Date.parse(String(acc?.updatedAt || ''));
    const currAt = Date.parse(String(curr?.updatedAt || ''));
    if (!Number.isFinite(accAt)) return curr;
    if (!Number.isFinite(currAt)) return acc;
    return currAt > accAt ? curr : acc;
  }, sessions[0]);

  const fromStep = getStepProgress(String(latest?.step || ''));
  const fromState = getStateProgress(String(latest?.state || ''));
  let progress = Math.max(fromStep, fromState);

  if (analysisSnapshot && typeof analysisSnapshot.score === 'number' && analysisSnapshot.score > 0) {
    progress = Math.max(progress, 60);
  }
  if (String(latest?.step || '') === 'final_report') {
    progress = 100;
  }

  return clampProgress(progress);
};
