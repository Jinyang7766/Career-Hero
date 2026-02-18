import React from 'react';
import type { ResumeData } from '../../../../types';
import AiDisclaimer from '../AiDisclaimer';

type Props = {
  summary: string;
  originalResume: ResumeData | null;
  generatedResume: ResumeData | null;
  annotations: Array<{ id: string; title: string; reason: string; section: string; targetId?: string }>;
  onFeedback?: (rating: 'up' | 'down') => Promise<boolean> | boolean;
  onBack: () => void;
};

const ResumeBlock: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-surface-dark p-4">
    <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-2">{title}</h4>
    <div className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{children}</div>
  </div>
);

const PostInterviewReportPage: React.FC<Props> = ({
  summary,
  originalResume,
  generatedResume,
  annotations,
  onFeedback,
  onBack,
}) => {
  const [feedback, setFeedback] = React.useState<'up' | 'down' | null>(null);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = React.useState(false);
  const annBySection = annotations.reduce<Record<string, Array<{ id: string; title: string; reason: string; targetId?: string }>>>((acc, item) => {
    const key = item.section || 'other';
    if (!acc[key]) acc[key] = [];
    acc[key].push({ id: item.id, title: item.title, reason: item.reason, targetId: item.targetId });
    return acc;
  }, {});

  const renderSectionNotes = (section: string) => (
    (annBySection[section] || []).filter((n) => !String(n.targetId || '').trim()).slice(0, 3).map((n) => (
      <div key={n.id} className="mb-2 rounded-lg border border-amber-200 dark:border-amber-900/30 bg-amber-50/60 dark:bg-amber-900/10 p-2">
        <p className="text-[11px] font-bold text-amber-700 dark:text-amber-300">{n.title}</p>
        <p className="text-xs text-slate-600 dark:text-slate-300">{n.reason}</p>
      </div>
    ))
  );

  const renderItemNotes = (section: string, itemId: string) => (
    (annBySection[section] || [])
      .filter((n) => String(n.targetId || '').trim() === itemId)
      .slice(0, 3)
      .map((n) => (
        <div key={`${section}-${itemId}-${n.id}`} className="mb-2 rounded-lg border border-amber-200 dark:border-amber-900/30 bg-amber-50/60 dark:bg-amber-900/10 p-2">
          <p className="text-[11px] font-bold text-amber-700 dark:text-amber-300">{n.title}</p>
          <p className="text-xs text-slate-600 dark:text-slate-300">{n.reason}</p>
        </div>
      ))
  );

  const renderWorkList = (items: any[] = []) => items.map((w: any, idx: number) => {
    const itemId = String(w?.id ?? idx);
    return (
      <div key={itemId} className="mb-3 last:mb-0">
        {renderItemNotes('workExps', itemId)}
        <p className="font-semibold">{w.company || w.title || '工作经历'}</p>
        <p className="text-xs opacity-80">{w.subtitle || w.position || ''} {w.date ? `· ${w.date}` : ''}</p>
        <p className="text-sm mt-1 whitespace-pre-wrap">{w.description || ''}</p>
      </div>
    );
  });

  const renderProjectList = (items: any[] = []) => items.map((p, idx) => {
    const itemId = String(p?.id ?? idx);
    return (
      <div key={itemId} className="mb-3 last:mb-0">
        {renderItemNotes('projects', itemId)}
        <p className="font-semibold">{p.title || '项目经历'}</p>
        <p className="text-xs opacity-80">{p.subtitle || ''} {p.date ? `· ${p.date}` : ''}</p>
        <p className="text-sm mt-1 whitespace-pre-wrap">{p.description || ''}</p>
      </div>
    );
  });

  const renderResume = (data: ResumeData | null, withAnnotations: boolean) => {
    if (!data) return <p className="text-sm text-slate-500 dark:text-slate-400">暂无简历内容</p>;
    return (
      <div className="space-y-3">
        <ResumeBlock title="基本信息">
          {withAnnotations && renderSectionNotes('personalInfo')}
          <p>{data.personalInfo?.name || ''} {data.personalInfo?.title ? `· ${data.personalInfo.title}` : ''}</p>
          <p className="text-xs opacity-80">{data.personalInfo?.email || ''} {data.personalInfo?.phone ? `· ${data.personalInfo.phone}` : ''}</p>
        </ResumeBlock>
        <ResumeBlock title="个人简介">
          {withAnnotations && renderSectionNotes('summary')}
          <p className="whitespace-pre-wrap">{data.summary || data.personalInfo?.summary || '暂无'}</p>
        </ResumeBlock>
        <ResumeBlock title="工作经历">
          {withAnnotations && renderSectionNotes('workExps')}
          {renderWorkList((data as any).workExps || [])}
        </ResumeBlock>
        <ResumeBlock title="项目经历">
          {withAnnotations && renderSectionNotes('projects')}
          {renderProjectList((data as any).projects || [])}
        </ResumeBlock>
        <ResumeBlock title="技能">
          {withAnnotations && renderSectionNotes('skills')}
          <p>{Array.isArray((data as any).skills) ? (data as any).skills.join('、') : ''}</p>
        </ResumeBlock>
      </div>
    );
  };

  const handleFeedbackClick = async (next: 'up' | 'down') => {
    const nextValue = feedback === next ? null : next;
    setFeedback(nextValue);
    if (!nextValue || !onFeedback) return;
    setIsSubmittingFeedback(true);
    try {
      const ok = await onFeedback(nextValue);
      if (ok === false) {
        setFeedback(feedback);
      }
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background-light dark:bg-background-dark animate-in fade-in duration-300">
      <header className="sticky top-0 z-40 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md border-b border-slate-200 dark:border-white/5">
        <div className="flex items-center justify-between h-14 px-4 relative">
          <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-slate-200 dark:hover:bg-white/10 text-slate-900 dark:text-white" type="button">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <h1 className="text-base font-bold tracking-tight">微访谈综合报告</h1>
          <div className="w-8"></div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 pb-[calc(5.75rem+env(safe-area-inset-bottom))] space-y-4">
        <div className="rounded-2xl p-5 border border-blue-100 dark:border-blue-900/20 bg-blue-50/50 dark:bg-blue-900/10">
          <h3 className="text-base font-bold text-blue-800 dark:text-blue-400 mb-2">综合总结</h3>
          <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{summary || '暂无总结'}</p>
        </div>

        <section>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2">原简历（含批注）</h3>
          {renderResume(originalResume, true)}
        </section>

        <section>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2">AI 生成新简历</h3>
          {renderResume(generatedResume, false)}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => { void handleFeedbackClick('up'); }}
              disabled={isSubmittingFeedback}
              className={`h-9 w-9 rounded-full border flex items-center justify-center transition-colors ${
                feedback === 'up'
                  ? 'border-primary bg-primary text-white'
                  : 'border-slate-300 dark:border-white/15 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10'
              } ${isSubmittingFeedback ? 'opacity-60 cursor-not-allowed' : ''}`}
              aria-label="有帮助"
              title="有帮助"
            >
              <span className="material-symbols-outlined text-[18px]">thumb_up</span>
            </button>
            <button
              type="button"
              onClick={() => { void handleFeedbackClick('down'); }}
              disabled={isSubmittingFeedback}
              className={`h-9 w-9 rounded-full border flex items-center justify-center transition-colors ${
                feedback === 'down'
                  ? 'border-primary bg-primary text-white'
                  : 'border-slate-300 dark:border-white/15 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10'
              } ${isSubmittingFeedback ? 'opacity-60 cursor-not-allowed' : ''}`}
              aria-label="没帮助"
              title="没帮助"
            >
              <span className="material-symbols-outlined text-[18px]">thumb_down</span>
            </button>
          </div>
        </section>
        <AiDisclaimer className="pt-1" />
      </main>
    </div>
  );
};

export default PostInterviewReportPage;
