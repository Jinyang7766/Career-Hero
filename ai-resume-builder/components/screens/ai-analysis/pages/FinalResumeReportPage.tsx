import React from 'react';
import AiDisclaimer from '../AiDisclaimer';

type Props = {
  score: number;
  summary: string;
  advice: string[];
  onBack: () => void;
  onStartInterview: () => void;
  getScoreColor: (s: number) => string;
};

const FinalResumeReportPage: React.FC<Props> = ({
  score,
  summary,
  advice,
  onBack,
  onStartInterview,
  getScoreColor,
}) => {
  return (
    <div className="flex flex-col min-h-screen bg-background-light dark:bg-background-dark animate-in fade-in duration-300">
      <header className="sticky top-0 z-40 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md border-b border-slate-200 dark:border-white/5">
        <div className="flex items-center justify-between h-14 px-4 relative">
          <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-slate-200 dark:hover:bg-white/10 text-slate-900 dark:text-white" type="button">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <h1 className="text-base font-bold tracking-tight">优化完成报告</h1>
          <div className="w-8"></div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 pb-[calc(5.75rem+env(safe-area-inset-bottom))] space-y-4">
        <div className="bg-white dark:bg-surface-dark rounded-2xl p-6 shadow-md border border-slate-200 dark:border-white/5">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3">
            当前简历评分
          </p>
          <div className={`text-6xl font-black tracking-tight ${getScoreColor(score)}`}>
            {Math.round(score)}
            <span className="text-2xl text-slate-400 font-normal ml-1">/100</span>
          </div>
        </div>

        <div className="bg-blue-50/50 dark:bg-blue-900/10 rounded-2xl p-5 border border-blue-100 dark:border-blue-900/20">
          <h3 className="flex items-center gap-2 font-bold text-blue-800 dark:text-blue-400 text-base mb-2">
            <span className="material-symbols-outlined text-[20px]">summarize</span>
            AI 总结
          </h3>
          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
            {summary || '优化已完成。建议继续通过模拟面试验证表达与细节。'}
          </p>
        </div>

        <div className="bg-white dark:bg-surface-dark rounded-2xl p-5 border border-slate-200 dark:border-white/5 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2">后续建议</h3>
          <div className="space-y-2">
            {(advice || []).slice(0, 6).map((item, idx) => (
              <p key={`${idx}-${item}`} className="text-sm text-slate-600 dark:text-slate-300">• {item}</p>
            ))}
            {(!advice || advice.length === 0) && (
              <p className="text-sm text-slate-600 dark:text-slate-300">• 建议立即开始一次模拟面试，验证优化后的简历表达效果。</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/30 bg-emerald-50/60 dark:bg-emerald-900/10 p-4">
          <p className="text-sm text-emerald-800 dark:text-emerald-300">
            已完成保存。现在可以去模拟面试，检验简历与岗位匹配表达。
          </p>
        </div>

        <button
          onClick={onStartInterview}
          className="h-11 w-full rounded-xl bg-primary hover:bg-blue-600 text-white text-sm font-bold shadow-blue-500/20 shadow-sm"
          type="button"
        >
          去模拟面试
        </button>

        <AiDisclaimer className="pt-1" />
      </main>
    </div>
  );
};

export default FinalResumeReportPage;

