import { useEffect, useRef } from 'react';
import React from 'react';
import { DatabaseService } from '../../../../src/database-service';
import { deriveDiagnosisProgress, deriveLatestAnalysisStep } from '../../../../src/diagnosis-progress';
import { makeJdKey, parseInterviewScopedKey } from '../id-utils';
import { deriveInterviewStageStatus } from '../interview-stage-status';

type Params = {
  optimizedResumeId: string | number | null;
  resumeData: any;
  setAllResumes: (updater: (prev: any[]) => any[]) => void;
};

export const useOptimizedResumeListSync = ({
  optimizedResumeId,
  resumeData,
  setAllResumes,
}: Params) => {
  const syncedOptimizedDigestRef = useRef<string>('');
  const toDisplayDate = (value: any) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return '';
    const beijingTime = new Date(date.getTime() + (8 * 60 * 60 * 1000) + (date.getTimezoneOffset() * 60 * 1000));
    const year = beijingTime.getFullYear();
    const month = String(beijingTime.getMonth() + 1).padStart(2, '0');
    const day = String(beijingTime.getDate()).padStart(2, '0');
    const hours = String(beijingTime.getHours()).padStart(2, '0');
    const minutes = String(beijingTime.getMinutes()).padStart(2, '0');
    const seconds = String(beijingTime.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  };

  // Immediate local sync: keep progress bars updated without requiring page switch.
  useEffect(() => {
    const localResume: any = resumeData || {};
    const localId = String(localResume?.id || '').trim();
    if (!localId) return;
    const rowData = localResume;
    const diagnosisProgress = deriveDiagnosisProgress(rowData);
    const latestAnalysisStep = deriveLatestAnalysisStep(rowData);
    const {
      interviewStageStatus,
      interviewStageStatusByMode,
    } = deriveInterviewStageStatus({
      ...rowData,
      id: localId,
    });
    const hasSnapshotScore = typeof rowData?.analysisSnapshot?.score === 'number' && rowData.analysisSnapshot.score > 0;
    const hasBinding = !!(rowData?.analysisBindings && Object.keys(rowData.analysisBindings).length > 0);
    const reportReadyInSession = Object.values(rowData?.analysisSessionByJd || {}).some(
      (s: any) => String(s?.state || '').trim().toLowerCase() === 'report_ready'
    );
    const hasInterviewSignal = (
      Object.values(rowData?.analysisSessionByJd || {}).some((s: any) => {
        const state = String(s?.state || '').trim().toLowerCase();
        const step = String(s?.step || '').trim().toLowerCase();
        return (
          state === 'interview_in_progress' ||
          state === 'paused' ||
          state === 'interview_done' ||
          step === 'chat' ||
          step === 'interview_report' ||
          step === 'final_report'
        );
      }) ||
      Object.values(rowData?.interviewSessions || {}).some((s: any) => {
        const chatMode = String(s?.chatMode || '').trim().toLowerCase();
        if (chatMode !== 'interview' && chatMode !== 'analysis') return false;
        return Array.isArray(s?.messages) && s.messages.length > 0;
      })
    );
    const analyzed = Boolean(hasSnapshotScore || hasBinding || reportReadyInSession || hasInterviewSignal);

    setAllResumes((prev: any[]) => {
      const list = Array.isArray(prev) ? prev : [];
      return list.map((item: any) => {
        if (String(item?.id || '') !== localId) return item;
        return {
          ...item,
          diagnosisProgress,
          latestAnalysisStep,
          interviewStageStatus,
          interviewStageStatusByMode,
          analyzed,
        };
      });
    });
  }, [resumeData, setAllResumes]);

  useEffect(() => {
    const targetId = String(optimizedResumeId || (resumeData as any)?.id || '').trim();
    if (!targetId) return;

    const localResumeData: any = resumeData || {};
    const isLocalOptimizedResume = String(localResumeData?.id || '') === targetId;
    const localSnapshot = isLocalOptimizedResume ? (localResumeData.analysisSnapshot || null) : null;
    const localSessions = isLocalOptimizedResume ? (localResumeData.analysisSessionByJd || {}) : {};
    const localSessionDigest = Object.entries(localSessions || {})
      .map(([k, s]: [string, any]) => {
        const state = String(s?.state || '').trim().toLowerCase();
        const step = String(s?.step || '').trim().toLowerCase();
        const updatedAt = String(s?.updatedAt || '').trim();
        return `${k}:${state}:${step}:${updatedAt}`;
      })
      .sort()
      .join('|');
    const localInterviewSessionDigest = Object.entries(isLocalOptimizedResume ? (localResumeData.interviewSessions || {}) : {})
      .map(([k, s]: [string, any]) => {
        const mode = String(s?.chatMode || '').trim().toLowerCase();
        const updatedAt = String(s?.updatedAt || '').trim();
        const msgCount = Array.isArray(s?.messages) ? s.messages.length : 0;
        return `${k}:${mode}:${msgCount}:${updatedAt}`;
      })
      .sort()
      .join('|');
    const localDigest = [
      targetId,
      String(localSnapshot?.updatedAt || ''),
      String(localSnapshot?.score ?? ''),
      String(Object.keys(localSessions || {}).length),
      localSessionDigest,
      localInterviewSessionDigest,
    ].join('|');

    if (syncedOptimizedDigestRef.current === localDigest) return;

    let cancelled = false;
    (async () => {
      let resumeRow: any = null;
      let rowData: any = null;

      if (isLocalOptimizedResume) {
        resumeRow = {
          id: localResumeData.id,
          title: localResumeData.resumeTitle || '已诊断简历',
          score: localResumeData.score,
          has_dot: false,
          updated_at: String(localResumeData.updated_at || localResumeData.updatedAt || ''),
          created_at: String(localResumeData.created_at || localResumeData.createdAt || ''),
        };
        rowData = localResumeData;
      } else {
        const row = await DatabaseService.getResume(targetId);
        if (cancelled || !row.success || !row.data) return;
        resumeRow = row.data;
        rowData = resumeRow.resume_data || {};
      }

      const analysisSnapshot = rowData.analysisSnapshot || null;
      const analysisBindings = rowData.analysisBindings || {};
      const analysisSessionByJd = rowData.analysisSessionByJd || {};
      const latestAnalysisStep = deriveLatestAnalysisStep(rowData);
      const interviewSessions = rowData.interviewSessions || {};
      const reportReadyInSession = Object.values(analysisSessionByJd || {}).some(
        (s: any) => String(s?.state || '') === 'report_ready'
      );
      const hasInterviewSignal = (
        Object.values(analysisSessionByJd || {}).some((s: any) => {
          const state = String(s?.state || '').trim().toLowerCase();
          const step = String(s?.step || '').trim().toLowerCase();
          return (
            state === 'interview_in_progress' ||
            state === 'paused' ||
            state === 'interview_done' ||
            step === 'chat' ||
            step === 'interview_report'
          );
        }) ||
        Object.values(interviewSessions || {}).some((s: any) => {
          const chatMode = String(s?.chatMode || '').trim().toLowerCase();
          if (chatMode !== 'interview') return false;
          return Array.isArray(s?.messages) && s.messages.length > 0;
        })
      );
      const hasBinding = !!(analysisBindings && Object.keys(analysisBindings).length > 0);
      const hasSnapshotScore = typeof analysisSnapshot?.score === 'number' && analysisSnapshot.score > 0;
      const statusRaw = String(rowData?.optimizationStatus || '').trim().toLowerCase();
      const isActuallyOptimized = statusRaw === 'optimized' || !!rowData?.optimizedFromId;
      if (!isActuallyOptimized && !hasSnapshotScore && !hasBinding && !reportReadyInSession && !hasInterviewSignal) {
        // Guard: never upgrade a plain resume into "已诊断/optimized" from partial local state.
        return;
      }
      const analysisScore = hasSnapshotScore ? Number(analysisSnapshot.score) : undefined;
      const diagnosisProgress = deriveDiagnosisProgress(rowData);
      const analyzed = Boolean(hasSnapshotScore || hasBinding || reportReadyInSession || hasInterviewSignal);
      const isInterviewSceneSession = (sessionKey: string, session: any) => {
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
      const interviewInterrupted = Object.entries(analysisSessionByJd || {}).some(([jdKey, session]: [string, any]) => {
        if (!isInterviewSceneSession(jdKey, session)) return false;
        const state = String(session?.state || '');
        if (state !== 'paused' && state !== 'interview_in_progress') return false;
        return true;
      });

      const interviewHistory = Object.entries(analysisSessionByJd || {})
        .filter(([key, session]: [string, any]) => {
          if (!isInterviewSceneSession(key, session)) return false;
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
            updatedAt: session.updatedAt || new Date().toISOString()
          };
        })
        .sort((a: any, b: any) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));

      const {
        interviewStageStatus,
        interviewStageStatusByMode,
      } = deriveInterviewStageStatus({
        ...rowData,
        id: resumeRow.id,
      });

      const summaryItem: any = {
        id: resumeRow.id,
        title: resumeRow.title,
        date: toDisplayDate(rowData?.contentUpdatedAt || resumeRow.updated_at || resumeRow.created_at),
        score: resumeRow.score,
        analysisScore,
        diagnosisProgress,
        latestAnalysisStep,
        analyzed,
        interviewInterrupted,
        interviewHistory,
        interviewStageStatus,
        interviewStageStatusByMode,
        hasDot: resumeRow.has_dot,
        optimizationStatus: isActuallyOptimized ? 'optimized' : (statusRaw || 'unoptimized'),
        thumbnail: (
          <>
            <div className="absolute top-2 left-1.5 w-8 h-1 bg-slate-300 dark:bg-slate-500 rounded-sm"></div>
            <div className="absolute top-4 left-1.5 w-10 h-0.5 bg-slate-200 dark:bg-slate-600 rounded-sm"></div>
            <div className="absolute top-9 left-1.5 w-11 h-8 bg-slate-100 dark:bg-slate-800 rounded-sm"></div>
          </>
        ),
      };

      setAllResumes((prev: any[]) => {
        const list = Array.isArray(prev) ? prev : [];
        const exists = list.some((r: any) => String(r?.id) === String(summaryItem.id));
        if (exists) {
          return list.map((r: any) => {
            if (String(r?.id) !== String(summaryItem.id)) return r;
            const safeDate = summaryItem.date || String(r?.date || '');
            return {
              ...r,
              ...summaryItem,
              date: safeDate,
              // Never downgrade/upgrade optimization flag accidentally when current row is not truly optimized.
              optimizationStatus: isActuallyOptimized ? 'optimized' : (r?.optimizationStatus || 'unoptimized'),
              analyzed: summaryItem.analyzed,
            };
          });
        }
        return [summaryItem, ...list];
      });

      syncedOptimizedDigestRef.current = localDigest;
    })();

    return () => {
      cancelled = true;
    };
  }, [optimizedResumeId, resumeData, setAllResumes]);
};
