import { useEffect, useState } from 'react';
import { DatabaseService } from '../../../../src/database-service';
import { supabase } from '../../../../src/supabase-client';
import { deriveLatestAnalysisStep } from '../../../../src/diagnosis-progress';
import type { ResumeData, ResumeSummary } from '../../../../types';
import { normalizeAnalysisMode } from '../analysis-mode';
import { resolveStep3TargetInputValue } from '../target-role';

export type ResumeReadState = {
  status: 'idle' | 'loading' | 'success' | 'error';
  message: string;
};

type Params = {
  allResumes: ResumeSummary[] | undefined;
  resumeData: ResumeData;
  setResumeData?: (v: ResumeData) => void;
  currentStep: string;
  setSelectedResumeId: (v: string | number | null) => void;
  sourceResumeIdRef: React.MutableRefObject<string | number | null>;
  setAnalysisResumeId: (v: string | number | null) => void;
  setJdText: (v: string) => void;
  setTargetCompany: (v: string) => void;
  navigateToStep: (v: any, replaceHistory?: boolean) => void;
  openChat?: (source: 'internal' | 'preview', options?: { skipRestore?: boolean }) => void;
  setOptimizedResumeId: (v: string | number | null) => void;
  applyAnalysisSnapshot: (snapshot: any) => boolean;
  saveLastAnalysis: (payload: {
    resumeId: string | number;
    jdText: string;
    targetCompany?: string;
    targetRole?: string;
    snapshot: any;
    updatedAt: string;
    analysisReportId?: string;
    optimizedResumeId?: string | number;
  }) => void;
  showToast: (msg: string, type?: 'info' | 'success' | 'error') => void;
  isSameResumeId: (a: any, b: any) => boolean;
  isInterviewMode?: boolean;
};

export const shouldRestoreJdInputFromResume = (
  preferReport: boolean,
  isInterviewMode?: boolean,
  inferredTarget?: 'jd_input' | 'interview_scene' | 'final_report'
) => {
  if (isInterviewMode) return false;
  if (preferReport) return true;
  return inferredTarget === 'final_report';
};

export const buildResumeDataForJdEntry = <T extends Record<string, any>>(
  rawResumeData: T,
  shouldRestoreJdFromResume: boolean
): T => (
  shouldRestoreJdFromResume
    ? rawResumeData
    : ({
      ...rawResumeData,
      lastJdText: '',
      targetCompany: '',
      targetRole: '',
    } as T)
);

export const buildResumeDataForEntry = <T extends Record<string, any>>(
  rawResumeData: T,
  options: { isInterviewMode?: boolean; shouldRestoreJdFromResume: boolean }
): T => {
  if (options.isInterviewMode) return rawResumeData;
  return buildResumeDataForJdEntry(rawResumeData, options.shouldRestoreJdFromResume);
};

const normalizeAnalysisStep = (step: any) => {
  const v = String(step || '').trim().toLowerCase();
  return [
    'jd_input',
    'interview_scene',
    'analyzing',
    'report',
    'chat',
    'interview_report',
    'comparison',
    'final_report',
  ].includes(v)
    ? v
    : '';
};

export const inferDiagnosisTargetStep = (
  resumeRow: any,
  fallbackResumeData: any,
  resumeSummary?: Partial<ResumeSummary> | null,
  explicit?: 'chat' | 'comparison' | 'final_report'
) => {
  void fallbackResumeData;
  if (explicit === 'final_report') return 'final_report';
  if (explicit === 'chat' || explicit === 'comparison') return 'final_report';

  const rawLatestStep =
    normalizeAnalysisStep((resumeSummary as any)?.latestAnalysisStep) ||
    normalizeAnalysisStep((resumeRow as any)?.latestAnalysisStep) ||
    normalizeAnalysisStep((resumeRow as any)?.resume_data?.latestAnalysisStep);
  if (rawLatestStep === 'final_report' || rawLatestStep === 'interview_report') return 'final_report';
  if (rawLatestStep === 'comparison' || rawLatestStep === 'report' || rawLatestStep === 'chat') return 'final_report';
  if (rawLatestStep === 'analyzing' || rawLatestStep === 'jd_input' || rawLatestStep === 'interview_scene') return 'jd_input';

  const rowSnapshotScore = Number((resumeRow as any)?.resume_data?.analysisSnapshot?.score || 0);
  const summarySnapshotScore = Number((resumeSummary as any)?.resume_data?.analysisSnapshot?.score || 0);
  const hasSnapshotScore = Number.isFinite(rowSnapshotScore) && rowSnapshotScore > 0
    || Number.isFinite(summarySnapshotScore) && summarySnapshotScore > 0;
  if (hasSnapshotScore) return 'final_report';

  const rowBindings = (resumeRow as any)?.resume_data?.analysisBindings;
  const summaryBindings = (resumeSummary as any)?.resume_data?.analysisBindings;
  if ((rowBindings && Object.keys(rowBindings).length > 0) || (summaryBindings && Object.keys(summaryBindings).length > 0)) {
    return 'final_report';
  }

  // Never infer target step from previously selected resume data.
  // Only use the clicked row / summary payload to avoid cross-resume contamination.
  const sessionsSource = (resumeRow as any)?.resume_data || (resumeSummary as any)?.resume_data || {};
  const sessionStep = normalizeAnalysisStep(deriveLatestAnalysisStep(sessionsSource));
  if (sessionStep === 'final_report' || sessionStep === 'interview_report') return 'final_report';
  if (sessionStep === 'comparison' || sessionStep === 'report' || sessionStep === 'chat') return 'final_report';
  if (sessionStep === 'analyzing' || sessionStep === 'jd_input' || sessionStep === 'interview_scene') return 'jd_input';

  const progress = Math.max(0, Math.min(100, Math.round(Number(
    (resumeSummary as any)?.diagnosisProgress ??
    (resumeRow as any)?.diagnosisProgress ??
    (resumeRow as any)?.resume_data?.diagnosisProgress ??
    0
  ))));
  if (progress >= 95) return 'final_report';
  if (progress >= 60) return 'final_report';
  return 'jd_input';
};

export const useResumeSelection = ({
  allResumes,
  resumeData,
  setResumeData,
  currentStep,
  setSelectedResumeId,
  sourceResumeIdRef,
  setAnalysisResumeId,
  setJdText,
  setTargetCompany,
  navigateToStep,
  openChat,
  setOptimizedResumeId,
  applyAnalysisSnapshot,
  saveLastAnalysis,
  showToast,
  isSameResumeId,
  isInterviewMode,
}: Params) => {
  const FORCE_JD_RESUME_ID_KEY = 'ai_force_jd_resume_id';
  const inferTargetStepFromResume = (resumeRow: any, explicit?: 'chat' | 'comparison' | 'final_report') => {
    const summary = (allResumes || []).find((item) => isSameResumeId(item?.id, (resumeRow as any)?.id));
    return inferDiagnosisTargetStep(resumeRow, resumeData, summary, explicit);
  };

  const [resumeReadState, setResumeReadState] = useState<ResumeReadState>({
    status: 'idle',
    message: '尚未读取简历，请先选择简历',
  });

  const handleResumeSelect = async (
    id: string | number,
    preferReport: boolean = false,
    targetStep?: 'chat' | 'comparison' | 'final_report'
  ) => {
    let effectivePreferReport = preferReport;
    try {
      const forcedResumeId = String(localStorage.getItem(FORCE_JD_RESUME_ID_KEY) || '').trim();
      if (forcedResumeId && String(id) === forcedResumeId) {
        effectivePreferReport = false;
        localStorage.removeItem(FORCE_JD_RESUME_ID_KEY);
      }
    } catch {
      // ignore storage failures
    }

    setSelectedResumeId(id);
    sourceResumeIdRef.current = id;
    setAnalysisResumeId(id);
    const selectedTitle = (allResumes || []).find((item) => isSameResumeId(item.id, id))?.title || '当前简历';
    setResumeReadState({
      status: 'loading',
      message: `正在读取《${selectedTitle}》...`,
    });

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        setResumeReadState({ status: 'error', message: '读取失败：用户未登录或登录已过期' });
        showToast('请先登录', 'error');
        return;
      }

      let resume: any = null;
      const single = await DatabaseService.getResume(id);
      if (single.success && single.data) {
        resume = single.data;
      } else {
        const result = await DatabaseService.getUserResumes(user.id);
        if (!result.success) {
          setResumeReadState({
            status: 'error',
            message: `读取失败：${result.error?.message || '加载简历失败'}`,
          });
          showToast(`加载简历失败: ${result.error?.message || '请重试'}`, 'error');
          return;
        }
        resume = result.data.find((r: any) => String(r.id) === String(id));
      }

      if (!resume && resumeData?.id && String(resumeData.id) === String(id)) {
        resume = {
          id: resumeData.id,
          title: allResumes?.find((r) => String(r.id) === String(id))?.title || '简历',
          resume_data: resumeData,
        };
      }

      if (!resume) {
        setResumeReadState({ status: 'error', message: `读取失败：未找到该简历（ID: ${id}）` });
        showToast(`简历不存在 (ID: ${id})`, 'error');
        return;
      }

      if (!resume.resume_data) {
        setResumeReadState({ status: 'error', message: '读取失败：简历内容为空' });
        showToast('简历数据为空，请重新创建简历', 'error');
        return;
      }

      if (typeof resume.resume_data === 'object' && Object.keys(resume.resume_data).length === 0) {
        setResumeReadState({ status: 'error', message: '读取失败：简历内容为空对象' });
        showToast('简历数据为空，请重新创建简历', 'error');
        return;
      }

      if (setResumeData) {
        const rawResumeData = {
          ...resume.resume_data,
          id: resume.id,
          resumeTitle: resume.title,
        };
        const inferredTarget = inferTargetStepFromResume(resume, targetStep);
        const shouldRestoreJdFromResume = shouldRestoreJdInputFromResume(
          effectivePreferReport,
          !!isInterviewMode,
          inferredTarget as 'jd_input' | 'interview_scene' | 'final_report'
        );
        const finalResumeData = buildResumeDataForEntry(rawResumeData as Record<string, any>, {
          isInterviewMode,
          shouldRestoreJdFromResume,
        });
        sourceResumeIdRef.current = finalResumeData.optimizedFromId || finalResumeData.id;
        setResumeData(finalResumeData as any);
        setResumeReadState({
          status: 'success',
          message: `已成功读取《${resume.title || selectedTitle}》`,
        });
        setOptimizedResumeId(
          (finalResumeData as any).optimizedResumeId ||
          ((finalResumeData as any).optimizationStatus === 'optimized' ? resume.id : null)
        );
        const restoredJdText = String((rawResumeData as any).lastJdText || '').trim();
        const restoredTargetRole = String((rawResumeData as any).targetRole || '').trim();
        const restoredStep3Target = resolveStep3TargetInputValue({
          isInterviewMode,
          analysisMode: normalizeAnalysisMode((rawResumeData as any).analysisMode),
          stateTargetCompany: '',
          resumeTargetCompany: '',
          resumeTargetRole: restoredTargetRole,
          resumeHasTargetRole: Object.prototype.hasOwnProperty.call((rawResumeData as any) || {}, 'targetRole'),
        });
        const restoredInterviewFocus = String((rawResumeData as any).interviewFocus || '').trim();
        if (isInterviewMode) {
          setJdText(restoredJdText);
          setTargetCompany(restoredStep3Target);
          try {
            const uid = String(user?.id || '').trim();
            if (uid) localStorage.setItem(`ai_interview_focus:${uid}`, restoredInterviewFocus);
            localStorage.setItem('ai_interview_focus', restoredInterviewFocus);
          } catch {
            // ignore storage failures
          }
        } else {
          if (shouldRestoreJdFromResume && restoredJdText) {
            setJdText(restoredJdText);
          } else if (!shouldRestoreJdFromResume) {
            setJdText('');
          }
          if (shouldRestoreJdFromResume && restoredStep3Target) {
            setTargetCompany(restoredStep3Target);
          } else if (!shouldRestoreJdFromResume) {
            setTargetCompany('');
          }
        }

        const shouldRestoreAnalysisContext = !!isInterviewMode || inferredTarget !== 'jd_input';
        if (shouldRestoreAnalysisContext) {
          applyAnalysisSnapshot((finalResumeData as any).analysisSnapshot);
          if ((finalResumeData as any).analysisSnapshot) {
            saveLastAnalysis({
              resumeId: resume.id,
              jdText: restoredJdText,
              targetCompany: String((finalResumeData as any).targetRole || ''),
              targetRole: String((finalResumeData as any).targetRole || ''),
              snapshot: (finalResumeData as any).analysisSnapshot,
              updatedAt: (finalResumeData as any).analysisSnapshot.updatedAt || new Date().toISOString(),
            });
            setAnalysisResumeId(resume.id);
          }
        }

        if (!isInterviewMode) {
          navigateToStep(inferredTarget);
        } else {
          navigateToStep('interview_scene');
        }
      }
    } catch (error) {
      console.error('Error loading resume:', error);
      setResumeReadState({
        status: 'error',
        message: '读取失败：网络异常或服务不可用',
      });
      showToast('加载简历失败，请检查网络连接', 'error');
    }
  };

  useEffect(() => {
    if (currentStep !== 'jd_input' && currentStep !== 'interview_scene') return;
    if (resumeReadState.status !== 'idle') return;
    if (!resumeData?.id) return;
    const fallbackLabel =
      (resumeData.resumeTitle || '').trim() ||
      ((resumeData.personalInfo?.name || '').trim() ? `${resumeData.personalInfo.name.trim()}的简历` : '当前简历');
    setResumeReadState({
      status: 'success',
      message: `已成功读取《${fallbackLabel}》`,
    });
  }, [currentStep, resumeData?.id, resumeData?.resumeTitle, resumeData?.personalInfo?.name, resumeReadState.status]);

  return {
    resumeReadState,
    setResumeReadState,
    handleResumeSelect,
  };
};
