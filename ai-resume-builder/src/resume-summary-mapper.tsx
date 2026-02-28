import React from 'react';
import type { ResumeSummary } from '../types';
import { deriveDiagnosisProgress, deriveLatestAnalysisStep } from './diagnosis-progress';
import { deriveInterviewStageStatus } from '../components/screens/ai-analysis/interview-stage-status';
import { makeJdKey, parseInterviewScopedKey } from '../components/screens/ai-analysis/id-utils';

const formatNowToBeijing = () => {
  const now = new Date();
  const beijingNow = new Date(now.getTime() + (8 * 60 * 60 * 1000) + (now.getTimezoneOffset() * 60 * 1000));
  const year = beijingNow.getFullYear();
  const month = String(beijingNow.getMonth() + 1).padStart(2, '0');
  const day = String(beijingNow.getDate()).padStart(2, '0');
  const hours = String(beijingNow.getHours()).padStart(2, '0');
  const minutes = String(beijingNow.getMinutes()).padStart(2, '0');
  const seconds = String(beijingNow.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

const formatDateTimeToBeijing = (dateString: string) => {
  if (!dateString) {
    return formatNowToBeijing();
  }

  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    return formatNowToBeijing();
  }

  const beijingTime = new Date(date.getTime() + (8 * 60 * 60 * 1000) + (date.getTimezoneOffset() * 60 * 1000));
  const year = beijingTime.getFullYear();
  const month = String(beijingTime.getMonth() + 1).padStart(2, '0');
  const day = String(beijingTime.getDate()).padStart(2, '0');
  const hours = String(beijingTime.getHours()).padStart(2, '0');
  const minutes = String(beijingTime.getMinutes()).padStart(2, '0');
  const seconds = String(beijingTime.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

const isInterviewSceneSession = (sessionKey: string, session: any, interviewSessions: Record<string, any>) => {
  const chatMode = String(session?.chatMode || '').trim().toLowerCase();
  if (chatMode) return chatMode === 'interview';

  const legacyStep = String(session?.step || '').trim().toLowerCase();
  if (legacyStep === 'final_report' || legacyStep === 'comparison' || legacyStep === 'report') {
    return false;
  }
  if (legacyStep === 'chat' || legacyStep === 'interview_report') {
    return true;
  }

  const parsedState = parseInterviewScopedKey(String(sessionKey || ''));
  const stateType = String(session?.interviewType || parsedState.interviewType || '').trim().toLowerCase();
  const stateMode = String(session?.interviewMode || parsedState.interviewMode || '').trim().toLowerCase();
  const stateJdKey =
    String(session?.jdKey || '').trim() ||
    makeJdKey(String(session?.jdText || '').trim() || '__no_jd__');

  return Object.entries(interviewSessions || {}).some(([interviewKey, iv]: [string, any]) => {
    if (String(iv?.chatMode || '').trim().toLowerCase() !== 'interview') return false;
    const ivJdKey = makeJdKey(String(iv?.jdText || '').trim() || '__no_jd__');
    if (stateJdKey && ivJdKey && ivJdKey !== stateJdKey) return false;

    const parsed = parseInterviewScopedKey(String(interviewKey || ''));
    const ivType = String(iv?.interviewType || parsed.interviewType || '').trim().toLowerCase();
    const ivMode = String(iv?.interviewMode || parsed.interviewMode || '').trim().toLowerCase();
    if (stateType && ivType && stateType !== ivType) return false;
    if (stateMode && ivMode && stateMode !== ivMode) return false;
    return true;
  });
};

export const mapDbResumeToSummary = (resume: any): ResumeSummary => {
  const rowData = resume.resume_data || {};
  const contentUpdatedAt = String(rowData?.contentUpdatedAt || '').trim();
  const displayDateSource = contentUpdatedAt || resume.updated_at || resume.created_at;
  const formattedDate = formatDateTimeToBeijing(displayDateSource);
  const cleanedDate = formattedDate.replace(/[^0-9\-:\s]/g, '');
  const analysisSnapshot = rowData.analysisSnapshot || null;
  const analysisBindings = rowData.analysisBindings || {};
  const analysisSessionByJd = rowData.analysisSessionByJd || {};
  const interviewSessions = rowData.interviewSessions || {};
  const latestAnalysisStep = deriveLatestAnalysisStep(rowData);
  const reportReadyInSession = Object.values(analysisSessionByJd || {}).some((s: any) => String(s?.state || '') === 'report_ready');
  const hasBinding = !!(analysisBindings && Object.keys(analysisBindings).length > 0);
  const hasSnapshotScore = typeof analysisSnapshot?.score === 'number' && analysisSnapshot.score > 0;
  const analysisScore = hasSnapshotScore ? Number(analysisSnapshot.score) : undefined;
  const diagnosisProgress = deriveDiagnosisProgress(rowData);
  const analyzed = Boolean(hasSnapshotScore || hasBinding || reportReadyInSession);

  const interviewInterrupted = Object.entries(analysisSessionByJd || {}).some(([jdKey, session]: [string, any]) => {
    if (!isInterviewSceneSession(jdKey, session, interviewSessions)) return false;
    const state = String(session?.state || '');
    if (state !== 'paused' && state !== 'interview_in_progress') return false;
    return true;
  });

  const interviewHistory = Object.entries(analysisSessionByJd || {})
    .filter(([key, session]: [string, any]) => {
      if (!isInterviewSceneSession(key, session, interviewSessions)) return false;
      const state = String(session?.state || '');
      const isDone = state === 'interview_done';
      const isInProgress = state === 'paused' || state === 'interview_in_progress';
      return isDone || isInProgress;
    })
    .map(([jdKey, session]: [string, any]) => {
      const state = String(session?.state || '');
      const isDone = state === 'interview_done';
      const company = session.targetCompany || '未知面试';
      return {
        jdKey,
        company,
        status: (isDone ? 'completed' : 'interrupted') as 'completed' | 'interrupted',
        updatedAt: session.updatedAt || new Date().toISOString(),
      };
    })
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));

  const {
    interviewStageStatus,
    interviewStageStatusByMode,
  } = deriveInterviewStageStatus({
    ...rowData,
    id: resume.id,
  });

  return {
    id: resume.id,
    title: resume.title,
    date: cleanedDate,
    score: resume.score,
    analysisScore,
    diagnosisProgress,
    latestAnalysisStep,
    analyzed,
    interviewInterrupted,
    interviewHistory,
    interviewStageStatus,
    interviewStageStatusByMode,
    hasDot: resume.has_dot,
    optimizationStatus: rowData.optimizationStatus || 'unoptimized',
    thumbnail: (
      <>
        <div className="absolute top-2 left-1.5 w-8 h-1 bg-slate-300 dark:bg-slate-500 rounded-sm"></div>
        <div className="absolute top-4 left-1.5 w-10 h-0.5 bg-slate-200 dark:bg-slate-600 rounded-sm"></div>
        <div className="absolute top-9 left-1.5 w-11 h-8 bg-slate-100 dark:bg-slate-800 rounded-sm"></div>
      </>
    ),
  };
};
