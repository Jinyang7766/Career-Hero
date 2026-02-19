import { useEffect, useRef } from 'react';
import React from 'react';
import { DatabaseService } from '../../../../src/database-service';
import { deriveDiagnosisProgress } from '../../../../src/diagnosis-progress';
import { makeJdKey, parseInterviewScopedKey } from '../id-utils';

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
  const toDisplayDate = (value: any) => {
    const raw = String(value || '').trim();
    if (!raw) return new Date().toISOString();
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return new Date().toISOString();
    const beijingTime = new Date(date.getTime() + (8 * 60 * 60 * 1000) + (date.getTimezoneOffset() * 60 * 1000));
    const year = beijingTime.getFullYear();
    const month = String(beijingTime.getMonth() + 1).padStart(2, '0');
    const day = String(beijingTime.getDate()).padStart(2, '0');
    const hours = String(beijingTime.getHours()).padStart(2, '0');
    const minutes = String(beijingTime.getMinutes()).padStart(2, '0');
    const seconds = String(beijingTime.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  };

  useEffect(() => {
    const targetId = String(optimizedResumeId || (resumeData as any)?.id || '').trim();
    if (!targetId) return;

    const localResumeData: any = resumeData || {};
    const isLocalOptimizedResume = String(localResumeData?.id || '') === targetId;
    const localSnapshot = isLocalOptimizedResume ? (localResumeData.analysisSnapshot || null) : null;
    const localSessions = isLocalOptimizedResume ? (localResumeData.analysisSessionByJd || {}) : {};
    const localDigest = [
      targetId,
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
        const row = await DatabaseService.getResume(targetId);
        if (cancelled || !row.success || !row.data) return;
        resumeRow = row.data;
        rowData = resumeRow.resume_data || {};
      }

      const analysisSnapshot = rowData.analysisSnapshot || null;
      const analysisBindings = rowData.analysisBindings || {};
      const analysisSessionByJd = rowData.analysisSessionByJd || {};
      const latestSession = Object.values(analysisSessionByJd || {}).reduce((acc: any, curr: any) => {
        const accAt = Date.parse(String(acc?.updatedAt || ''));
        const currAt = Date.parse(String(curr?.updatedAt || ''));
        if (!Number.isFinite(accAt)) return curr;
        if (!Number.isFinite(currAt)) return acc;
        return currAt > accAt ? curr : acc;
      }, null);
      const latestAnalysisStep = String((latestSession as any)?.step || '').trim().toLowerCase() || undefined;
      const interviewSessions = rowData.interviewSessions || {};
      const reportReadyInSession = Object.values(analysisSessionByJd || {}).some(
        (s: any) => String(s?.state || '') === 'report_ready'
      );
      const hasBinding = !!(analysisBindings && Object.keys(analysisBindings).length > 0);
      const hasSnapshotScore = typeof analysisSnapshot?.score === 'number' && analysisSnapshot.score > 0;
      const statusRaw = String(rowData?.optimizationStatus || '').trim().toLowerCase();
      const isActuallyOptimized = statusRaw === 'optimized' || !!rowData?.optimizedFromId;
      if (!isActuallyOptimized && !hasSnapshotScore && !hasBinding && !reportReadyInSession) {
        // Guard: never upgrade a plain resume into "已诊断/optimized" from partial local state.
        return;
      }
      const analysisScore = hasSnapshotScore ? Number(analysisSnapshot.score) : undefined;
      const diagnosisProgress = deriveDiagnosisProgress(rowData);
      const analyzed = Boolean(hasSnapshotScore || hasBinding || reportReadyInSession);
      const interviewInterrupted = Object.entries(analysisSessionByJd || {}).some(([jdKey, session]: [string, any]) => {
        const state = String(session?.state || '');
        if (state !== 'paused' && state !== 'interview_in_progress') return false;
        return true;
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
      const interviewStageStatusByMode: {
        simple: Array<'todo' | 'current' | 'done'>;
        comprehensive: Array<'todo' | 'current' | 'done'>;
      } = {
        simple: ['todo', 'todo', 'todo'],
        comprehensive: ['todo', 'todo', 'todo'],
      };
      const applyStageStatus = (
        target: Array<'todo' | 'current' | 'done'>,
        idx: number,
        state: string
      ) => {
        if (idx < 0 || idx > 2) return;
        if (state === 'interview_done') target[idx] = 'done';
        else if ((state === 'paused' || state === 'interview_in_progress') && target[idx] !== 'done') {
          target[idx] = 'current';
        }
      };
      const inferTypeFromSessionKey = (key: string) => {
        const parsed = parseInterviewScopedKey(String(key || ''));
        if (parsed.interviewType === 'general' || parsed.interviewType === 'technical' || parsed.interviewType === 'hr') {
          return parsed.interviewType;
        }
        return '';
      };
      const inferModeFromSessionKey = (key: string) => {
        const parsed = parseInterviewScopedKey(String(key || ''));
        return parsed.interviewMode === 'simple' ? 'simple' : (parsed.interviewMode === 'comprehensive' ? 'comprehensive' : '');
      };
      const getTypeIndex = (type: string) => {
        if (type === 'general') return 0;
        if (type === 'technical') return 1;
        if (type === 'hr') return 2;
        return -1;
      };
      let hasUnmappedInProgress = false;
      let hasUnmappedDone = false;
      Object.entries(analysisSessionByJd || {}).forEach(([key, sessionByJd]: [string, any]) => {
          const state = String(sessionByJd?.state || '');
          const stateType = String(sessionByJd?.interviewType || inferTypeFromSessionKey(key)).trim().toLowerCase();
          const stateMode = String(sessionByJd?.interviewMode || inferModeFromSessionKey(key)).trim().toLowerCase();
          const stateJdKey = String(sessionByJd?.jdKey || '').trim() || makeJdKey(String(sessionByJd?.jdText || '').trim() || '__no_jd__');
          const matchedSessions = Object.entries(interviewSessions || {}).filter(([_, iv]: [string, any]) => {
            const ivJdKey = makeJdKey(String(iv?.jdText || '').trim());
            return ivJdKey === stateJdKey;
          });
          const directIdx = getTypeIndex(stateType);
          if (directIdx !== -1) {
            const directMode = stateMode === 'simple' ? 'simple' : (stateMode === 'comprehensive' ? 'comprehensive' : '');
            applyStageStatus(interviewStageStatus, directIdx, state);
            if (directMode) {
              applyStageStatus(interviewStageStatusByMode[directMode], directIdx, state);
            } else {
              applyStageStatus(interviewStageStatusByMode.comprehensive, directIdx, state);
            }
            return;
          }
          if (matchedSessions.length > 0) {
            matchedSessions.forEach(([sessionKey, iv]: [string, any]) => {
              const interviewType = String(iv?.interviewType || inferTypeFromSessionKey(sessionKey)).trim().toLowerCase();
            const idx = getTypeIndex(interviewType);
            if (idx === -1) return;
            const modeRaw = String(iv?.interviewMode || '').trim().toLowerCase();
            const mode = modeRaw === 'simple' ? 'simple' : 'comprehensive';
            applyStageStatus(interviewStageStatus, idx, state);
            applyStageStatus(interviewStageStatusByMode[mode], idx, state);
          });
            return;
          }
        let idx = -1;
        if (key.endsWith('__general')) idx = 0;
        else if (key.endsWith('__technical')) idx = 1;
        else if (key.endsWith('__hr')) idx = 2;

        if (idx !== -1) {
          applyStageStatus(interviewStageStatus, idx, state);
          applyStageStatus(interviewStageStatusByMode.comprehensive, idx, state);
        } else {
          if (state === 'interview_done') hasUnmappedDone = true;
          else if (state === 'paused' || state === 'interview_in_progress') hasUnmappedInProgress = true;
        }
      });
      if (hasUnmappedDone) interviewStageStatus[0] = 'done';
      else if (hasUnmappedInProgress && interviewStageStatus[0] !== 'done') interviewStageStatus[0] = 'current';
      if (hasUnmappedDone) interviewStageStatusByMode.comprehensive[0] = 'done';
      else if (hasUnmappedInProgress && interviewStageStatusByMode.comprehensive[0] !== 'done') {
        interviewStageStatusByMode.comprehensive[0] = 'current';
      }

      const summaryItem: any = {
        id: resumeRow.id,
        title: resumeRow.title,
        date: toDisplayDate(resumeRow.updated_at || resumeRow.created_at),
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
            return {
              ...r,
              ...summaryItem,
              // Never downgrade/upgrade optimization flag accidentally when current row is not truly optimized.
              optimizationStatus: isActuallyOptimized ? 'optimized' : (r?.optimizationStatus || 'unoptimized'),
              analyzed: isActuallyOptimized ? summaryItem.analyzed : (r?.analyzed ?? summaryItem.analyzed),
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
  }, [optimizedResumeId, resumeData, currentStep, setAllResumes]);
};
