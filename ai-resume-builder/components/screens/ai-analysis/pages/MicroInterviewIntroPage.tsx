import React from 'react';
import AiDisclaimer from '../AiDisclaimer';
import BackButton from '../../../shared/BackButton';

type ScoreBreakdown = {
  experience: number;
  skills: number;
  format: number;
};

type Props = {
  score: number;
  originalScore: number;
  summary?: string;
  scoreBreakdown?: ScoreBreakdown;
  getScoreColor: (s: number) => string;
  onBack: () => void;
  onStart: () => void;
};

const MicroInterviewIntroPage: React.FC<Props> = ({
  score,
  originalScore,
  summary,
  scoreBreakdown,
  getScoreColor,
  onBack,
  onStart,
}) => {
  return (
    <div className="flex flex-col min-h-screen bg-background-light dark:bg-background-dark animate-in fade-in duration-300">
      <header className="fixed top-0 left-0 right-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-white/5">
        <div className="flex items-center justify-between h-14 px-4 relative">
          <BackButton onClick={onBack} className="-ml-2" />
          <h1 className="text-base font-bold tracking-tight">初始评价</h1>
          <div className="w-10" />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pt-[72px] p-4 pb-[calc(5.75rem+env(safe-area-inset-bottom))]">
        <div className="bg-white dark:bg-surface-dark rounded-2xl p-6 shadow-md border border-slate-200 dark:border-white/5 mb-4">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3">初始评分</p>
          <div className={`text-6xl font-black tracking-tight ${getScoreColor(originalScore || score)}`}>
            {Math.round(originalScore || score)}
            <span className="text-2xl text-slate-400 font-normal ml-1">/100</span>
          </div>
          {scoreBreakdown && (
            <div className="grid grid-cols-3 gap-2 mt-4 text-center">
              <div className="rounded-lg bg-slate-50 dark:bg-white/5 p-2">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">经验</p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">{scoreBreakdown.experience}</p>
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-white/5 p-2">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">技能</p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">{scoreBreakdown.skills}</p>
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-white/5 p-2">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">格式</p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">{scoreBreakdown.format}</p>
              </div>
            </div>
          )}
        </div>

        <div className="bg-blue-50/50 dark:bg-blue-900/10 rounded-2xl p-5 border border-blue-100 dark:border-blue-900/20 mb-6">
          <h3 className="flex items-center gap-2 font-bold text-blue-800 dark:text-blue-400 text-base mb-2">
            <span className="material-symbols-outlined text-[20px]">summarize</span>
            诊断总结
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            {summary || 'AI 已完成诊断，建议通过微访谈补齐关键细节后再进入最终版本。'}
          </p>
        </div>

        <button
          onClick={onStart}
          className="w-full h-12 rounded-xl shadow-lg bg-primary hover:bg-blue-600 text-white transition-all active:scale-[0.98] shadow-blue-500/20 text-sm font-bold"
          type="button"
        >
          进入微访谈
        </button>
        <AiDisclaimer className="pt-3" />
      </main>
    </div>
  );
};

export default MicroInterviewIntroPage;
