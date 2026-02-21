import React from 'react';
import AiDisclaimer from '../AiDisclaimer';
import BackButton from '../../../shared/BackButton';
import ReportFeedback from '../ReportFeedback';

export type ReportPageProps = {
  mode: 'analyzing' | 'report';
  hasJdInput: () => boolean;
  handleStepBack: () => void;
  score: number;
  report: any;
  getScoreColor: (s: number) => string;
  handleStartMicroInterview: () => void;
  microInterviewActionLabel?: string;
  onFeedback?: (rating: 'up' | 'down', reason?: string) => Promise<boolean> | boolean;
};

const ReportPage: React.FC<ReportPageProps> = ({
  mode,
  hasJdInput,
  handleStepBack,
  score,
  report,
  getScoreColor,
  handleStartMicroInterview,
  microInterviewActionLabel,
  onFeedback,
}) => {
  if (mode === 'analyzing') {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center bg-background-light dark:bg-background-dark">
        <div className="relative size-28 mb-8">
          <div className="absolute inset-0 rounded-full border-4 border-slate-200 dark:border-white/10"></div>
          <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="material-symbols-outlined text-4xl text-primary animate-pulse">psychology</span>
          </div>
        </div>
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
          {hasJdInput() ? '正在进行人岗匹配...' : '正在初步诊断简历...'}
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center max-w-xs leading-relaxed">
          AI 正在聚合简历、职位描述与能力证据，生成诊断结论。
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500 text-center mt-2 animate-pulse">
          这会需要一点时间，请耐心等待...
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background-light dark:bg-background-dark animate-in fade-in duration-300 relative">
      <header className="fixed top-0 left-0 right-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-white/5">
        <div className="flex items-center justify-between h-14 px-4 relative">
          <BackButton onClick={handleStepBack} className="-ml-2" />
          <h1 className="text-base font-bold tracking-tight">初步诊断报告</h1>
          <div className="w-10"></div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pt-[72px] p-4 pb-[calc(5.75rem+env(safe-area-inset-bottom))] space-y-4">
        <div className="bg-white dark:bg-surface-dark rounded-2xl p-6 shadow-md border border-slate-200 dark:border-white/5">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3">
            {hasJdInput() ? '人岗匹配度' : '简历综合评估'}
          </p>
          <div className={`text-6xl font-black tracking-tight ${getScoreColor(score)}`}>
            {Math.round(score)}
            <span className="text-2xl text-slate-400 font-normal ml-1">/100</span>
          </div>
        </div>

        <div className="bg-blue-50/50 dark:bg-blue-900/10 rounded-2xl p-5 border border-blue-100 dark:border-blue-900/20">
          <h3 className="flex items-center gap-2 font-bold text-blue-800 dark:text-blue-400 text-base mb-2">
            <span className="material-symbols-outlined text-[20px]">summarize</span>
            AI 诊断总结
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
            {report?.summary || '诊断已完成，可进入微访谈进行细节补强。'}
          </p>
        </div>

        {Array.isArray(report?.weaknesses) && report.weaknesses.length > 0 && (
          <div className="bg-white dark:bg-surface-dark rounded-2xl p-5 border border-slate-200 dark:border-white/5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2">重点改进方向</h3>
            <div className="space-y-2">
              {report.weaknesses.slice(0, 5).map((w: string, idx: number) => (
                <p key={`${idx}-${w}`} className="text-sm text-slate-600 dark:text-slate-300">• {w}</p>
              ))}
            </div>
          </div>
        )}

        <ReportFeedback onFeedback={onFeedback} showTitle={false} />

        <div className="pt-2">
          <button
            onClick={handleStartMicroInterview}
            className="w-full h-11 rounded-xl bg-primary hover:bg-blue-600 text-white text-sm font-bold shadow-blue-500/20 shadow-sm"
            type="button"
          >
            {microInterviewActionLabel || '进入微访谈'}
          </button>
        </div>

        <AiDisclaimer className="pt-2" />
      </main>
    </div>
  );
};

export default ReportPage;
