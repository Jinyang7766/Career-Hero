export const clearLocalAnalysisSnapshotForResume = (resumeId: number) => {
  const scopedSnapshotPrefix = 'ai_last_analysis_snapshot:';
  try {
    const raw = localStorage.getItem('ai_last_analysis_snapshot');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (String(parsed?.resumeId || '') === String(resumeId)) {
        localStorage.removeItem('ai_last_analysis_snapshot');
      }
    }
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(scopedSnapshotPrefix)) continue;
      const scopedRaw = localStorage.getItem(key);
      if (!scopedRaw) continue;
      const parsedScoped = JSON.parse(scopedRaw);
      if (String(parsedScoped?.resumeId || '') === String(resumeId)) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // ignore malformed local snapshot
  }

  const localResumeId = String(localStorage.getItem('ai_analysis_resume_id') || '');
  if (localResumeId && localResumeId === String(resumeId)) {
    localStorage.removeItem('ai_analysis_resume_id');
    localStorage.removeItem('ai_analysis_step');
    localStorage.removeItem('ai_analysis_in_progress');
    localStorage.removeItem('ai_analysis_has_activity');
    localStorage.removeItem('ai_chat_prev_step');
    localStorage.removeItem('ai_chat_entry_source');
  }

  const interviewResumeId = String(localStorage.getItem('ai_interview_resume_id') || '');
  if (interviewResumeId && interviewResumeId === String(resumeId)) {
    localStorage.removeItem('ai_interview_open');
    localStorage.removeItem('ai_interview_resume_id');
    localStorage.removeItem('ai_interview_entry_mode');
    localStorage.removeItem('ai_nav_owner_user_id');
  }

  const resultResumeId = String(localStorage.getItem('ai_result_resume_id') || '');
  if (resultResumeId && resultResumeId === String(resumeId)) {
    localStorage.removeItem('ai_result_open');
    localStorage.removeItem('ai_result_resume_id');
    localStorage.removeItem('ai_result_step');
    localStorage.removeItem('ai_report_open');
    localStorage.removeItem('ai_report_resume_id');
    localStorage.removeItem('ai_report_step');
    localStorage.removeItem('ai_report_resume_payload');
    localStorage.removeItem('ai_nav_owner_user_id');
  }

  const resumeIdText = String(resumeId);
  const escapedResumeId = resumeIdText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const newOrLegacyPlanKeyPattern = new RegExp(`^ai_interview_plan_(?:[^_]+_)?${escapedResumeId}_`);
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (newOrLegacyPlanKeyPattern.test(key)) {
      localStorage.removeItem(key);
    }
  }
};
