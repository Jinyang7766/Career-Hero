import React from 'react';

const FinalAnalysisLoadingPage: React.FC = () => (
  <div className="flex flex-col min-h-screen items-center justify-center bg-background-light dark:bg-background-dark">
    <div className="relative size-28 mb-8">
      <div className="absolute inset-0 rounded-full border-4 border-slate-200 dark:border-white/10"></div>
      <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="material-symbols-outlined text-4xl text-primary animate-pulse">summarize</span>
      </div>
    </div>
    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">正在生成分析报告...</h3>
    <p className="text-sm text-slate-500 dark:text-slate-400 text-center max-w-xs leading-relaxed">
      AI 正在整合职业画像、简历与岗位信息，生成评分和优化建议。
    </p>
    <p className="text-xs text-slate-400 dark:text-slate-500 text-center mt-2 animate-pulse">
      这会需要一点时间，请耐心等待...
    </p>
  </div>
);

export default FinalAnalysisLoadingPage;
