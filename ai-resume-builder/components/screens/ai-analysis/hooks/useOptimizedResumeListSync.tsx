import { useEffect, useRef } from 'react';
import React from 'react';
import { DatabaseService } from '../../../../src/database-service';
import { deriveDiagnosisProgress } from '../../../../src/diagnosis-progress';

type Params = {
  optimizedResumeId: string | number | null;
  resumeData: any;
  currentStep: string;
  setAllResumes: (updater: (prev: any[]) => any[]) => void;
};

export const useOptimizedResumeListSync = ({
  optimizedResumeId,
  resumeData,
  currentStep,
  setAllResumes,
}: Params) => {
  const syncedOptimizedDigestRef = useRef<string>('');

  useEffect(() => {
    const optimizedId = String(optimizedResumeId || '').trim();
    if (!optimizedId) return;

    const localResumeData: any = resumeData || {};
    const isLocalOptimizedResume = String(localResumeData?.id || '') === optimizedId;
    const localSnapshot = isLocalOptimizedResume ? (localResumeData.analysisSnapshot || null) : null;
    const localSessions = isLocalOptimizedResume ? (localResumeData.analysisSessionByJd || {}) : {};
    const localDigest = [
      optimizedId,
      String(localSnapshot?.updatedAt || ''),
      String(localSnapshot?.score ?? ''),
      String(Object.keys(localSessions || {}).length),
      currentStep,
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
          updated_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        };
        rowData = localResumeData;
      } else {
        const row = await DatabaseService.getResume(optimizedId);
        if (cancelled || !row.success || !row.data) return;
        resumeRow = row.data;
        rowData = resumeRow.resume_data || {};
      }

      const analysisSnapshot = rowData.analysisSnapshot || null;
      const analysisBindings = rowData.analysisBindings || {};
      const analysisSessionByJd = rowData.analysisSessionByJd || {};
      const interviewSessions = rowData.interviewSessions || {};
      const reportReadyInSession = Object.values(analysisSessionByJd || {}).some(
        (s: any) => String(s?.state || '') === 'report_ready'
      );
      const hasBinding = !!(analysisBindings && Object.keys(analysisBindings).length > 0);
      const hasSnapshotScore = typeof analysisSnapshot?.score === 'number' && analysisSnapshot.score > 0;
      const analysisScore = hasSnapshotScore ? Number(analysisSnapshot.score) : undefined;
      const diagnosisProgress = deriveDiagnosisProgress(rowData);
      const analyzed = Boolean(hasSnapshotScore || hasBinding || reportReadyInSession);
      const interviewInterrupted = Object.entries(analysisSessionByJd || {}).some(([jdKey, session]: [string, any]) => {
        const state = String(session?.state || '');
        if (state !== 'paused' && state !== 'interview_in_progress') return false;
        const messages = interviewSessions?.[jdKey]?.messages;
        return Array.isArray(messages) && messages.length > 0;
      });

      const interviewHistory = Object.entries(analysisSessionByJd || {})
        .filter(([_, session]: [string, any]) => {
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

      const interviewStageStatus: Array<'todo' | 'current' | 'done'> = ['todo', 'todo', 'todo'];
      Object.entries(analysisSessionByJd || {}).forEach(([key, session]: [string, any]) => {
        const state = String(session?.state || '');
        let idx = -1;
        if (key.endsWith('__general')) idx = 0;
        else if (key.endsWith('__technical')) idx = 1;
        else if (key.endsWith('__hr')) idx = 2;

        if (idx !== -1) {
          if (state === 'interview_done') interviewStageStatus[idx] = 'done';
          else if ((state === 'paused' || state === 'interview_in_progress') && interviewStageStatus[idx] !== 'done') {
            interviewStageStatus[idx] = 'current';
          }
        }
      });

      const summaryItem: any = {
        id: resumeRow.id,
        title: resumeRow.title,
        date: String(resumeRow.updated_at || resumeRow.created_at || '').replace(/[^0-9\-:\s]/g, '') || new Date().toISOString(),
        score: resumeRow.score,
        analysisScore,
        diagnosisProgress,
        analyzed,
        interviewInterrupted,
        interviewHistory,
        interviewStageStatus,
        hasDot: resumeRow.has_dot,
        optimizationStatus: rowData.optimizationStatus || 'optimized',
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
          return list.map((r: any) => (String(r?.id) === String(summaryItem.id) ? { ...r, ...summaryItem } : r));
        }
        return [summaryItem, ...list];
      });

      syncedOptimizedDigestRef.current = localDigest;
    })();

    return () => {
      cancelled = true;
    };
  }, [optimizedResumeId, resumeData, currentStep, setAllResumes]);
};
