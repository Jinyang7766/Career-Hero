import React from 'react';
import type { ResumeSummary } from '../../../../types';

export type ResumeSelectPageProps = {
  allResumes: ResumeSummary[] | undefined;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  isOptimizedOpen: boolean;
  setIsOptimizedOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isUnoptimizedOpen: boolean;
  setIsUnoptimizedOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onBack: () => void;
  onSelectResume: (resumeId: number) => void;
};

const ResumeSelectPage: React.FC<ResumeSelectPageProps> = ({
  allResumes,
  searchQuery,
  setSearchQuery,
  isOptimizedOpen,
  setIsOptimizedOpen,
  isUnoptimizedOpen,
  setIsUnoptimizedOpen,
  onBack,
  onSelectResume,
}) => {
  const filtered = (allResumes || []).filter((resume) =>
    resume.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderSelectionList = (resumes: ResumeSummary[]) => (
    <div className="px-4 mt-1">
      <div className="bg-white dark:bg-surface-dark rounded-2xl overflow-hidden shadow-sm border border-gray-100 dark:border-white/5 divide-y divide-gray-100 dark:divide-white/5">
        {resumes.map((resume) => (
          <div
            key={resume.id}
            onClick={() => onSelectResume(resume.id)}
            className="group relative flex items-center gap-4 px-4 py-3.5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors cursor-pointer"
          >
            <div className="shrink-0 relative">
              <div className="bg-white dark:bg-slate-700 aspect-[210/297] w-10 h-[56px] rounded-lg shadow-sm border border-slate-200 dark:border-slate-600 overflow-hidden relative">
                {resume.thumbnail}
              </div>
            </div>
            <div className="flex flex-col flex-1 justify-center min-w-0">
              <p className="text-slate-900 dark:text-white text-sm font-bold truncate leading-tight mb-1">{resume.title}</p>
              <p className="text-slate-500 dark:text-slate-500 text-[12px] font-medium leading-normal line-clamp-1">
                上次修改: {new Date(resume.date).toLocaleString('zh-CN', { hour12: false })}
              </p>
            </div>
            <button
              className="shrink-0 size-9 flex items-center justify-center rounded-full text-slate-300 hover:text-slate-600 dark:text-slate-600 dark:hover:text-white transition-colors"
              type="button"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>more_vert</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col min-h-screen bg-background-light dark:bg-background-dark animate-in fade-in duration-300">
      <header className="sticky top-0 z-50 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md border-b border-slate-200/50 dark:border-white/5 shrink-0">
        <div className="flex items-center justify-between h-14 px-4 relative">
          <button
            onClick={onBack}
            className="flex items-center justify-center size-10 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-slate-900 dark:text-white z-10"
            type="button"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>arrow_back</span>
          </button>
          <h1 className="absolute inset-0 flex items-center justify-center text-lg font-bold leading-tight tracking-[-0.015em] text-slate-900 dark:text-white pointer-events-none">
            选择简历
          </h1>
          <div className="w-10" />
        </div>
      </header>

      <div className="px-4 py-3 bg-background-light dark:bg-background-dark shrink-0">
        <div className="relative group">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400 group-focus-within:text-primary transition-colors" style={{ fontSize: '20px' }}>search</span>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-200/50 dark:bg-white/5 text-sm text-slate-900 dark:text-white rounded-xl py-2.5 pl-10 pr-4 outline-none border border-transparent focus:border-primary/20 focus:ring-4 focus:ring-primary/5 placeholder-slate-500 dark:placeholder-slate-400 transition-all"
            placeholder="搜索简历名称..."
            type="text"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white"
              type="button"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>close</span>
            </button>
          )}
        </div>
      </div>

      <main className="flex-1 overflow-y-auto pb-32 no-scrollbar">
        <div className="flex flex-col gap-2">
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center pt-20 px-4 text-center">
              <span className="material-symbols-outlined text-slate-300 dark:text-slate-600 text-6xl mb-4">search_off</span>
              <p className="text-slate-900 dark:text-white font-medium mb-1">未找到相关简历</p>
              <p className="text-slate-500 dark:text-slate-400 text-sm">尝试搜索其他关键词</p>
            </div>
          )}

          {filtered.length > 0 && (
            <>
              <div className="flex flex-col pt-2 bg-transparent">
                <button
                  onClick={() => setIsOptimizedOpen((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-2 group"
                  type="button"
                >
                  <h3 className="ml-4 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">已优化</h3>
                  <span
                    className="material-symbols-outlined text-[20px] text-slate-300 dark:text-slate-600 transition-transform duration-300 mr-4"
                    style={{ transform: isOptimizedOpen ? 'none' : 'rotate(-90deg)' }}
                  >
                    expand_more
                  </span>
                </button>
                {isOptimizedOpen && (() => {
                  const optimized = filtered.filter((r) => r.optimizationStatus === 'optimized');
                  return optimized.length > 0 ? (
                    renderSelectionList(optimized)
                  ) : (
                    <div className="mx-8 my-2 p-3 text-center text-slate-400 text-xs italic bg-slate-50/50 dark:bg-white/5 rounded-xl border border-dashed border-slate-200 dark:border-white/5">
                      暂无已优化简历
                    </div>
                  );
                })()}
              </div>

              <div className="flex flex-col pt-2 bg-transparent">
                <button
                  onClick={() => setIsUnoptimizedOpen((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-2 group"
                  type="button"
                >
                  <h3 className="ml-4 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">未优化</h3>
                  <span
                    className="material-symbols-outlined text-[20px] text-slate-300 dark:text-slate-600 transition-transform duration-300 mr-4"
                    style={{ transform: isUnoptimizedOpen ? 'none' : 'rotate(-90deg)' }}
                  >
                    expand_more
                  </span>
                </button>
                {isUnoptimizedOpen && (() => {
                  const unoptimized = filtered.filter((r) => r.optimizationStatus !== 'optimized');
                  return unoptimized.length > 0 ? (
                    renderSelectionList(unoptimized)
                  ) : (
                    <div className="mx-8 my-2 p-3 text-center text-slate-400 text-xs italic bg-slate-50/50 dark:bg-white/5 rounded-xl border border-dashed border-slate-200 dark:border-white/5">
                      暂无未优化简历
                    </div>
                  );
                })()}
              </div>
            </>
          )}
        </div>

        {filtered.length > 0 && (
          <div className="h-12 flex items-center justify-center mt-4">
            <p className="text-xs text-slate-400 dark:text-slate-600">
              {filtered.length === (allResumes?.length || 0) ? '已加载全部内容' : `显示 ${filtered.length} 条结果`}
            </p>
          </div>
        )}
      </main>
    </div>
  );
};

export default ResumeSelectPage;

