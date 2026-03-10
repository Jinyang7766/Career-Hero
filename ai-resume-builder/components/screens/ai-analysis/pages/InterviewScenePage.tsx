import React from 'react';
import type { ResumeData } from '../../../../types';
import { makeJdKey } from '../id-utils';
import BackButton from '../../../shared/BackButton';
import { useAppContext } from '../../../../src/app-context';
import { USAGE_POINT_COST } from '../../../../src/points-config';
import { confirmDialog } from '../../../../src/ui/dialogs';
import AutoGrowTextarea from '../../../editor/AutoGrowTextarea';

export type InterviewScenePageProps = {
  resumeData: ResumeData;
  jdText: string;
  targetCompany: string;
  onBack: () => void;
  onStart: (
    interviewType?: string,
    options?: {
      action?: 'reuse_existing' | 'regenerate';
      forceRegenerate?: boolean;
    }
  ) => Promise<void> | void;
  onViewReport?: () => void;
  startAnalysis: (interviewType?: string) => Promise<void> | void;
  onRestartCompletedInterviewScene?: () => Promise<void> | void;
  interviewEntryConfirmPendingRef?: React.MutableRefObject<boolean>;
};

const normalizeSceneText = (value: any) =>
  String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

const normalizeInterviewType = (value: any): 'general' | 'technical' | 'pressure' => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'technical') return 'technical';
  if (normalized === 'pressure' || normalized === 'hr') return 'pressure';
  return 'general';
};

const InterviewScenePage: React.FC<InterviewScenePageProps> = ({
  resumeData,
  jdText,
  targetCompany,
  onBack,
  onStart,
  onViewReport,
  startAnalysis,
  onRestartCompletedInterviewScene,
  interviewEntryConfirmPendingRef,
}) => {
  const currentUser = useAppContext((s) => s.currentUser);
  const currentUserId = String(currentUser?.id || '').trim();
  const INTERVIEW_TYPE_STORAGE_KEY = 'ai_interview_type';
  const INTERVIEW_FOCUS_STORAGE_KEY = 'ai_interview_focus';

  const getScopedKey = React.useCallback((baseKey: string) => {
    if (!currentUserId) return baseKey;
    return `${baseKey}:${currentUserId}`;
  }, [currentUserId]);

  const [interviewType, setInterviewType] = React.useState(() => {
    try {
      const scopedKey = currentUserId ? `${INTERVIEW_TYPE_STORAGE_KEY}:${currentUserId}` : INTERVIEW_TYPE_STORAGE_KEY;
      const saved = String(localStorage.getItem(scopedKey) || localStorage.getItem(INTERVIEW_TYPE_STORAGE_KEY) || '').trim().toLowerCase();
      if (saved) return normalizeInterviewType(saved);
    } catch {
      // ignore localStorage access errors
    }
    return 'general';
  });
  const [interviewFocus, setInterviewFocus] = React.useState(() => {
    try {
      const scopedKey = currentUserId ? `${INTERVIEW_FOCUS_STORAGE_KEY}:${currentUserId}` : INTERVIEW_FOCUS_STORAGE_KEY;
      return String(localStorage.getItem(scopedKey) || localStorage.getItem(INTERVIEW_FOCUS_STORAGE_KEY) || '').trim();
    } catch {
      return '';
    }
  });
  const [isStarting, setIsStarting] = React.useState(false);

  const effectiveJdText = React.useMemo(
    () => String(jdText || (resumeData as any)?.lastJdText || '').trim(),
    [jdText, resumeData]
  );
  const effectiveTarget = React.useMemo(
    () => String(targetCompany || (resumeData as any)?.targetRole || (resumeData as any)?.targetCompany || '').trim(),
    [resumeData, targetCompany]
  );

  React.useEffect(() => {
    try {
      localStorage.setItem(getScopedKey(INTERVIEW_TYPE_STORAGE_KEY), interviewType);
      localStorage.setItem(INTERVIEW_TYPE_STORAGE_KEY, interviewType);
    } catch {
      // ignore localStorage access errors
    }
  }, [INTERVIEW_TYPE_STORAGE_KEY, getScopedKey, interviewType]);

  React.useEffect(() => {
    try {
      localStorage.setItem(getScopedKey(INTERVIEW_FOCUS_STORAGE_KEY), String(interviewFocus || '').trim());
      localStorage.setItem(INTERVIEW_FOCUS_STORAGE_KEY, String(interviewFocus || '').trim());
    } catch {
      // ignore localStorage access errors
    }
  }, [INTERVIEW_FOCUS_STORAGE_KEY, getScopedKey, interviewFocus]);

  const isSessionMatchedForCurrentScene = React.useCallback((session: any) => {
    if (!session) return false;
    const effectiveJdKey = makeJdKey(effectiveJdText || '__no_jd__');
    const sessionJdKey =
      String(session?.jdKey || '').trim() ||
      makeJdKey(String(session?.jdText || '').trim() || '__no_jd__');
    if (sessionJdKey !== effectiveJdKey) return false;

    const normalizedType = normalizeInterviewType(interviewType);
    const normalizedFocus = normalizeSceneText(interviewFocus);
    const normalizedTarget = normalizeSceneText(effectiveTarget);
    const normalizedResumeId = String((resumeData as any)?.id || '').trim();

    const sessionType = normalizeInterviewType(session?.interviewType || '');
    const sessionFocus = normalizeSceneText(session?.interviewFocus);
    const sessionTarget = normalizeSceneText(session?.targetRole || session?.targetCompany);
    const sessionResumeId = String(session?.resumeId || '').trim();
    return (
      sessionType === normalizedType &&
      sessionFocus === normalizedFocus &&
      sessionTarget === normalizedTarget &&
      (!sessionResumeId || sessionResumeId === normalizedResumeId)
    );
  }, [effectiveJdText, effectiveTarget, interviewType, interviewFocus, resumeData]);

  const shouldShowContinueInterview = React.useMemo(() => {
    const sessions = (resumeData as any)?.interviewSessions || {};
    const analysisSessionByJd = (resumeData as any)?.analysisSessionByJd || {};
    const hasDoneReportInCurrentScene = Object.values(analysisSessionByJd || {}).some((session: any) => {
      if (!session) return false;
      if (!isSessionMatchedForCurrentScene(session)) return false;
      const state = String(session?.state || '').trim().toLowerCase();
      const step = String(session?.step || '').trim().toLowerCase();
      return state === 'interview_done' && (step === 'interview_report' || step === 'final_report');
    });
    if (hasDoneReportInCurrentScene) return false;
    return Object.values(analysisSessionByJd || {}).some((session: any) => {
      if (!session) return false;
      const state = String(session?.state || '').toLowerCase();
      if (state !== 'interview_in_progress' && state !== 'paused') return false;
      return isSessionMatchedForCurrentScene(session);
    }) || Object.values(sessions || {}).some((session: any) => {
      if (!session) return false;
      const chatMode = String(session?.chatMode || '').trim().toLowerCase();
      if (chatMode !== 'interview') return false;
      if (!isSessionMatchedForCurrentScene(session)) return false;
      return Array.isArray(session?.messages) && session.messages.length > 0;
    });
  }, [isSessionMatchedForCurrentScene, resumeData]);

  const shouldShowViewReport = React.useMemo(() => {
    const analysisSessionByJd = (resumeData as any)?.analysisSessionByJd || {};
    return Object.values(analysisSessionByJd || {}).some((session: any) => {
      if (!session) return false;
      if (!isSessionMatchedForCurrentScene(session)) return false;
      const state = String(session?.state || '').trim().toLowerCase();
      const step = String(session?.step || '').trim().toLowerCase();
      return state === 'interview_done' && (step === 'interview_report' || step === 'final_report');
    });
  }, [isSessionMatchedForCurrentScene, resumeData]);

  const isInterviewSceneLocked = React.useMemo(() => {
    if (shouldShowViewReport) return false;
    const sessions = (resumeData as any)?.interviewSessions || {};
    const analysisSessionByJd = (resumeData as any)?.analysisSessionByJd || {};
    const hasStartedByChat = Object.values(sessions || {}).some((session: any) => {
      if (!session) return false;
      const chatMode = String(session?.chatMode || '').trim().toLowerCase();
      if (chatMode !== 'interview') return false;
      if (!isSessionMatchedForCurrentScene(session)) return false;
      return Array.isArray(session?.messages) && session.messages.length > 0;
    });
    if (hasStartedByChat) return true;
    return Object.values(analysisSessionByJd || {}).some((session: any) => {
      if (!session) return false;
      if (!isSessionMatchedForCurrentScene(session)) return false;
      const state = String(session?.state || '').toLowerCase();
      return state === 'interview_in_progress' || state === 'paused';
    });
  }, [isSessionMatchedForCurrentScene, resumeData, shouldShowViewReport]);

  const persistInterviewSceneConfig = React.useCallback(() => {
    try {
      localStorage.setItem(getScopedKey(INTERVIEW_TYPE_STORAGE_KEY), interviewType);
      localStorage.setItem(INTERVIEW_TYPE_STORAGE_KEY, interviewType);
      localStorage.removeItem(getScopedKey('ai_interview_mode'));
      localStorage.removeItem('ai_interview_mode');
      localStorage.setItem(getScopedKey(INTERVIEW_FOCUS_STORAGE_KEY), String(interviewFocus || '').trim());
      localStorage.setItem(INTERVIEW_FOCUS_STORAGE_KEY, String(interviewFocus || '').trim());
    } catch {
      // ignore localStorage access errors
    }
  }, [
    INTERVIEW_FOCUS_STORAGE_KEY,
    INTERVIEW_TYPE_STORAGE_KEY,
    getScopedKey,
    interviewFocus,
    interviewType,
  ]);

  const startButtonLabel = (() => {
    if (shouldShowContinueInterview) return '继续面试';
    const interviewCost = USAGE_POINT_COST.interview;
    return `开始面试（${interviewCost}积分）`;
  })();

  const interviewTypeOptions: Array<{
    id: 'general' | 'technical' | 'pressure';
    label: string;
    icon: string;
  }> = [
      { id: 'general', label: '初试-基础面', icon: 'person' },
      { id: 'technical', label: '复试-项目深挖', icon: 'code' },
      { id: 'pressure', label: '压力面', icon: 'groups' },
    ];

  return (
    <div className="flex flex-col min-h-screen bg-background-light dark:bg-background-dark">
      <header className="fixed top-0 left-0 right-0 mx-auto w-full max-w-md z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200/60 dark:border-white/5">
        <div className="flex items-center justify-between h-14 px-4 relative">
          <BackButton onClick={onBack} />
          <h1 className="absolute inset-0 flex items-center justify-center text-lg font-bold tracking-tight text-slate-900 dark:text-white pointer-events-none">设置面试场景</h1>
          <div className="w-10" />
        </div>
      </header>

      <main className="pt-[72px] p-4 pb-[calc(5.75rem+env(safe-area-inset-bottom))] flex flex-col gap-6 max-w-md mx-auto w-full">
        <div className="bg-white dark:bg-surface-dark p-5 rounded-2xl shadow-sm border border-slate-200/60 dark:border-white/5">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 text-primary">
              <span className="material-symbols-outlined text-[18px]">forum</span>
            </div>
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-200">面试场景设置</h3>
          </div>

          <div className="mb-5 p-4 rounded-xl border border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02]">
            <p className="text-[10px] font-black tracking-widest text-slate-400 dark:text-slate-500 uppercase mb-2">当前面试上下文</p>
            <p className="text-sm font-bold text-slate-900 dark:text-white line-clamp-1 leading-tight">
              {effectiveTarget || '通用面试（未指定岗位）'}
            </p>
            <p className="mt-2 text-[12px] text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2">
              {effectiveJdText ? `已关联 JD：${effectiveJdText}` : '未关联 JD：将基于职业画像进行通用面试提问。'}
            </p>
          </div>

          <div className="mb-5">
            <label className="text-[11px] font-black tracking-widest text-slate-500 dark:text-slate-400 uppercase block mb-3">面试类型</label>
            <div className="grid grid-cols-3 gap-2">
              {interviewTypeOptions.map((type) => (
                <button
                  key={type.id}
                  onClick={() => setInterviewType(type.id)}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${interviewType === type.id
                    ? 'bg-primary/5 border-primary/40 text-primary'
                    : 'bg-slate-50 dark:bg-white/5 border-transparent text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10'
                    }`}
                  type="button"
                  disabled={isInterviewSceneLocked}
                >
                  <span className="material-symbols-outlined mb-1 text-[22px]">{type.icon}</span>
                  <span className="text-[11px] font-bold">{type.label}</span>
                </button>
              ))}
            </div>
          </div>

          {isInterviewSceneLocked && (
            <div className="mb-5 p-3.5 rounded-xl border border-amber-100 dark:border-amber-400/20 bg-amber-50/50 dark:bg-amber-400/5 flex gap-2.5">
              <span className="material-symbols-outlined text-amber-500 text-[18px] shrink-0">lock</span>
              <p className="text-[11px] leading-relaxed font-bold text-amber-700/80 dark:text-amber-400/80">
                当前面试已开始，场景配置已锁定。若需调整，请先结束本轮并重新开始新场景。
              </p>
            </div>
          )}

          <div>
            <label className="text-[11px] font-black tracking-widest text-slate-500 dark:text-slate-400 uppercase block mb-3">自定义训练重点（可选）</label>
            <AutoGrowTextarea
              value={interviewFocus}
              onChange={(e) => setInterviewFocus((e.target.value || '').slice(0, 200))}
              placeholder="例如：重点追问项目量化结果、系统设计深挖、反问环节训练..."
              className="w-full bg-slate-50 dark:bg-slate-800/50 rounded-xl px-4 py-3 text-sm border-2 border-slate-100 dark:border-white/5 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all outline-none placeholder:text-slate-400 resize-none min-h-[100px] leading-relaxed"
              maxLength={200}
              disabled={isInterviewSceneLocked}
              minRows={3}
            />
            <div className="mt-1 text-right text-[10px] font-bold text-slate-400 dark:text-slate-500 tabular-nums">
              {interviewFocus.length}/200
            </div>
          </div>
        </div>

        <div className="sticky bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-30 flex gap-3 mt-2">
          <button
            onClick={() => {
              if (!shouldShowViewReport) return;
              persistInterviewSceneConfig();
              onViewReport?.();
            }}
            disabled={!shouldShowViewReport}
            className={`flex-1 h-12 rounded-xl border text-sm font-bold transition-all backdrop-blur-md ${shouldShowViewReport
              ? 'border-primary/30 text-primary hover:bg-primary/5 active:scale-[0.98] bg-white/95 dark:bg-slate-900/95 shadow-sm'
              : 'border-slate-200 dark:border-white/10 text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-white/5 cursor-not-allowed'
              }`}
            type="button"
          >
            查看报告
          </button>
          <button
            onClick={async () => {
              if (isStarting) return;
              setIsStarting(true);
              try {
                persistInterviewSceneConfig();
                if (shouldShowViewReport && !shouldShowContinueInterview) {
                  if (interviewEntryConfirmPendingRef) {
                    interviewEntryConfirmPendingRef.current = true;
                  }
                  let confirmed = false;
                  try {
                    confirmed = await confirmDialog('当前面试已结束并生成报告，重新开始面试会清空旧报告，确认继续吗？');
                  } finally {
                    if (interviewEntryConfirmPendingRef) {
                      interviewEntryConfirmPendingRef.current = false;
                    }
                  }
                  if (!confirmed) return;
                  await onRestartCompletedInterviewScene?.();
                }
                const shouldBypassJdEmptyPrompt = Boolean(shouldShowContinueInterview);
                if (shouldBypassJdEmptyPrompt) {
                  await startAnalysis(interviewType);
                  return;
                }
                await onStart(interviewType);
              } finally {
                setIsStarting(false);
              }
            }}
            disabled={isStarting}
            className="flex-1 h-12 rounded-xl bg-primary text-white text-sm font-bold shadow-lg shadow-primary/25 hover:bg-blue-600 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            type="button"
          >
            {isStarting ? (
              <>
                <span className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                <span>{shouldShowContinueInterview ? '正在进入...' : '开始中...'}</span>
              </>
            ) : (
              startButtonLabel
            )}
          </button>
        </div>
      </main>
    </div>
  );
};

export default InterviewScenePage;
