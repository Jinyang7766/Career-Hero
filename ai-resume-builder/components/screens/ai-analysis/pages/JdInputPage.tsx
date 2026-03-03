import React from 'react';
import type { ResumeData } from '../../../../types';
import BackButton from '../../../shared/BackButton';
import { USAGE_POINT_COST } from '../../../../src/points-config';
import {
  getAnalysisModeLabel,
  type AnalysisMode,
} from '../analysis-mode';
import { hasReusableAnalysisResultForJd } from '../analysis-reuse';
import {
  getStep3TargetFieldLabel,
  getStep3TargetFieldPlaceholder,
  isTargetRoleMissing,
  isTargetedJdMissing,
  shouldShowJdSection,
} from '../step3-ui';
import AutoGrowTextarea from '../../../editor/AutoGrowTextarea';


export type JdInputPageProps = {
  resumeData: ResumeData;

  targetCompany: string;
  setTargetCompany: (v: string) => void;
  jdText: string;
  setJdText: (v: string) => void;
  analysisMode: AnalysisMode;
  setAnalysisMode: (mode: AnalysisMode) => void;

  isUploading: boolean;
  onScreenshotUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;

  onBack: () => void;
  onStart: (
    interviewType?: string,
    options?: {
      analysisMode?: AnalysisMode;
      action?: 'reuse_existing' | 'regenerate';
      forceRegenerate?: boolean;
    }
  ) => Promise<void> | void;
};

const JdInputPage: React.FC<JdInputPageProps> = ({
  resumeData,
  targetCompany,
  setTargetCompany,
  jdText,
  setJdText,
  analysisMode,
  setAnalysisMode,
  isUploading,
  onScreenshotUpload,
  onBack,
  onStart,
}) => {
  const JD_MAX_CHARS = 1500;
  const [isStarting, setIsStarting] = React.useState(false);
  const [showReuseResultModal, setShowReuseResultModal] = React.useState(false);

  const shouldPromptReuseResult = React.useMemo(() => {
    if (analysisMode === 'generic') return false;
    if (analysisMode === 'targeted' && !String(jdText || '').trim()) return false;
    return hasReusableAnalysisResultForJd({
      resumeData,
      jdText,
      targetCompany,
    });
  }, [analysisMode, jdText, resumeData, targetCompany]);

  const shouldRenderJdSection = React.useMemo(
    () => shouldShowJdSection({ isInterviewMode: false, analysisMode }),
    [analysisMode]
  );
  const shouldBlockTargetRoleStart = React.useMemo(
    () =>
      isTargetRoleMissing({
        isInterviewMode: false,
        analysisMode,
        targetCompany,
      }),
    [analysisMode, targetCompany]
  );
  const shouldBlockTargetedStart = React.useMemo(
    () =>
      isTargetedJdMissing({
        isInterviewMode: false,
        analysisMode,
        jdText,
      }),
    [analysisMode, jdText]
  );
  const shouldBlockStep3Start = shouldBlockTargetRoleStart || shouldBlockTargetedStart;

  const startButtonLabel = `开始${getAnalysisModeLabel(analysisMode)}（${USAGE_POINT_COST.analysis}积分）`;

  return (
    <div className="flex flex-col min-h-screen bg-background-light dark:bg-background-dark">
      <header className="fixed top-0 left-0 right-0 mx-auto w-full max-w-md z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-white/5">
        <div className="flex items-center justify-between h-14 px-4 relative">
          <BackButton onClick={onBack} className="-ml-2" />
          <h1 className="text-lg font-bold tracking-tight">添加职位描述</h1>
          <div className="w-10" />
        </div>
      </header>

      <main className="pt-[72px] p-4 pb-[calc(5.75rem+env(safe-area-inset-bottom))] flex flex-col gap-6">
        <div className="bg-white dark:bg-surface-dark p-5 rounded-2xl shadow-md border border-slate-200 dark:border-white/5">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-primary">description</span>
            <h3 className="font-bold text-slate-900 dark:text-white">职位描述</h3>
          </div>

          <div className="mb-4">
            <label className="text-xs font-bold text-slate-600 dark:text-text-secondary uppercase tracking-wider">分析模式</label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {[
                {
                  id: 'generic',
                  label: '通用优化',
                  icon: 'stacked_bar_chart',
                  desc: '快速生成通用简历',
                },
                {
                  id: 'targeted',
                  label: '定向优化',
                  icon: 'target',
                  desc: '结合岗位 JD 定向生成',
                },
              ].map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => setAnalysisMode(mode.id as AnalysisMode)}
                  className={`flex flex-col items-start justify-center p-3 rounded-xl border transition-all ${analysisMode === mode.id
                    ? 'bg-primary/10 border-primary text-primary'
                    : 'bg-slate-50 dark:bg-white/5 border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10'
                    }`}
                  type="button"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px]">{mode.icon}</span>
                    <span className="text-xs font-bold">{mode.label}</span>
                  </div>
                  <span className="text-[11px] opacity-80 mt-0.5">{mode.desc}</span>
                </button>
              ))}
            </div>

          </div>

          <div className="mb-3">
            <label className="text-xs font-bold text-slate-600 dark:text-text-secondary uppercase tracking-wider">
              {getStep3TargetFieldLabel({ isInterviewMode: false, analysisMode })}
            </label>
            <input
              value={targetCompany}
              onChange={(e) => setTargetCompany(e.target.value)}
              placeholder={getStep3TargetFieldPlaceholder({ isInterviewMode: false, analysisMode })}
              className={`mt-2 w-full rounded-xl bg-white dark:bg-[#111a22] border p-3 text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-4 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm shadow-sm ${shouldBlockTargetRoleStart
                ? 'border-red-300 dark:border-red-500/50'
                : 'border-slate-300 dark:border-[#324d67]'
                }`}
              type="text"
            />

          </div>

          {shouldRenderJdSection && (
            <>
              <div className="mb-3">
                <label className="text-xs font-bold text-slate-600 dark:text-text-secondary uppercase tracking-wider">
                  职位描述内容（必填）
                </label>
                <AutoGrowTextarea
                  value={jdText}
                  onChange={(e) => setJdText((e.target.value || '').slice(0, JD_MAX_CHARS))}
                  placeholder="请粘贴目标职位的职位描述内容，AI 将为您进行针对性的人岗匹配分析..."
                  className={`mt-2 w-full rounded-xl bg-white dark:bg-[#111a22] border p-4 text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-4 focus:ring-primary/20 focus:border-primary outline-none resize-none text-sm leading-relaxed shadow-sm transition-all ${shouldBlockTargetedStart
                    ? 'border-red-300 dark:border-red-500/50'
                    : 'border-slate-300 dark:border-transparent'
                    }`}
                  maxLength={JD_MAX_CHARS}
                  minRows={8}
                />
                <div className="mt-1 text-right text-xs text-slate-500 dark:text-slate-400">
                  {jdText.length}/{JD_MAX_CHARS}
                </div>

              </div>

              <div className="mt-3">
                <button
                  onClick={() => !isUploading && document.getElementById('jd-screenshot-upload')?.click()}
                  disabled={isUploading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-50 dark:hover:bg-[#111a22] transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                  type="button"
                >
                  {isUploading ? (
                    <span className="size-4 border-2 border-slate-400 border-t-primary rounded-full animate-spin" />
                  ) : (
                    <span className="material-symbols-outlined text-[20px]">image</span>
                  )}
                  <span className="text-sm">{isUploading ? '正在解析...' : '上传职位描述截图（最多3张）'}</span>
                </button>

                <input
                  type="file"
                  id="jd-screenshot-upload"
                  accept="image/*"
                  multiple
                  onChange={onScreenshotUpload}
                  className="hidden"
                />
              </div>
            </>
          )}


        </div>

        <div className="sticky bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-30 flex gap-3 mt-2">
          <button
            onClick={async () => {
              if (isStarting || shouldBlockStep3Start) return;
              setIsStarting(true);
              try {
                if (shouldPromptReuseResult) {
                  setShowReuseResultModal(true);
                  return;
                }
                await onStart(undefined, { analysisMode });
              } finally {
                setIsStarting(false);
              }
            }}
            disabled={isStarting || shouldBlockStep3Start}
            className="w-full py-3 rounded-xl bg-primary text-white text-sm font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-600 active:scale-[0.98] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            type="button"
          >
            {isStarting ? (
              <>
                <span className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                <span>开始中...</span>
              </>
            ) : (
              startButtonLabel
            )}
          </button>
        </div>

        {showReuseResultModal && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="w-full max-w-sm bg-white dark:bg-[#1c2936] rounded-[28px] shadow-[0_20px_50px_rgba(0,0,0,0.3)] overflow-hidden border border-slate-100 dark:border-white/5 animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
              <div className="p-8 pb-5">
                <div className="flex flex-col items-center text-center">
                  <div className="size-16 rounded-3xl bg-blue-50 dark:bg-blue-400/10 flex items-center justify-center mb-6">
                    <span className="material-symbols-outlined text-primary text-[34px]">history</span>
                  </div>
                  <h3 className="text-xl font-black text-slate-900 dark:text-white mb-3 tracking-tight">检测到同 JD 历史结果</h3>
                </div>
              </div>
              <div className="p-6 pt-0 flex flex-col gap-3">
                <button
                  onClick={async () => {
                    if (isStarting) return;
                    setIsStarting(true);
                    try {
                      setShowReuseResultModal(false);
                      await onStart(undefined, {
                        analysisMode,
                        action: 'reuse_existing',
                      });
                    } finally {
                      setIsStarting(false);
                    }
                  }}
                  disabled={isStarting}
                  className="w-full h-12 rounded-2xl bg-primary text-white text-sm font-bold shadow-lg shadow-blue-500/25 hover:bg-blue-600 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isStarting ? (
                    <span className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  ) : null}
                  查看上次结果
                </button>
                <button
                  onClick={async () => {
                    if (isStarting) return;
                    setIsStarting(true);
                    try {
                      setShowReuseResultModal(false);
                      await onStart(undefined, {
                        analysisMode,
                        action: 'regenerate',
                        forceRegenerate: true,
                      });
                    } finally {
                      setIsStarting(false);
                    }
                  }}
                  disabled={isStarting}
                  className="w-full h-12 rounded-2xl border border-primary/30 text-primary text-sm font-bold hover:bg-primary/5 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  基于最新画像重新生成
                </button>
                <button
                  onClick={() => setShowReuseResultModal(false)}
                  className="w-full h-10 rounded-2xl text-sm font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-all active:scale-95"
                >
                  暂不处理
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
