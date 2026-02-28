import React from 'react';
import AiDisclaimer from '../AiDisclaimer';
import BackButton from '../../../shared/BackButton';
import ReportFeedback from '../ReportFeedback';

type Props = {
  score: number;
  summary: string;
  advice: string[];
  onBack: () => void;
  onStartInterview: () => void;
  onGoToComparison: () => void;
  getScoreColor: (s: number) => string;
  onFeedback?: (rating: 'up' | 'down', reason?: string) => Promise<boolean> | boolean;
};

const FinalResumeReportPage: React.FC<Props> = ({
  score,
  summary,
  advice,
  onBack,
  onStartInterview,
  onGoToComparison,
  getScoreColor,
  onFeedback,
}) => {
  const candidateAdvice = (advice || [])
    .map((item) =>
      String(item || '')
        .replace(/再进入下一轮面试[。！!]?/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter(Boolean)
    .filter((item) => !/(简历|排版|版式|字体|模块|措辞)/.test(item))
    .slice(0, 6);

  return (
    <div className="flex flex-col min-h-screen bg-background-light dark:bg-background-dark animate-in fade-in duration-300">
      <header className="fixed top-0 left-0 right-0 mx-auto w-full max-w-md z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-white/5">
        <div className="flex items-center justify-between h-14 px-4 relative">
          <BackButton onClick={onBack} className="-ml-2" />
          <h1 className="text-base font-bold tracking-tight">诊断报告</h1>
          <div className="w-10"></div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pt-[72px] p-4 pb-[calc(5.75rem+env(safe-area-inset-bottom))] space-y-4">
        <div className="bg-white dark:bg-surface-dark rounded-2xl p-6 shadow-md border border-slate-200 dark:border-white/5">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3">
            匹配度评分
          </p>
          <div className={`text-6xl font-black tracking-tight ${getScoreColor(score)}`}>
            {Math.round(score)}
            <span className="text-2xl text-slate-400 font-normal ml-1">/100</span>
          </div>
        </div>

        <div className="bg-blue-50/50 dark:bg-blue-900/10 rounded-2xl p-5 border border-blue-100 dark:border-blue-900/20">
          <h3 className="flex items-center gap-2 font-bold text-blue-800 dark:text-blue-400 text-base mb-2">
            <span className="material-symbols-outlined text-[20px]">summarize</span>
            候选人综合评价
          </h3>
          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
            {summary || '候选人整体匹配度良好，建议继续通过模拟面试强化表达结构与关键案例深挖。'}
          </p>
        </div>
        <ReportFeedback onFeedback={onFeedback} showTitle={false} />

        <div className="bg-white dark:bg-surface-dark rounded-2xl p-5 border border-slate-200 dark:border-white/5 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2">候选人后续建议</h3>
          <div className="space-y-2">
            {candidateAdvice.map((item, idx) => (
              <p key={`${idx}-${item}`} className="text-sm text-slate-600 dark:text-slate-300">• {item}</p>
            ))}
            {candidateAdvice.length === 0 && (
              <>
                <p className="text-sm text-slate-600 dark:text-slate-300">• 用 STAR 结构重写 3 个高价值项目案例，突出你的动作、决策与结果。</p>
                <p className="text-sm text-slate-600 dark:text-slate-300">• 针对目标岗位准备 10 个高频追问，重点训练量化回答与复盘深度。</p>
                <p className="text-sm text-slate-600 dark:text-slate-300">• 每周完成 1 次全真模拟面试，并记录表达冗余点与逻辑断点后复训。</p>
              </>
            )}
          </div>
        </div>
        <ReportFeedback onFeedback={onFeedback} showTitle={false} />

        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/30 bg-emerald-50/60 dark:bg-emerald-900/10 p-4">
          <p className="text-sm text-emerald-800 dark:text-emerald-300">
            已完成保存。现在可以去模拟面试，检验简历与岗位匹配表达。
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onGoToComparison}
            className="h-11 rounded-xl border border-slate-300 dark:border-white/10 text-slate-700 dark:text-slate-200 bg-white dark:bg-white/5 hover:bg-slate-50 dark:hover:bg-white/10 text-sm font-bold"
            type="button"
          >
            查看优化简历
          </button>
          <button
            onClick={onStartInterview}
            className="h-11 rounded-xl bg-primary hover:bg-blue-600 text-white text-sm font-bold shadow-blue-500/20 shadow-sm"
            type="button"
          >
            去模拟面试
          </button>
        </div>

        <AiDisclaimer className="pt-1" />
      </main>
    </div>
  );
};

export default FinalResumeReportPage;
