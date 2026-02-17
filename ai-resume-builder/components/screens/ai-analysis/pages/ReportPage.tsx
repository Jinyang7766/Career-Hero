import React from 'react';
import { toSkillList } from '../../../../src/skill-utils';

export type ReportPageProps = {
  mode: 'analyzing' | 'report';
  hasJdInput: () => boolean;
  handleStepBack: () => void;

  // report-only (kept loose to avoid coupling to AiAnalysis internal types)
  score: number;
  originalScore: number;
  report: any;
  suggestions: any[];
  setSuggestions: React.Dispatch<React.SetStateAction<any[]>>;

  getScoreColor: (s: number) => string;
  getSuggestionModuleLabel: (s: any) => string;
  getDisplayOriginalValue: (s: any) => React.ReactNode;
  persistSuggestionFeedback: (suggestion: any, rating: 'up' | 'down') => void;
  handleAcceptSuggestionInChat: (suggestion: any) => void;
  acceptingSuggestionIds?: Set<string>;
  handleAnalyzeOtherResume: () => void;
  handleExportPDF: () => void;
};

const ReportPage: React.FC<ReportPageProps> = (props) => {
  const {
    mode,
    hasJdInput,
    handleStepBack,
    score,
    originalScore,
    report,
    suggestions,
    setSuggestions,
    getScoreColor,
    getSuggestionModuleLabel,
    getDisplayOriginalValue,
    persistSuggestionFeedback,
    handleAcceptSuggestionInChat,
    acceptingSuggestionIds,
    handleAnalyzeOtherResume,
    handleExportPDF,
  } = props;

  if (mode === 'analyzing') {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center bg-background-light dark:bg-background-dark">
        <div className="relative size-28 mb-8">
          <div className="absolute inset-0 rounded-full border-4 border-slate-200 dark:border-white/10"></div>
          <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center">
              <span className="material-symbols-outlined text-4xl text-primary animate-pulse mb-1">compare_arrows</span>
              {hasJdInput() && <span className="text-[10px] font-bold text-primary uppercase">JD Match</span>}
            </div>
          </div>
        </div>
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
          {hasJdInput() ? '正在进行人岗匹配...' : '正在深度诊断简历...'}
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center max-w-xs leading-relaxed">
          {hasJdInput()
            ? 'AI 正在对比您的简历与目标职位描述，分析关键词覆盖率与核心能力差距。'
            : 'AI 正在检查您的简历内容完整性、格式规范以及语言表达的专业度。'}
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-4 animate-pulse">
          这会需要比较长的时间，请耐心等待
        </p>
      </div>
    );
  }

  const hasAcceptedSuggestion = (suggestions || []).some((s) => s.status === 'accepted');
  const pendingSuggestions = (suggestions || []).filter((s) => s.status === 'pending');

  return (
    <div className="flex flex-col min-h-screen bg-background-light dark:bg-background-dark animate-in fade-in duration-300 relative">
      <header className="sticky top-0 z-40 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md border-b border-slate-200 dark:border-white/5">
        <div className="flex items-center justify-between h-14 px-4 relative">
          <button onClick={handleStepBack} className="p-2 -ml-2 rounded-full hover:bg-slate-200 dark:hover:bg-white/10 text-slate-900 dark:text-white" type="button">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <h1 className="text-base font-bold tracking-tight">诊断报告</h1>
          <div className="w-8"></div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 pb-[calc(8.5rem+env(safe-area-inset-bottom))]">
        <div className="bg-white dark:bg-surface-dark rounded-2xl p-6 shadow-md border border-slate-200 dark:border-white/5 mb-6 relative overflow-hidden">
          <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${score >= 80 ? 'from-green-400 to-emerald-600' : 'from-orange-400 to-red-500'}`}></div>

          <div className="text-center mb-6">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3">
              {hasJdInput() ? '人岗匹配度' : '简历综合评分'}
            </p>
            <div className={`text-7xl font-black tracking-tight transition-all duration-500 ${getScoreColor(originalScore || score)}`}>
              {score}
              <span className="text-2xl text-slate-400 font-normal ml-1">/100</span>
            </div>
          </div>

          {report?.scoreBreakdown && (
            <div className="grid gap-3 pt-4 border-t border-slate-200 dark:border-white/5">
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-slate-600 dark:text-slate-300">经验匹配</span>
                  <span className="text-slate-900 dark:text-white">{report.scoreBreakdown.experience}分</span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 dark:bg-black/20 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${report.scoreBreakdown.experience}%` }}></div>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-slate-600 dark:text-slate-300">技能相关</span>
                  <span className="text-slate-900 dark:text-white">{report.scoreBreakdown.skills}分</span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 dark:bg-black/20 rounded-full overflow-hidden">
                  <div className="h-full bg-purple-500 rounded-full" style={{ width: `${report.scoreBreakdown.skills}%` }}></div>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-slate-600 dark:text-slate-300">格式规范</span>
                  <span className="text-slate-900 dark:text-white">{report.scoreBreakdown.format}分</span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 dark:bg-black/20 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full" style={{ width: `${report.scoreBreakdown.format}%` }}></div>
                </div>
              </div>
            </div>
          )}
        </div>

        {report?.summary && (
          <div className="bg-blue-50/50 dark:bg-blue-900/10 rounded-2xl p-5 border border-blue-100 dark:border-blue-900/20 mb-6">
            <h3 className="flex items-center gap-2 font-bold text-blue-800 dark:text-blue-400 text-base mb-2">
              <span className="material-symbols-outlined text-[20px]">psychology</span>
              AI 深度诊断总结
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {report.summary}
            </p>
          </div>
        )}

        {pendingSuggestions.length > 0 && (
          <div className="mb-6">
            <h3 className="flex items-center gap-2 font-bold text-slate-800 dark:text-white text-base mb-1">
              <span className="material-symbols-outlined text-primary">auto_fix_high</span>
              AI 优化建议 ({pendingSuggestions.length})
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-4 ml-7">
              提示：AI 可能会根据行业模型润色细节，请注意核实关键数据。
            </p>
            <div className="space-y-4">
              {pendingSuggestions.map((suggestion) => (
                <div key={suggestion.id} className="bg-white dark:bg-surface-dark rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden shadow-md">
                  <div className="px-4 py-3 bg-slate-50 dark:bg-white/5 border-b border-slate-200 dark:border-white/5">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-xs font-bold text-primary uppercase tracking-wider">{suggestion.title}</span>
                      <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                        {getSuggestionModuleLabel(suggestion)}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300">{suggestion.reason}</p>
                  </div>

                  <div className="flex flex-col divide-y divide-slate-100 dark:divide-white/5">
                    <div className="p-4 bg-red-50/30 dark:bg-red-900/5">
                      <p className="text-xs font-black text-red-500 mb-2 uppercase tracking-wide">修改前</p>
                      <div className="text-sm text-slate-500 bg-white dark:bg-black/20 p-3 rounded-lg border border-red-100 dark:border-red-900/20 min-h-[80px]">
                        {getDisplayOriginalValue(suggestion) || <span className="italic text-slate-400">无内容</span>}
                      </div>
                    </div>

                    <div className="p-4 bg-green-50/30 dark:bg-green-900/5">
                      <p className="text-xs font-black text-green-600 mb-2 uppercase flex justify-between items-center tracking-wide">
                        修改建议 (可编辑)
                        <span className="material-symbols-outlined text-[14px]">
                          {suggestion.targetSection === 'skills' ? 'extension' : 'edit'}
                        </span>
                      </p>

                      {suggestion.targetSection === 'skills' ? (
                        <div className="p-3 bg-white dark:bg-black/20 rounded-lg border border-green-200 dark:border-green-900/30">
                          <div className="flex flex-wrap gap-2 min-h-[44px]">
                            {toSkillList(suggestion.suggestedValue).map((skill: string, idx: number) => (
                              <span key={idx} className="flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded-md text-xs font-medium border border-primary/20">
                                {skill}
                                <button
                                  onClick={() => {
                                    setSuggestions((prev: any[]) => prev.map((s) => {
                                      if (s.id !== suggestion.id) return s;
                                      const list = toSkillList(s.suggestedValue);
                                      list.splice(idx, 1);
                                      return { ...s, suggestedValue: list };
                                    }));
                                  }}
                                  className="text-primary/70 hover:text-primary"
                                  aria-label="remove-skill"
                                  type="button"
                                >
                                  <span className="material-symbols-outlined text-[12px]">close</span>
                                </button>
                              </span>
                            ))}
                            {(!suggestion.suggestedValue || (Array.isArray(suggestion.suggestedValue) && suggestion.suggestedValue.length === 0)) && (
                              <span className="text-slate-400 italic text-xs">建议补充相关技能</span>
                            )}
                          </div>
                          <div className="mt-3 flex items-center gap-2">
                            <input
                              type="text"
                              placeholder=""
                              className="flex-1 text-xs text-slate-800 dark:text-slate-200 bg-white/80 dark:bg-black/30 px-3 py-2 rounded-md border border-slate-200 dark:border-white/10 focus:ring-2 focus:ring-green-500/30 outline-none"
                              onKeyDown={(e) => {
                                if (e.key !== 'Enter') return;
                                const value = (e.currentTarget as HTMLInputElement).value.trim();
                                if (!value) return;
                                setSuggestions((prev: any[]) => prev.map((s) => {
                                  if (s.id !== suggestion.id) return s;
                                  const list = toSkillList(s.suggestedValue);
                                  if (!list.includes(value)) list.push(value);
                                  return { ...s, suggestedValue: toSkillList(list) };
                                }));
                                (e.currentTarget as HTMLInputElement).value = '';
                              }}
                            />
                            <button
                              type="button"
                              className="px-3 py-2 text-xs font-semibold text-white bg-primary rounded-md hover:bg-primary/90"
                              onClick={(e) => {
                                const input = (e.currentTarget.previousElementSibling as HTMLInputElement | null);
                                if (!input) return;
                                const value = input.value.trim();
                                if (!value) return;
                                setSuggestions((prev: any[]) => prev.map((s) => {
                                  if (s.id !== suggestion.id) return s;
                                  const list = toSkillList(s.suggestedValue);
                                  if (!list.includes(value)) list.push(value);
                                  return { ...s, suggestedValue: toSkillList(list) };
                                }));
                                input.value = '';
                              }}
                            >
                              添加
                            </button>
                          </div>
                        </div>
                      ) : (
                        <textarea
                          value={Array.isArray(suggestion.suggestedValue) ? suggestion.suggestedValue.join(', ') : suggestion.suggestedValue}
                          onChange={(e) => {
                            setSuggestions((prev: any[]) => prev.map((s) =>
                              s.id === suggestion.id ? { ...s, suggestedValue: (e.currentTarget as HTMLTextAreaElement).value } : s
                            ));
                          }}
                          className="w-full text-sm text-slate-800 dark:text-slate-200 bg-white dark:bg-black/20 p-3 rounded-lg border border-green-200 dark:border-green-900/30 min-h-[120px] focus:ring-2 focus:ring-green-500/30 outline-none resize-y transition-all"
                        />
                      )}
                    </div>
                  </div>

                  <div className="p-3 flex flex-wrap items-center justify-between gap-3 bg-slate-50 dark:bg-white/5 border-t border-slate-200 dark:border-white/5">
                    <div className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400 min-w-0">
                      <span className="font-bold truncate">有帮助吗？</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => persistSuggestionFeedback(suggestion, 'up')}
                          className={`inline-flex items-center justify-center size-7 rounded-full border transition-colors ${suggestion.rating === 'up'
                            ? 'border-green-500 text-green-600 bg-green-50 dark:bg-green-900/20'
                            : 'border-slate-200 dark:border-white/10 text-slate-400 hover:text-green-600 hover:border-green-400'
                            }`}
                          aria-label="点赞"
                          type="button"
                        >
                          <span className="material-symbols-outlined text-[16px]">thumb_up</span>
                        </button>
                        <button
                          onClick={() => persistSuggestionFeedback(suggestion, 'down')}
                          className={`inline-flex items-center justify-center size-7 rounded-full border transition-colors ${suggestion.rating === 'down'
                            ? 'border-rose-500 text-rose-600 bg-rose-50 dark:bg-rose-900/20'
                            : 'border-slate-200 dark:border-white/10 text-slate-400 hover:text-rose-600 hover:border-rose-400'
                            }`}
                          aria-label="点踩"
                          type="button"
                        >
                          <span className="material-symbols-outlined text-[16px]">thumb_down</span>
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-auto">
                      <button
                        onClick={() => {
                          setSuggestions((prev: any[]) => prev.map((s) => s.id === suggestion.id ? { ...s, status: 'ignored' } : s));
                        }}
                        className="px-3 py-2 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 font-bold transition-colors"
                        type="button"
                      >
                        忽略
                      </button>
                      <button
                        onClick={() => handleAcceptSuggestionInChat(suggestion)}
                        disabled={acceptingSuggestionIds?.has(String(suggestion.id))}
                        className={`px-4 py-2 text-xs font-bold rounded-lg shadow-sm transition-all flex items-center gap-1.5 whitespace-nowrap active:scale-95 ${acceptingSuggestionIds?.has(String(suggestion.id))
                          ? 'bg-slate-200 dark:bg-white/10 text-slate-400 cursor-not-allowed'
                          : 'bg-primary hover:bg-blue-600 text-white shadow-blue-500/20'
                          }`}
                        type="button"
                      >
                        {acceptingSuggestionIds?.has(String(suggestion.id)) ? (
                          <>
                            <span className="w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></span>
                            采纳中...
                          </>
                        ) : (
                          <>
                            <span className="material-symbols-outlined text-[16px]">check</span>
                            采纳优化
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="sticky bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-30 flex gap-3">
          <button
            onClick={handleAnalyzeOtherResume}
            className="flex-1 flex items-center justify-center gap-2 h-12 rounded-xl shadow-lg bg-primary hover:bg-blue-600 text-white transition-all active:scale-[0.98] shadow-blue-500/20"
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">restart_alt</span>
            <span className="text-[13px] font-bold tracking-wide">返回简历选择页</span>
          </button>
          <button
            onClick={handleExportPDF}
            disabled={!hasAcceptedSuggestion}
            className={`flex-1 flex items-center justify-center gap-2 h-12 rounded-xl shadow-lg transition-all transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-blue-500/20 ${!hasAcceptedSuggestion
              ? 'bg-slate-300 dark:bg-slate-800 text-slate-500'
              : 'bg-primary hover:bg-blue-600 text-white'
              }`}
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
            <span className="text-[13px] font-bold tracking-wide">前往预览导出</span>
          </button>
        </div>
      </main>
    </div>
  );
};

export default ReportPage;
