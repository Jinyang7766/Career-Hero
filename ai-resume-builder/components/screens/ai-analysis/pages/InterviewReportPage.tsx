import React from 'react';
import AiDisclaimer from '../AiDisclaimer';
import BackButton from '../../../shared/BackButton';
import ReportFeedback from '../ReportFeedback';
import { useAppStore } from '../../../../src/app-store';
import {
  parseScoreFromText,
  parseSummarySections,
  parseTrainingPlanGroups,
  splitImprovementItems,
  splitModuleItems,
  splitPracticeSuggestion,
  extractIssueHeading,
  parseImprovementTriplet,
  type TrainingWeek,
} from './interview-report-parser';
import { EXPORT_WATERMARK_TEXT, useInterviewReportExport } from '../hooks/useInterviewReportExport';

type Props = {
  summary: string;
  score: number;
  advice: string[];
  onBack: () => void;
  onFeedback?: (rating: 'up' | 'down', reason?: string) => Promise<boolean> | boolean;
};

type ReportIconName = 'analytics' | 'auto_awesome' | 'lightbulb' | 'target' | 'event_upcoming' | 'format_quote' | 'download';

const getScoreColorClass = (score: number) => {
  if (score >= 90) return 'text-green-500';
  if (score >= 70) return 'text-primary';
  return 'text-orange-500';
};

const getScoreDotClass = (score: number) => {
  if (score >= 90) return 'bg-green-500';
  if (score >= 70) return 'bg-primary';
  return 'bg-orange-500';
};

const normalizeTextKey = (input: string) =>
  String(input || '')
    .replace(/[“”"'`（）()【】\[\]\s，,。！？!?；;：:、\-—]/g, '')
    .toLowerCase()
    .trim();

const dedupeRepeatedSentences = (input: string) => {
  const source = String(input || '').replace(/\s+/g, ' ').trim();
  if (!source) return '';
  const sentences = source
    .split(/(?<=[。！？!?；;])/u)
    .map((s) => String(s || '').trim())
    .filter(Boolean);
  if (sentences.length <= 1) return source;

  const kept: string[] = [];
  const seen = new Set<string>();
  for (const sentence of sentences) {
    const key = normalizeTextKey(sentence);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    kept.push(sentence);
  }
  return kept.join('').trim();
};

const isPlaceholderHighlight = (input: string) => {
  const key = normalizeTextKey(input);
  if (!key) return true;
  return new Set([
    '无',
    '暂无',
    '暂无亮点',
    '暂无明显亮点',
    '无明显亮点',
    '无表现亮点',
    'none',
    'na',
    'n/a',
    '未提及',
    '未提供',
  ]).has(key);
};

const sanitizeHighlightItems = (items: string[]) => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of items || []) {
    const deduped = dedupeRepeatedSentences(raw);
    const text = String(deduped || '').trim();
    if (!text || isPlaceholderHighlight(text)) continue;
    const key = normalizeTextKey(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
};

const ReportIcon: React.FC<{ name: ReportIconName; className?: string }> = ({ name, className = 'size-5' }) => {
  const common = `shrink-0 ${className}`;
  if (name === 'analytics') {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 19V5h16v14H4z" />
        <path d="M8 15v-3" />
        <path d="M12 15V9" />
        <path d="M16 15v-6" />
      </svg>
    );
  }
  if (name === 'auto_awesome') {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="currentColor" aria-hidden="true">
        <path d="M12 2l1.6 4.4L18 8l-4.4 1.6L12 14l-1.6-4.4L6 8l4.4-1.6L12 2zM5 13l1.1 2.9L9 17l-2.9 1.1L5 21l-1.1-2.9L1 17l2.9-1.1L5 13zm14 3l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z" />
      </svg>
    );
  }
  if (name === 'lightbulb') {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 18h6" />
        <path d="M10 22h4" />
        <path d="M12 2a7 7 0 0 0-4 12.8c.7.5 1 1 1 1.7V17h6v-.5c0-.7.3-1.2 1-1.7A7 7 0 0 0 12 2z" />
      </svg>
    );
  }
  if (name === 'target') {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (name === 'event_upcoming') {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M8 3v4M16 3v4M3 10h18M8 14h4" />
      </svg>
    );
  }
  if (name === 'download') {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3v12" />
        <path d="m7 10 5 5 5-5" />
        <path d="M5 21h14" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={common} fill="currentColor" aria-hidden="true">
      <path d="M8 7h8v2H8zM6 11h10v2H6zM8 15h8v2H8z" />
    </svg>
  );
};

const ReportSection: React.FC<{
  title: string;
  icon: ReportIconName;
  iconColor: string;
  children: React.ReactNode;
}> = ({ title, icon, iconColor, children }) => (
  <div className="bg-white dark:bg-surface-dark rounded-2xl p-6 shadow-sm border border-slate-200/60 dark:border-white/5 animate-in fade-in slide-in-from-bottom-2 duration-500">
    <div className="flex items-center gap-2.5 mb-5">
      <div className={`size-8 rounded-lg ${iconColor} flex items-center justify-center`}>
        <ReportIcon name={icon} className="size-5" />
      </div>
      <h3 className="font-black text-slate-900 dark:text-white text-base tracking-tight">{title}</h3>
    </div>
    <div className="space-y-4">{children}</div>
  </div>
);


const InterviewReportPage: React.FC<Props> = ({ summary, score, advice, onBack, onFeedback }) => {
  const resumeData = useAppStore((state) => state.resumeData);
  const reportRef = React.useRef<HTMLDivElement | null>(null);
  const { isExporting, handleSaveImage } = useInterviewReportExport({ reportRef, resumeData });
  const parsedSections = React.useMemo(
    () => parseSummarySections(String(summary || '').trim()),
    [summary]
  );
  const summaryScore = React.useMemo(
    () => parseScoreFromText(String(summary || '').trim()),
    [summary]
  );
  const highlightItems = React.useMemo(
    () => sanitizeHighlightItems(splitModuleItems(parsedSections.highlights)),
    [parsedSections.highlights]
  );
  const improvementItems = React.useMemo(() => {
    const fromSummary = splitImprovementItems(parsedSections.improvements);
    if (fromSummary.length > 0) return fromSummary;
    return (advice || []).map((x) => String(x || '').trim()).filter(Boolean);
  }, [parsedSections.improvements, advice]);
  const matchGapItems = React.useMemo(() => splitModuleItems(parsedSections.matchGap), [parsedSections.matchGap]);
  const planItems = React.useMemo(() => splitModuleItems(parsedSections.plan), [parsedSections.plan]);
  const trainingPlanGroups = React.useMemo(() => parseTrainingPlanGroups(parsedSections.plan), [parsedSections.plan]);

  const scoreNum = Number.isFinite(summaryScore as number)
    ? Math.round(summaryScore as number)
    : Math.round(score || 0);
  const scoreLabel = scoreNum >= 90
    ? '卓越表现'
    : scoreNum >= 80
      ? '优秀表现'
      : scoreNum >= 70
        ? '良好表现'
        : scoreNum >= 60
          ? '及格表现'
          : '仍需努力';

  return (
    <div className="flex flex-col min-h-screen bg-background-light dark:bg-[#0b1219] animate-in fade-in duration-500">
      <header className="fixed top-0 left-0 right-0 mx-auto w-full max-w-md z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-white/5">
        <div className="flex items-center justify-between h-14 px-4 relative">
          <BackButton onClick={onBack} className="-ml-2 size-9" iconClassName="text-[22px]" />
          <h1 className="text-base font-black tracking-tight text-slate-900 dark:text-white">面试深度反馈</h1>
          <div className="w-10"></div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pt-[72px] p-4 pb-[calc(3.75rem+env(safe-area-inset-bottom))] space-y-6 max-w-md mx-auto w-full">
        <div ref={reportRef} className={`space-y-6 ${isExporting ? 'report-exporting' : ''}`}>
          {/* Score Card */}
          <div className="relative overflow-hidden bg-white dark:bg-surface-dark rounded-2xl p-8 shadow-sm border border-slate-200/60 dark:border-white/5 group">
            <div className="absolute top-0 right-0 -mr-8 -mt-8 size-48 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-colors duration-700" />

            <div className="relative z-10 flex flex-col items-center text-center">
              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-4">综合评估得分</span>
              <div className="report-score-main flex items-end justify-center gap-1">
                <span className={`text-[72px] font-black tracking-tighter leading-none drop-shadow-sm ${getScoreColorClass(scoreNum)}`}>
                  {scoreNum}
                </span>
                <span className="text-xl font-bold text-slate-300 dark:text-slate-600 tracking-tight">/ 100</span>
              </div>
              <div className="report-score-badge mt-6 w-fit mx-auto flex items-center justify-center gap-2 px-3 py-1 bg-primary/5 dark:bg-primary/10 rounded-full border border-primary/10">
                <div className={`size-1.5 rounded-full ${getScoreDotClass(scoreNum)} ${isExporting ? '' : 'animate-pulse'}`} />
                <span className="text-[11px] font-black text-primary dark:text-blue-400 uppercase tracking-wider whitespace-nowrap shrink-0">
                  {scoreLabel}
                </span>
              </div>
            </div>
          </div>

          {/* Summary Card */}
          <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 to-primary rounded-2xl p-px shadow-lg shadow-primary/20 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="relative bg-white/95 dark:bg-surface-dark/95 backdrop-blur-md rounded-2xl px-7 py-7">
              {/* Decorative Background Icon */}
              <div className="absolute -right-4 -bottom-4 opacity-[0.03] dark:opacity-[0.05] pointer-events-none">
                <ReportIcon name="format_quote" className="size-[140px]" />
              </div>

              <div className="flex items-center gap-3 mb-6">
                <div className="size-9 rounded-lg bg-primary/10 dark:bg-primary/20 flex items-center justify-center">
                  <ReportIcon name="analytics" className="size-5 text-primary" />
                </div>
                <h3 className="font-black text-slate-900 dark:text-white text-base tracking-tight">综合评价总结</h3>
              </div>

              <div className="relative space-y-4">
                {(parsedSections.evaluation || '面试已结束，本次深度总结分析当前不可用，请稍后再试。')
                  .split('\n')
                  .filter(Boolean)
                  .map((p, i) => (
                    <p key={`summary-p-${i}`} className="text-[15px] text-slate-700 dark:text-slate-200 leading-[1.8] font-bold text-justify">
                      {p.trim()}
                    </p>
                  ))}
              </div>
            </div>
          </div>
          {!isExporting && onFeedback && <ReportFeedback onFeedback={onFeedback} showTitle={false} />}

          {/* Detailed Sections */}
          {highlightItems.length > 0 && (
            <>
              <ReportSection title="表现亮点" icon="auto_awesome" iconColor="bg-primary/10 dark:bg-primary/20 text-primary dark:text-blue-400">
                <div className="space-y-3 rounded-2xl border border-slate-100 dark:border-white/10 bg-slate-50/70 dark:bg-white/5 p-4">
                  {highlightItems.map((item, idx) => (
                    <div key={`highlight-${idx}`} className="rounded-xl bg-white dark:bg-[#1c2936] border border-slate-100 dark:border-white/10 p-3 shadow-sm">
                      <div className="flex items-start gap-2.5">
                        <div className="shrink-0 mt-1.5 size-1.5 rounded-full bg-primary" />
                        <div className="flex-1">
                          <p className="text-[13px] font-black text-primary dark:text-blue-400 mb-1 uppercase tracking-wider">亮点 {idx + 1}</p>
                          <p className="text-[14px] font-bold text-slate-700 dark:text-slate-200 leading-[1.6]">
                            {item}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ReportSection>
              {!isExporting && onFeedback && <ReportFeedback onFeedback={onFeedback} showTitle={false} />}
            </>
          )}

          <>
            <ReportSection title="需要加强的地方" icon="lightbulb" iconColor="bg-primary/10 dark:bg-primary/20 text-primary dark:text-blue-400">
              <div className="space-y-3 rounded-2xl border border-slate-100 dark:border-white/10 bg-slate-50/70 dark:bg-white/5 p-4">
                {(improvementItems.length > 0 ? improvementItems : [
                  '建议围绕岗位要求补充案例细节、决策过程与量化结果。',
                  '加强对个人职业价值观的表达，体现长期稳定性。',
                  '对过往失败经历进行更深度的复盘总结。'
                ]).map((item, idx) => {
                  const { main, practice } = splitPracticeSuggestion(item);
                  const issue = extractIssueHeading(main, idx);
                  const triplet = parseImprovementTriplet(issue.body);
                  const problemText = triplet.problem || issue.body;
                  const improveText = triplet.improve;
                  const practiceText = triplet.practice || practice;
                  const fallbackText = triplet.fallback;
                  return (
                    <div key={`improvement-${idx}`} className="rounded-xl bg-white dark:bg-[#1c2936] border border-slate-100 dark:border-white/10 p-3 shadow-sm">
                      <div className="flex items-start gap-2.5">
                        <div className="shrink-0 mt-1.5 size-1.5 rounded-full bg-primary/60" />
                        <div className="flex-1">
                          <p className="text-[13px] font-black text-primary dark:text-blue-400 mb-1 uppercase tracking-wider">{issue.title}</p>
                          <p className="text-[14px] font-bold text-slate-700 dark:text-slate-200 leading-[1.6]">
                            {problemText}
                          </p>
                          {improveText ? (
                            <div className="mt-3 pt-3 border-t border-slate-50 dark:border-white/5">
                              <p className="text-[12px] font-black text-primary dark:text-blue-400 mb-1">改进</p>
                              <p className="text-[13px] font-bold text-slate-600 dark:text-slate-400 leading-[1.6]">
                                {improveText}
                              </p>
                            </div>
                          ) : null}
                          {practiceText ? (
                            <div className="mt-3 pt-3 border-t border-slate-50 dark:border-white/5">
                              <p className="text-[12px] font-black text-primary dark:text-blue-400 mb-1">练习</p>
                              <p className="text-[13px] font-bold text-slate-600 dark:text-slate-400 leading-[1.6]">
                                {practiceText.replace(/^(建议练习|建议准备素材)\s*[：:]\s*/u, '')}
                              </p>
                            </div>
                          ) : null}
                          {fallbackText ? (
                            <p className="mt-3 text-[13px] font-bold text-slate-600 dark:text-slate-400 leading-[1.6]">
                              {fallbackText}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ReportSection>
            {!isExporting && onFeedback && <ReportFeedback onFeedback={onFeedback} showTitle={false} />}
          </>

          {matchGapItems.length > 0 && (
            <>
              <ReportSection title="职位匹配度与缺口" icon="target" iconColor="bg-primary/10 dark:bg-primary/20 text-primary dark:text-blue-400">
                <div className="space-y-3 rounded-2xl border border-slate-100 dark:border-white/10 bg-slate-50/70 dark:bg-white/5 p-4">
                  {matchGapItems.map((item, idx) => (
                    <div key={`gap-${idx}`} className="rounded-xl bg-white dark:bg-[#1c2936] border border-slate-100 dark:border-white/10 p-3 shadow-sm">
                      <div className="flex items-start gap-2.5">
                        <div className="shrink-0 mt-1.5 size-1.5 rounded-full bg-primary" />
                        <div className="flex-1">
                          <p className="text-[13px] font-black text-primary dark:text-blue-400 mb-1 uppercase tracking-wider">评估项 {idx + 1}</p>
                          <p className="text-[14px] font-bold text-slate-700 dark:text-slate-200 leading-[1.6]">
                            {item}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ReportSection>
              {!isExporting && onFeedback && <ReportFeedback onFeedback={onFeedback} showTitle={false} />}
            </>
          )}

          {planItems.length > 0 && (
            <>
              <ReportSection title="后续训练计划" icon="event_upcoming" iconColor="bg-primary/10 dark:bg-primary/20 text-primary dark:text-blue-400">
                {trainingPlanGroups.length > 0 ? (
                  <div className="space-y-3">
                    {trainingPlanGroups.map((week, weekIdx) => (
                      <div key={`week-${weekIdx}`} className="rounded-2xl border border-slate-100 dark:border-white/10 bg-slate-50/70 dark:bg-white/5 p-4">
                        <h4 className="text-[15px] font-black text-slate-900 dark:text-white mb-2">{week.title}</h4>
                        {week.intro ? (
                          <p className="text-[13px] font-bold text-slate-700 dark:text-slate-300 leading-[1.6] mb-2">{week.intro}</p>
                        ) : null}
                        <div className="space-y-2">
                          {week.days.map((day, dayIdx) => (
                            <div key={`week-${weekIdx}-day-${dayIdx}`} className="rounded-xl bg-white dark:bg-[#1c2936] border border-slate-100 dark:border-white/10 p-3">
                              <p className="text-[13px] font-black text-primary dark:text-blue-400 mb-1">{day.title}</p>
                              <p className="text-[13px] font-bold text-slate-700 dark:text-slate-300 leading-[1.6]">{day.content}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3 rounded-2xl border border-slate-100 dark:border-white/10 bg-slate-50/70 dark:bg-white/5 p-4">
                    {planItems.map((item, idx) => (
                      <div key={`plan-${idx}`} className="rounded-xl bg-white dark:bg-[#1c2936] border border-slate-100 dark:border-white/10 p-3 shadow-sm">
                        <div className="flex items-start gap-2.5">
                          <div className="shrink-0 mt-1.5 size-1.5 rounded-full bg-primary" />
                          <p className="text-[14px] font-bold text-slate-700 dark:text-slate-200 leading-[1.6]">
                            {item}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ReportSection>
              {!isExporting && onFeedback && <ReportFeedback onFeedback={onFeedback} showTitle={false} />}
            </>
          )}

          {isExporting ? (
            <>
              <div className="report-export-watermark mt-4 mb-12 py-1 text-center text-[12px] font-semibold tracking-[0.14em] text-slate-400">
                {EXPORT_WATERMARK_TEXT}
              </div>
              <div className="h-4" aria-hidden="true" />
            </>
          ) : null}
        </div>

        {/* Global Action */}
        <div className="pt-4 space-y-6">
          <div className="pt-2">
            <button
              type="button"
              onClick={() => { void handleSaveImage(); }}
              disabled={isExporting}
              className={`group w-full py-4 rounded-2xl bg-primary text-white text-[15px] font-black shadow-xl shadow-primary/25 hover:bg-blue-600 active:scale-[0.98] transition-all flex items-center justify-center gap-2 ${isExporting ? 'opacity-70 cursor-not-allowed shadow-none' : ''}`}
            >
              <div className="flex items-center justify-center gap-2">
                {isExporting ? (
                  <>
                    <span className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>报告生成中...</span>
                  </>
                ) : (
                  <>
                    <ReportIcon name="download" className="size-5 transition-transform group-hover:translate-y-[-2px]" />
                    <span>保存面试报告图片</span>
                  </>
                )}
              </div>
            </button>
            <p className="mt-3 text-[11px] text-center text-slate-400 dark:text-slate-500 font-bold opacity-60">报告将保存至您的本地相册</p>
          </div>

          <AiDisclaimer className="pt-4 opacity-40 text-center" />
        </div>
      </main>
      <style>
        {`
          .report-exporting,
          .report-exporting * {
            animation: none !important;
            transition: none !important;
          }
          .report-exporting .animate-in,
          .report-exporting .animate-pulse,
          .report-exporting [class*="slide-in-"],
          .report-exporting [class*="fade-in"] {
            transform: none !important;
            opacity: 1 !important;
          }
          .report-exporting .report-score-main {
            align-items: flex-end !important;
            justify-content: center !important;
          }
          .report-exporting .report-score-badge {
            margin-top: 20px !important;
            margin-left: auto !important;
            margin-right: auto !important;
            position: static !important;
            display: inline-flex !important;
            width: fit-content !important;
            align-items: center !important;
            justify-content: center !important;
            min-height: 34px !important;
            transform: none !important;
          }
          .report-exporting .report-export-watermark {
            display: block !important;
            opacity: 1 !important;
            transform: none !important;
          }
        `}
      </style>
    </div>
  );
};

export default InterviewReportPage;

