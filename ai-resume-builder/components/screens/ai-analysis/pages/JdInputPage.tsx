import React from 'react';
import type { ResumeData, ResumeSummary } from '../../../../types';
import { makeJdKey } from '../id-utils';
import BackButton from '../../../shared/BackButton';
import { useAppContext } from '../../../../src/app-context';
import { USAGE_POINT_COST } from '../../../../src/points-config';
import { confirmDialog } from '../../../../src/ui/dialogs';

export type ResumeReadState = {
  status: 'idle' | 'loading' | 'success' | 'error';
  message: string;
};

export type JdInputPageProps = {
  allResumes: ResumeSummary[] | undefined;
  selectedResumeId: any;
  isSameResumeId: (a: any, b: any) => boolean;
  resumeData: ResumeData;
  resumeReadState: ResumeReadState;

  targetCompany: string;
  setTargetCompany: (v: string) => void;
  jdText: string;
  setJdText: (v: string) => void;

  isUploading: boolean;
  onScreenshotUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;

  onBack: () => void;
  onStart: (interviewType?: string) => void;
  onViewReport?: () => void;

  showJdEmptyModal: boolean;
  setShowJdEmptyModal: (v: boolean) => void;
  startAnalysis: (interviewType?: string) => void;
  onRestartCompletedInterviewScene?: () => Promise<void> | void;
  isInterviewMode?: boolean;
};

const JdInputPage: React.FC<JdInputPageProps> = ({
  allResumes,
  selectedResumeId,
  isSameResumeId,
  resumeData,
  resumeReadState,
  targetCompany,
  setTargetCompany,
  jdText,
  setJdText,
  isUploading,
  onScreenshotUpload,
  onBack,
  onStart,
  onViewReport,
  showJdEmptyModal,
  setShowJdEmptyModal,
  startAnalysis,
  onRestartCompletedInterviewScene,
  isInterviewMode,
}) => {
  const currentUser = useAppContext((s) => s.currentUser);
  const currentUserId = String(currentUser?.id || '').trim();
  const JD_MAX_CHARS = 1500;
  const INTERVIEW_TYPE_STORAGE_KEY = 'ai_interview_type';
  const INTERVIEW_MODE_STORAGE_KEY = 'ai_interview_mode';
  const INTERVIEW_FOCUS_STORAGE_KEY = 'ai_interview_focus';
  const getScopedKey = React.useCallback((baseKey: string) => {
    if (!currentUserId) return baseKey;
    return `${baseKey}:${currentUserId}`;
  }, [currentUserId]);
  const [interviewType, setInterviewType] = React.useState(() => {
    try {
      const scopedKey = currentUserId ? `${INTERVIEW_TYPE_STORAGE_KEY}:${currentUserId}` : INTERVIEW_TYPE_STORAGE_KEY;
      const saved = String(localStorage.getItem(scopedKey) || localStorage.getItem(INTERVIEW_TYPE_STORAGE_KEY) || '').trim().toLowerCase();
      if (saved === 'general' || saved === 'technical' || saved === 'hr') return saved;
    } catch {
      // ignore localStorage access errors
    }
    return 'general';
  });
  const [interviewMode, setInterviewMode] = React.useState<'simple' | 'comprehensive'>(() => {
    try {
      const scopedKey = currentUserId ? `${INTERVIEW_MODE_STORAGE_KEY}:${currentUserId}` : INTERVIEW_MODE_STORAGE_KEY;
      const saved = String(localStorage.getItem(scopedKey) || localStorage.getItem(INTERVIEW_MODE_STORAGE_KEY) || '').trim().toLowerCase();
      if (saved === 'simple' || saved === 'comprehensive') return saved as 'simple' | 'comprehensive';
    } catch {
      // ignore localStorage access errors
    }
    return 'comprehensive';
  });
  const [interviewFocus, setInterviewFocus] = React.useState(() => {
    try {
      const scopedKey = currentUserId ? `${INTERVIEW_FOCUS_STORAGE_KEY}:${currentUserId}` : INTERVIEW_FOCUS_STORAGE_KEY;
      return String(localStorage.getItem(scopedKey) || localStorage.getItem(INTERVIEW_FOCUS_STORAGE_KEY) || '').trim();
    } catch {
      return '';
    }
  });
  const resetInterviewSceneInputs = React.useCallback(() => {
    setInterviewFocus('');
    setTargetCompany('');
    setJdText('');
  }, [
    setJdText,
    setInterviewFocus,
    setTargetCompany,
  ]);

  React.useEffect(() => {
    if (!isInterviewMode) return;
    try {
      localStorage.setItem(getScopedKey(INTERVIEW_TYPE_STORAGE_KEY), interviewType);
      localStorage.setItem(INTERVIEW_TYPE_STORAGE_KEY, interviewType);
    } catch {
      // ignore localStorage access errors
    }
  }, [INTERVIEW_TYPE_STORAGE_KEY, getScopedKey, interviewType, isInterviewMode]);

  React.useEffect(() => {
    if (!isInterviewMode) return;
    try {
      localStorage.setItem(getScopedKey(INTERVIEW_MODE_STORAGE_KEY), interviewMode);
      localStorage.setItem(INTERVIEW_MODE_STORAGE_KEY, interviewMode);
    } catch {
      // ignore localStorage access errors
    }
  }, [INTERVIEW_MODE_STORAGE_KEY, getScopedKey, interviewMode, isInterviewMode]);

  React.useEffect(() => {
    if (!isInterviewMode) return;
    try {
      localStorage.setItem(getScopedKey(INTERVIEW_FOCUS_STORAGE_KEY), String(interviewFocus || '').trim());
      localStorage.setItem(INTERVIEW_FOCUS_STORAGE_KEY, String(interviewFocus || '').trim());
    } catch {
      // ignore localStorage access errors
    }
  }, [INTERVIEW_FOCUS_STORAGE_KEY, getScopedKey, interviewFocus, isInterviewMode]);

  const normalizeSceneText = React.useCallback((value: any) =>
    String(value || '').trim().toLowerCase().replace(/\s+/g, ' '), []);

  const isSessionMatchedForCurrentScene = React.useCallback((session: any) => {
    if (!session) return false;
    const effectiveJdText = String(jdText || '').trim();
    const effectiveJdKey = makeJdKey(effectiveJdText || '__no_jd__');
    const sessionJdKey =
      String(session?.jdKey || '').trim() ||
      makeJdKey(String(session?.jdText || '').trim() || '__no_jd__');
    if (sessionJdKey !== effectiveJdKey) return false;

    const normalizedMode = String(interviewMode || 'comprehensive').trim().toLowerCase();
    const normalizedType = String(interviewType || 'general').trim().toLowerCase();
    const normalizedFocus = normalizeSceneText(interviewFocus);
    const normalizedTargetCompany = normalizeSceneText(targetCompany || '');
    const normalizedResumeId = String((resumeData as any)?.id || '').trim();

    const sessionMode = String(session?.interviewMode || '').trim().toLowerCase();
    const sessionType = String(session?.interviewType || '').trim().toLowerCase();
    const sessionFocus = normalizeSceneText(session?.interviewFocus);
    const sessionCompany = normalizeSceneText(session?.targetCompany);
    const sessionResumeId = String(session?.resumeId || '').trim();
    return (
      sessionMode === normalizedMode &&
      sessionType === normalizedType &&
      sessionFocus === normalizedFocus &&
      sessionCompany === normalizedTargetCompany &&
      (!sessionResumeId || sessionResumeId === normalizedResumeId)
    );
  }, [jdText, resumeData, interviewMode, interviewType, interviewFocus, targetCompany, normalizeSceneText]);

  const shouldShowContinueInterview = React.useMemo(() => {
    if (!isInterviewMode) return false;
    const sessions = (resumeData as any)?.interviewSessions || {};
    const analysisSessionByJd = (resumeData as any)?.analysisSessionByJd || {};
    const hasDoneReportInCurrentScene = Object.values(analysisSessionByJd || {}).some((session: any) => {
      if (!session) return false;
      if (!isSessionMatchedForCurrentScene(session)) return false;
      const state = String(session?.state || '').trim().toLowerCase();
      const step = String(session?.step || '').trim().toLowerCase();
      return state === 'interview_done' && (step === 'interview_report' || step === 'final_report');
    });
    // If report is already generated for this scene, treat next start as a fresh run,
    // so JD-empty prompt should still appear.
    if (hasDoneReportInCurrentScene) return false;
    return Object.values(analysisSessionByJd || {}).some((session: any) => {
      if (!session) return false;
      const state = String(session?.state || '').toLowerCase();
      if (state !== 'interview_in_progress' && state !== 'paused') return false;
      if (!isSessionMatchedForCurrentScene(session)) return false;
      return true;
    }) || Object.values(sessions || {}).some((session: any) => {
      if (!session) return false;
      const chatMode = String(session?.chatMode || '').trim().toLowerCase();
      if (chatMode !== 'interview') return false;
      if (!isSessionMatchedForCurrentScene(session)) return false;
      return Array.isArray(session?.messages) && session.messages.length > 0;
    });
  }, [isInterviewMode, resumeData, isSessionMatchedForCurrentScene]);

  const shouldShowViewReport = React.useMemo(() => {
    if (!isInterviewMode) return false;
    const analysisSessionByJd = (resumeData as any)?.analysisSessionByJd || {};
    return Object.values(analysisSessionByJd || {}).some((session: any) => {
      if (!session) return false;
      if (!isSessionMatchedForCurrentScene(session)) return false;
      const state = String(session?.state || '').trim().toLowerCase();
      const step = String(session?.step || '').trim().toLowerCase();
      return state === 'interview_done' && (step === 'interview_report' || step === 'final_report');
    });
  }, [isInterviewMode, resumeData, isSessionMatchedForCurrentScene]);

  const isInterviewSceneLocked = React.useMemo(() => {
    if (!isInterviewMode) return false;
    // Finished interview scenes should remain editable so user can adjust settings
    // before starting a new interview run.
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
  }, [isInterviewMode, resumeData, isSessionMatchedForCurrentScene, shouldShowViewReport]);

  const persistInterviewSceneConfig = React.useCallback(() => {
    if (!isInterviewMode) return;
    try {
      localStorage.setItem(getScopedKey(INTERVIEW_TYPE_STORAGE_KEY), interviewType);
      localStorage.setItem(INTERVIEW_TYPE_STORAGE_KEY, interviewType);
      localStorage.setItem(getScopedKey(INTERVIEW_MODE_STORAGE_KEY), interviewMode);
      localStorage.setItem(INTERVIEW_MODE_STORAGE_KEY, interviewMode);
      localStorage.setItem(getScopedKey(INTERVIEW_FOCUS_STORAGE_KEY), String(interviewFocus || '').trim());
      localStorage.setItem(INTERVIEW_FOCUS_STORAGE_KEY, String(interviewFocus || '').trim());
    } catch {
      // ignore localStorage access errors
    }
  }, [
    INTERVIEW_FOCUS_STORAGE_KEY,
    INTERVIEW_MODE_STORAGE_KEY,
    INTERVIEW_TYPE_STORAGE_KEY,
    getScopedKey,
    interviewFocus,
    interviewMode,
    interviewType,
    isInterviewMode,
  ]);

  const selectedResumeLabel = (() => {
    const selected = (allResumes || []).find((item) => isSameResumeId(item.id, selectedResumeId));
    if (selected?.title) return selected.title;
    if (resumeData?.resumeTitle) return resumeData.resumeTitle;
    const name = (resumeData?.personalInfo?.name || '').trim();
    if (name) return `${name}的简历`;
    return '无';
  })();
  const startButtonLabel = (() => {
    if (!isInterviewMode) return `开始诊断（${USAGE_POINT_COST.analysis}积分）`;
    if (shouldShowContinueInterview) return '继续面试';
    const interviewCost = interviewMode === 'simple'
      ? USAGE_POINT_COST.interview_simple
      : USAGE_POINT_COST.interview_comprehensive;
    return `开始面试（${interviewCost}积分）`;
  })();

  const statusTone = (() => {
    if (resumeReadState.status === 'success') {
      return {
        bg: 'bg-emerald-50/50 dark:bg-emerald-500/5',
        border: 'border-emerald-100 dark:border-emerald-500/20',
        text: 'text-emerald-700 dark:text-emerald-400',
        icon: 'check_circle',
        badge: '已就绪'
      };
    }
    if (resumeReadState.status === 'loading') {
      return {
        bg: 'bg-blue-50/50 dark:bg-blue-500/5',
        border: 'border-blue-100 dark:border-blue-500/20',
        text: 'text-blue-700 dark:text-blue-400',
        icon: 'sync',
        badge: '读取中'
      };
    }
    if (resumeReadState.status === 'error') {
      return {
        bg: 'bg-rose-50/50 dark:bg-rose-500/5',
        border: 'border-rose-100 dark:border-rose-500/20',
        text: 'text-rose-700 dark:text-rose-400',
        icon: 'error',
        badge: '读取失败'
      };
    }
    return {
      bg: 'bg-slate-50/50 dark:bg-slate-500/5',
      border: 'border-slate-100 dark:border-slate-500/20',
      text: 'text-slate-600 dark:text-slate-400',
      icon: 'info',
      badge: '初始化'
    };
  })();

  const statusMessage =
    resumeReadState.status === 'idle'
      ? `尚未读取简历，请先返回上一步选择简历`
      : resumeReadState.message;

  return (
    <div className="flex flex-col min-h-screen bg-background-light dark:bg-background-dark animate-in slide-in-from-right duration-300">
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-white/5">
        <div className="flex items-center justify-between h-14 px-4 relative">
          <BackButton onClick={onBack} className="-ml-2" />
          <h1 className="text-lg font-bold tracking-tight">
            {isInterviewMode ? '设置面试场景' : '添加职位描述'}
          </h1>
          <div className="w-10" />
        </div>
      </header>

      <main className="pt-[72px] p-4 pb-[calc(5.75rem+env(safe-area-inset-bottom))] flex flex-col gap-6">
        <div className={`p-4 rounded-2xl border transition-all duration-300 ${statusTone.bg} ${statusTone.border} shadow-sm`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`size-10 rounded-full flex items-center justify-center ${statusTone.bg} ${statusTone.border}`}>
                <span className={`material-symbols-outlined ${statusTone.text}`}>description</span>
              </div>
              <div className="flex flex-col">
                <h4 className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">{isInterviewMode ? '面试简历' : '当前诊断简历'}</h4>
                <p className="text-sm font-black text-slate-900 dark:text-white mt-0.5 line-clamp-1">{selectedResumeLabel}</p>
              </div>
            </div>
            <div className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1 shrink-0 ${statusTone.bg} ${statusTone.border} ${statusTone.text}`}>
              <span className={`material-symbols-outlined text-[14px] ${resumeReadState.status === 'loading' ? 'animate-spin' : ''}`}>{statusTone.icon}</span>
              <span className="whitespace-nowrap">{statusTone.badge}</span>
            </div>
          </div>
          {resumeReadState.status !== 'success' && (
            <p className={`mt-3 text-xs leading-relaxed ${statusTone.text}`}>
              {statusMessage}
            </p>
          )}
        </div>

        <div className="bg-white dark:bg-surface-dark p-5 rounded-2xl shadow-md border border-slate-200 dark:border-white/5">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-primary">{isInterviewMode ? 'forum' : 'description'}</span>
            <h3 className="font-bold text-slate-900 dark:text-white">{isInterviewMode ? '面试场景设置' : '职位描述'}</h3>
          </div>

          {isInterviewMode && (
            <div className="mb-4">
              <label className="text-xs font-bold text-slate-600 dark:text-text-secondary uppercase tracking-wider">面试类型</label>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {[
                  { id: 'general', label: '初试-基础面', icon: 'person' },
                  { id: 'technical', label: '复试-项目深挖', icon: 'code' },
                  { id: 'hr', label: 'HR面-文化匹配', icon: 'groups' }
                ].map((type) => (
                  <button
                    key={type.id}
                    onClick={() => setInterviewType(type.id)}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all ${interviewType === type.id
                      ? 'bg-primary/10 border-primary text-primary'
                      : 'bg-slate-50 dark:bg-white/5 border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10'
                      }`}
                    type="button"
                  >
                    <span className="material-symbols-outlined mb-1">{type.icon}</span>
                    <span className="text-xs font-bold">{type.label}</span>
                  </button>
                ))}
              </div>

              <div className="mt-4">
                <label className="text-xs font-bold text-slate-600 dark:text-text-secondary uppercase tracking-wider">面试模式</label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {[
                    { id: 'simple', label: '简单', desc: '3个问题，快速练习' },
                    { id: 'comprehensive', label: '全面', desc: '完整题单，深度模拟' },
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      onClick={() => setInterviewMode(mode.id as 'simple' | 'comprehensive')}
                      className={`flex flex-col items-start justify-center p-3 rounded-xl border transition-all ${interviewMode === mode.id
                        ? 'bg-primary/10 border-primary text-primary'
                        : 'bg-slate-50 dark:bg-white/5 border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10'
                        }`}
                      type="button"
                    >
                      <span className="text-xs font-bold">{mode.label}</span>
                      <span className="text-[11px] opacity-80 mt-0.5">{mode.desc}</span>
                    </button>
                  ))}
                </div>
                {isInterviewSceneLocked && (
                  <div className="mt-3 p-3 rounded-xl border border-amber-200/50 dark:border-amber-400/20 bg-amber-50/50 dark:bg-amber-400/5 flex gap-2.5 animate-in fade-in slide-in-from-top-2 duration-300">
                    <span className="material-symbols-outlined text-amber-500 text-[18px] shrink-0 mt-0.5">lock</span>
                    <p className="text-[11px] leading-relaxed font-bold text-amber-700/80 dark:text-amber-400/80">
                      当前面试已开始，已锁定目标公司/岗位、职位描述和训练重点。如需修改，请切换为新场景、另一个模式或在面试对话框右上角点击“重新开始”。
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-4">
                <label className="text-xs font-bold text-slate-600 dark:text-text-secondary uppercase tracking-wider">自定义训练重点（可选）</label>
                <textarea
                  value={interviewFocus}
                  onChange={(e) => setInterviewFocus((e.target.value || '').slice(0, 200))}
                  placeholder="例如：重点追问项目量化结果、系统设计深挖、反问环节训练..."
                  className="mt-2 w-full h-20 rounded-xl bg-white dark:bg-[#111a22] border border-slate-300 dark:border-[#324d67] p-3 text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none resize-none text-sm shadow-sm"
                  maxLength={200}
                  disabled={isInterviewSceneLocked}
                />
                <div className="mt-1 text-right text-[11px] text-slate-500 dark:text-slate-400">
                  {interviewFocus.length}/200
                </div>
              </div>
            </div>
          )}

          <div className="mb-3">
            <label className="text-xs font-bold text-slate-600 dark:text-text-secondary uppercase tracking-wider">{isInterviewMode ? '目标公司 / 岗位' : '目标公司（可选）'}</label>
            <input
              value={targetCompany}
              onChange={(e) => setTargetCompany(e.target.value)}
              placeholder="例如：字节跳动 / 腾讯"
              className="mt-2 w-full rounded-xl bg-white dark:bg-[#111a22] border border-slate-300 dark:border-[#324d67] p-3 text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all text-sm shadow-sm"
              type="text"
              disabled={isInterviewSceneLocked}
            />
          </div>
          <div className="mb-3">
            <label className="text-xs font-bold text-slate-600 dark:text-text-secondary uppercase tracking-wider">职位描述内容</label>
            <textarea
              value={jdText}
              onChange={(e) => setJdText((e.target.value || '').slice(0, JD_MAX_CHARS))}
              placeholder={isInterviewMode ? "请输入目标岗位的职位描述内容，AI 将基于此进行针对性的模拟面试提问..." : "请粘贴目标职位的职位描述内容，AI 将为您进行针对性的人岗匹配分析..."}
              className="mt-2 w-full h-56 rounded-xl bg-white dark:bg-[#111a22] border border-slate-300 dark:border-transparent p-4 text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-primary outline-none resize-none text-sm leading-relaxed shadow-sm"
              maxLength={JD_MAX_CHARS}
              disabled={isInterviewSceneLocked}
            />
            <div className="mt-1 text-right text-xs text-slate-500 dark:text-slate-400">
              {jdText.length}/{JD_MAX_CHARS}
            </div>
          </div>

          <div className="mt-3">
            <button
              onClick={() => !isUploading && document.getElementById('jd-screenshot-upload')?.click()}
              disabled={isUploading || isInterviewSceneLocked}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-50 dark:hover:bg-[#111a22] transition-all disabled:opacity-70 disabled:cursor-not-allowed"
              type="button"
            >
              {isUploading ? (
                <span className="size-4 border-2 border-slate-400 border-t-primary rounded-full animate-spin" />
              ) : (
                <span className="material-symbols-outlined text-[20px]">image</span>
              )}
              <span className="text-sm">{isUploading ? '正在解析...' : '上传职位描述截图'}</span>
            </button>

            <input
              type="file"
              id="jd-screenshot-upload"
              accept="image/*"
              onChange={onScreenshotUpload}
              className="hidden"
            />
          </div>
        </div>

        <div className="sticky bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-30 flex gap-3 mt-2">
          {isInterviewMode && shouldShowViewReport && (
            <button
              onClick={() => {
                persistInterviewSceneConfig();
                onViewReport?.();
              }}
              className="flex-1 py-3 rounded-xl border border-primary/30 text-primary text-sm font-bold hover:bg-primary/5 active:scale-[0.98] transition-all bg-white/95 dark:bg-background-dark/95 backdrop-blur-sm"
              type="button"
            >
              查看报告
            </button>
          )}
          <button
            onClick={async () => {
              persistInterviewSceneConfig();
              if (isInterviewMode && shouldShowViewReport && !shouldShowContinueInterview) {
                const confirmed = await confirmDialog('当前面试已结束并生成报告，请及时保存。重新开始面试会清空报告，确认继续吗？');
                if (!confirmed) return;
                await onRestartCompletedInterviewScene?.();
                resetInterviewSceneInputs();
              }
              const shouldBypassJdEmptyPrompt = Boolean(isInterviewMode && shouldShowContinueInterview);
              if (shouldBypassJdEmptyPrompt) {
                void startAnalysis(interviewType);
                return;
              }
              onStart(isInterviewMode ? interviewType : undefined);
            }}
            className={`${isInterviewMode && shouldShowViewReport ? 'flex-1' : 'w-full'} py-3 rounded-xl bg-primary text-white text-sm font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-600 active:scale-[0.98] transition-all`}
            type="button"
          >
            {startButtonLabel}
          </button>
        </div>

        {showJdEmptyModal && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="w-full max-w-sm bg-white dark:bg-[#1c2936] rounded-[28px] shadow-[0_20px_50px_rgba(0,0,0,0.3)] overflow-hidden border border-slate-100 dark:border-white/5 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
              <div className="p-8 pb-6">
                <div className="flex flex-col items-center text-center">
                  <div className="size-16 rounded-3xl bg-amber-50 dark:bg-amber-400/10 flex items-center justify-center mb-6 rotate-2 transform transition-transform hover:rotate-0 duration-300">
                    <span className="material-symbols-outlined text-amber-500 text-[36px]">warning</span>
                  </div>
                  <h3 className="text-xl font-black text-slate-900 dark:text-white mb-3 tracking-tight">缺少职位描述</h3>
                  <p className="text-[15px] font-medium text-slate-500 dark:text-slate-400 leading-relaxed px-2">
                    {isInterviewMode
                      ? '您未填写职位描述，无法生成针对性的模拟面试题。是否坚持继续通用面试？'
                      : '您未填写职位描述，无法进行岗位定向匹配。是否坚持继续通用诊断？'}
                  </p>
                </div>
              </div>
              <div className="p-6 pt-0 flex flex-col gap-3">
                <button
                  onClick={() => {
                    setShowJdEmptyModal(false);
                    startAnalysis(isInterviewMode ? interviewType : undefined);
                  }}
                  className="w-full h-12 rounded-2xl bg-amber-500 text-white text-sm font-bold shadow-lg shadow-amber-500/25 hover:bg-amber-600 transition-all active:scale-95 flex items-center justify-center"
                >
                  {isInterviewMode ? '坚持进入面试' : '坚持继续诊断'}
                </button>
                <button
                  onClick={() => setShowJdEmptyModal(false)}
                  className="w-full h-12 rounded-2xl text-sm font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-all active:scale-95"
                >
                  返回填写职位描述
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default JdInputPage;
