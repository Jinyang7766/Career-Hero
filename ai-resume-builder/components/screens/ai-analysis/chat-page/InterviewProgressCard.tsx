import React from 'react';
import { confirmDialog } from '../../../../src/ui/dialogs';
import { formatElapsedTime } from './chat-page-utils';

type Props = {
  interviewPlan: string[];
  interviewAnsweredCount: number;
  interviewTotalCount: number;
  currentQuestionElapsedSec: number;
  isSending: boolean;
  isRecording: boolean;
  onSkipQuestion: () => void;
};

export const InterviewProgressCard: React.FC<Props> = ({
  interviewPlan,
  interviewAnsweredCount,
  interviewTotalCount,
  currentQuestionElapsedSec,
  isSending,
  isRecording,
  onSkipQuestion,
}) => {
  const [planExpanded, setPlanExpanded] = React.useState(false);
  const progressPercent = interviewTotalCount > 0
    ? Math.min(100, Math.round((interviewAnsweredCount / interviewTotalCount) * 100))
    : 0;

  return (
    <div className="mx-4 my-2 p-3 bg-white/70 dark:bg-[#1c2936]/40 backdrop-blur-md rounded-2xl border border-slate-200/50 dark:border-white/5 shadow-sm">
      {interviewTotalCount > 0 ? (
        <>
          <div className="w-full text-left group">
            <div className="flex items-center justify-between mb-2 px-1">
              <div className="flex items-center gap-2">
                <div className="size-5 rounded-md bg-primary/10 dark:bg-primary/20 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[14px] text-primary">assessment</span>
                </div>
                {interviewTotalCount <= 1 ? (
                  <div className="flex items-center gap-2">
                    <p className="text-[11px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider">
                      正在加载面试题库
                    </p>
                    <div className="size-2.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                  </div>
                ) : (
                  <>
                    <p className="text-[11px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider">
                      面试进度
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500">
                        {Math.min(interviewAnsweredCount + 1, interviewTotalCount)} / {interviewTotalCount}
                      </span>
                      <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                        本题用时 {formatElapsedTime(currentQuestionElapsedSec)}
                      </span>
                      <button
                        type="button"
                        disabled={isSending || isRecording}
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (await confirmDialog('确认跳过当前题目吗？将结束本题计时，并让 AI 给出参考回复后进入下一题。')) {
                            onSkipQuestion();
                          }
                        }}
                        className="px-2 py-0.5 rounded-md border border-primary/20 dark:border-primary/30 bg-primary/10 dark:bg-primary/20 text-[10px] font-bold text-primary dark:text-blue-400 hover:bg-primary/20 dark:hover:bg-primary/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        跳过本题
                      </button>
                    </div>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => setPlanExpanded((v) => !v)}
                className="size-6 flex items-center justify-center rounded-md text-slate-400 dark:text-slate-500 hover:bg-slate-100/70 dark:hover:bg-white/5 transition-colors"
                aria-label={planExpanded ? '收起题库' : '展开题库'}
              >
                <span className={`material-symbols-outlined text-[20px] transition-transform duration-300 ${planExpanded ? 'rotate-180' : ''}`}>
                  keyboard_arrow_down
                </span>
              </button>
            </div>
            <div className="h-2 rounded-full bg-slate-100 dark:bg-white/5 overflow-hidden p-0.5 border border-slate-200/50 dark:border-white/5">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-blue-400 transition-all duration-500 ease-out shadow-[0_0_8px_rgba(37,99,235,0.4)]"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
          {planExpanded && (
            <div className="mt-3 rounded-xl border border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-black/20 p-2.5 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 customize-scrollbar">
                {interviewPlan.map((q, idx) => {
                  const done = idx < interviewAnsweredCount;
                  const isCurrent = idx === interviewAnsweredCount;
                  return (
                    <div
                      key={`${idx}-${q.slice(0, 20)}`}
                      className={`flex items-start gap-3 p-2 rounded-lg transition-colors ${isCurrent ? 'bg-primary/5 dark:bg-primary/10 border border-primary/10' : ''}`}
                    >
                      <div className="shrink-0 mt-0.5">
                        {done ? (
                          <div className="size-5 rounded-full bg-emerald-500 flex items-center justify-center">
                            <span className="material-symbols-outlined text-[12px] text-white font-bold">check</span>
                          </div>
                        ) : (
                          <div className={`size-5 rounded-full border-2 flex items-center justify-center text-[10px] font-black ${isCurrent ? 'border-primary text-primary animate-pulse' : 'border-slate-300 dark:border-slate-700 text-slate-400'}`}>
                            {idx + 1}
                          </div>
                        )}
                      </div>
                      <p className={`text-[12px] leading-relaxed font-medium ${done
                        ? 'text-slate-400 dark:text-slate-500 line-through decoration-slate-300/50 dark:decoration-white/10'
                        : isCurrent
                          ? 'text-slate-900 dark:text-white font-bold'
                          : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {q}
                      </p>
                    </div>
                  );
                })}
                {interviewPlan.length === 1 && (
                  <div className="flex items-center gap-3 p-2 opacity-50">
                    <div className="size-5 flex items-center justify-center">
                      <div className="size-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.3s]"></div>
                      <div className="size-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.15s] mx-0.5"></div>
                      <div className="size-1.5 rounded-full bg-slate-400 animate-bounce"></div>
                    </div>
                    <p className="text-[11px] font-medium text-slate-400">正在生成后续题单...</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-2.5 px-1 py-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="size-5 rounded-md bg-slate-100 dark:bg-white/5 flex items-center justify-center animate-pulse">
                <span className="material-symbols-outlined text-[14px] text-slate-400">query_builder</span>
              </div>
              <p className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider animate-pulse">
                正在加载本场面试的题库...
              </p>
            </div>
          </div>
          <div className="h-2 rounded-full bg-slate-100 dark:bg-white/5 overflow-hidden border border-slate-200/50 dark:border-white/5">
            <div className="h-full w-1/2 bg-slate-200 dark:bg-white/10 rounded-full animate-[shimmer_1.5s_infinite] shadow-[0_0_10px_rgba(255,255,255,0.1)]"></div>
          </div>
        </div>
      )}
    </div>
  );
};
