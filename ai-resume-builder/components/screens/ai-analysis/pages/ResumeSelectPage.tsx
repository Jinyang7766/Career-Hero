import React from 'react';
import type { ResumeSummary } from '../../../../types';
import BackButton from '../../../shared/BackButton';

export type ResumeSelectPageProps = {
  allResumes: ResumeSummary[] | undefined;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  isOptimizedOpen: boolean;
  setIsOptimizedOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isUnoptimizedOpen: boolean;
  setIsUnoptimizedOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onBack: () => void;
  onSelectResume: (resumeId: number, preferReport?: boolean) => void;
  selectedResumeId?: string | number | null;
  isReading?: boolean;
  isInterviewMode?: boolean;
  pointsRemaining?: number | null;
};

import { DiagnosisProgressBar } from '../../../shared/DiagnosisProgressBar';

const formatResumeModifiedAt = (rawDate: string) => {
  const source = String(rawDate || '').trim();
  if (!source) return '时间未知';

  let normalized = source;
  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(source)) {
    normalized = source.replace(' ', 'T');
  }
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return '时间未知';
  return date.toLocaleString('zh-CN', { hour12: false });
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
  selectedResumeId,
  isReading,
  isInterviewMode,
  pointsRemaining,
}) => {
  const filtered = (allResumes || []).filter((resume) =>
    resume.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderSelectionList = (resumes: ResumeSummary[]) => (
    <div className="px-4 mt-1">
      <div className="bg-white dark:bg-surface-dark rounded-2xl overflow-hidden shadow-md border border-slate-200 dark:border-white/5 divide-y divide-slate-100 dark:divide-white/5">
        {resumes.map((resume) => (
          <div
            key={resume.id}
            onClick={() => onSelectResume(resume.id, !!resume.analyzed)}
            className="group relative flex items-center gap-4 px-4 py-3.5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors cursor-pointer"
          >
            <div className={`shrink-0 relative ${isReading && String(selectedResumeId) === String(resume.id) ? 'opacity-50 pointer-events-none' : ''}`}>
              <div className="bg-white dark:bg-slate-700 aspect-[210/297] w-10 h-[56px] rounded-lg shadow-sm border border-slate-200 dark:border-slate-600 overflow-hidden relative">
                {resume.thumbnail}
              </div>
              {isReading && String(selectedResumeId) === String(resume.id) && (
                <div className="absolute inset-0 bg-white/50 dark:bg-black/50 flex items-center justify-center z-10 rounded-lg">
                  <span className="size-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin"></span>
                </div>
              )}
            </div>
            <div className="flex flex-col flex-1 justify-center min-w-0">
              <p className="text-slate-900 dark:text-white text-sm font-bold truncate leading-tight mb-1">{resume.title}</p>
              <p className="text-slate-600 dark:text-slate-500 text-[12px] font-medium leading-normal line-clamp-1">
                上次修改: {formatResumeModifiedAt(resume.date)}
              </p>
              {resume.analyzed && <DiagnosisProgressBar resume={resume} isInterviewMode={!!isInterviewMode} />}
            </div>
            <div className="shrink-0 flex items-center">
              <span className="material-symbols-outlined text-slate-300 dark:text-slate-600" style={{ fontSize: '18px' }}>
                chevron_right
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col min-h-screen bg-background-light dark:bg-background-dark animate-in fade-in duration-300">
      <header className="sticky top-0 z-50 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md border-b border-slate-200 dark:border-white/5 shrink-0">
        <div className="flex items-center justify-between h-14 px-4 relative">
          <BackButton onClick={onBack} className="z-10" />
          <h1 className="absolute inset-0 flex items-center justify-center text-lg font-bold tracking-tight text-slate-900 dark:text-white pointer-events-none">
            {isInterviewMode ? 'AI 面试' : 'AI 诊断'}
          </h1>
          <div className="w-10" />
        </div>
      </header>

      {/* Mode Indicator Banner */}
      <div className="px-4 pt-4 pb-2 shrink-0">
        <div className={`group relative overflow-hidden rounded-2xl py-4 px-5 text-white shadow-xl transition-all ${isInterviewMode
          ? 'bg-gradient-to-br from-indigo-600 to-indigo-700 shadow-indigo-500/30'
          : 'bg-gradient-to-br from-primary via-blue-600 to-indigo-700 shadow-xl shadow-primary/30'
          }`}>

          {/* Decorative shapes - Synced with Membership/Dashboard style for Interview mode */}
          {isInterviewMode ? (
            <>
              <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-3xl animate-pulse pointer-events-none" />
              <div className="absolute -left-16 -bottom-16 h-48 w-48 rounded-full bg-white/10 blur-3xl pointer-events-none" />
            </>
          ) : (
            <>
              <div className="absolute -right-8 -top-8 size-24 rounded-full bg-white/10 blur-3xl pointer-events-none" />
              <div className="absolute -left-8 -bottom-8 size-20 rounded-full bg-white/10 blur-2xl pointer-events-none" />
            </>
          )}

          <div className="flex items-center gap-4 relative z-10">
            <div className="shrink-0 size-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-white border border-white/20">
              <span className="material-symbols-outlined text-[24px]">
                {isInterviewMode ? 'forum' : 'assessment'}
              </span>
            </div>
            <div className="flex flex-col min-w-0 pr-2">
              <h2 className="text-base font-black mb-0.5 text-white tracking-wide">
                {isInterviewMode ? '模拟面试' : '简历诊断'}
              </h2>
              <p className="text-[11px] text-white/90 leading-tight font-medium whitespace-nowrap overflow-hidden text-ellipsis">
                {isInterviewMode
                  ? 'AI 面试官将基于简历提问，模拟真实面试场景。'
                  : 'AI 将全方位诊断亮点并提供专业优化建议。'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 py-3 bg-background-light dark:bg-background-dark shrink-0">
        <div className="relative group">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400 group-focus-within:text-primary transition-colors" style={{ fontSize: '20px' }}>search</span>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white dark:bg-white/5 text-sm text-slate-900 dark:text-white rounded-xl py-2.5 pl-10 pr-4 outline-none border border-slate-200 dark:border-transparent focus:border-primary focus:ring-4 focus:ring-primary/10 placeholder-slate-400 dark:placeholder-slate-400 transition-all shadow-sm"
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

      <main className="flex-1 overflow-y-auto pb-[calc(4.5rem+env(safe-area-inset-bottom))] no-scrollbar">
        <div className="flex flex-col gap-2">
          {allResumes && allResumes.length === 0 ? (
            <div className="flex flex-col items-center justify-center pt-20 px-4 text-center">
              <span className="material-symbols-outlined text-slate-300 dark:text-slate-600 text-6xl mb-4">description</span>
              <p className="text-slate-900 dark:text-white font-medium mb-1">简历库中还没有简历</p>
              <p className="text-slate-500 dark:text-slate-400 text-sm">请先回首页新建一份简历吧</p>
            </div>
          ) : filtered.length === 0 && (
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
                  <div className="flex items-center gap-2 ml-4">
                    <span className="material-symbols-outlined text-primary" style={{ fontSize: '18px' }}>task_alt</span>
                    <h3 className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">已诊断</h3>
                    <span className="px-1.2 py-0.2 rounded-md bg-slate-100 dark:bg-white/5 text-[9px] text-slate-500 dark:text-slate-500 font-bold border border-slate-200 dark:border-white/5 shadow-sm">
                      {filtered.filter((r) => !!r.analyzed).length}
                    </span>
                  </div>
                  <span
                    className="material-symbols-outlined text-[20px] text-slate-400 dark:text-slate-600 transition-transform duration-300 mr-4"
                    style={{ transform: isOptimizedOpen ? 'none' : 'rotate(-90deg)' }}
                  >
                    expand_more
                  </span>
                </button>
                {isOptimizedOpen && (() => {
                  const analyzed = filtered.filter((r) => !!r.analyzed);
                  return analyzed.length > 0 ? (
                    renderSelectionList(analyzed)
                  ) : (
                    <div className="mx-8 my-2 p-3 text-center text-slate-400 text-xs italic bg-slate-50/50 dark:bg-white/5 rounded-xl border border-dashed border-slate-200 dark:border-white/5">
                      暂无已诊断简历
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
                  <div className="flex items-center gap-2 ml-4">
                    <span className="material-symbols-outlined text-slate-400" style={{ fontSize: '18px' }}>fiber_manual_record</span>
                    <h3 className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">未诊断</h3>
                    <span className="px-1.2 py-0.2 rounded-md bg-slate-100 dark:bg-white/5 text-[9px] text-slate-500 dark:text-slate-500 font-bold border border-slate-200 dark:border-white/5 shadow-sm">
                      {filtered.filter((r) => !r.analyzed).length}
                    </span>
                  </div>
                  <span
                    className="material-symbols-outlined text-[20px] text-slate-400 dark:text-slate-600 transition-transform duration-300 mr-4"
                    style={{ transform: isUnoptimizedOpen ? 'none' : 'rotate(-90deg)' }}
                  >
                    expand_more
                  </span>
                </button>
                {isUnoptimizedOpen && (() => {
                  const unanalyzed = filtered.filter((r) => !r.analyzed);
                  return unanalyzed.length > 0 ? (
                    renderSelectionList(unanalyzed)
                  ) : (
                    <div className="mx-8 my-2 p-3 text-center text-slate-400 text-xs italic bg-slate-50/50 dark:bg-white/5 rounded-xl border border-dashed border-slate-200 dark:border-white/5">
                      暂无未诊断简历
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
