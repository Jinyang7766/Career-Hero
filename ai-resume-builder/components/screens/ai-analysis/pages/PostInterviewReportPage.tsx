import React from 'react';
import type { ResumeData } from '../../../../types';
import { View } from '../../../../types';
import AiDisclaimer from '../AiDisclaimer';
import BackButton from '../../../shared/BackButton';
import ReportFeedback from '../ReportFeedback';
import { useEditablePostInterviewResume } from '../hooks/useEditablePostInterviewResume';
import { useAppContext } from '../../../../src/app-context';
import {
  buildModuleOverview,
  getUniformSectionNote,
  groupAnnotationsBySection,
  isDescriptionNote,
  isModuleOnlyNote,
  normalizeForMatch,
  noteSignature,
  splitSentences,
  type AnnotationItem,
} from './post-interview-annotations';

type Props = {
  generatedResume: ResumeData | null;
  annotations: Array<{
    id: string;
    title: string;
    reason: string;
    section: string;
    targetId?: string;
    targetField?: string;
    originalValue?: string;
    suggestedValue?: string;
  }>;
  onFeedback?: (rating: 'up' | 'down', reason?: string) => Promise<boolean> | boolean;
  onCompleteAndSave?: (editedResume?: ResumeData | null) => Promise<void> | void;
  onBack: () => void;
  onBackToJdInput?: () => void;
};

export const resolvePostInterviewSaveResult = (saveSucceeded: boolean) => ({
  shouldOpenSuccessModal: saveSucceeded,
  shouldNavigateImmediately: false,
});

export const SELECTION_REWRITE_MAX_CHARS = 280;

export const resolveSelectionRewriteBoundaryReason = (
  selectionText: string,
  maxChars = SELECTION_REWRITE_MAX_CHARS
): 'empty' | 'too_long' | null => {
  const raw = String(selectionText || '');
  const trimmed = raw.trim();
  if (!trimmed) return 'empty';
  if (trimmed.length > maxChars) return 'too_long';
  return null;
};

export const applySelectionRewriteToText = (
  source: string,
  rangeStart: number,
  rangeEnd: number,
  replacement: string
): string => {
  const raw = String(source || '');
  const start = Number.isFinite(rangeStart) ? Math.max(0, Math.floor(rangeStart)) : 0;
  const end = Number.isFinite(rangeEnd) ? Math.max(start, Math.floor(rangeEnd)) : start;
  if (start >= raw.length || end <= start) return raw;
  return `${raw.slice(0, start)}${String(replacement || '')}${raw.slice(end)}`;
};

const ResumeBlock: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="rounded-2xl border border-slate-200/60 dark:border-white/5 bg-white dark:bg-surface-dark p-6 shadow-sm">
    <h4 className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
      <div className="size-1.5 rounded-full bg-primary" />
      {title}
    </h4>
    <div className="text-[14px] text-slate-700 dark:text-slate-200 leading-relaxed font-bold">{children}</div>
  </div>
);

const AutoResizeTextarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = (props) => {
  const localRef = React.useRef<HTMLTextAreaElement | null>(null);
  const { className = '', onInput, ...rest } = props;

  const resize = React.useCallback(() => {
    const el = localRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  React.useLayoutEffect(() => {
    resize();
  }, [resize, props.value]);

  return (
    <textarea
      {...rest}
      ref={localRef}
      onInput={(e) => {
        resize();
        onInput?.(e);
      }}
      className={`${className} overflow-hidden`}
    />
  );
};

const PostInterviewReportPage: React.FC<Props> = ({
  generatedResume,
  annotations,
  onFeedback,
  onCompleteAndSave,
  onBack,
}) => {
  const navigateToView = useAppContext((s) => s.navigateToView);
  const [showSaveSuccessModal, setShowSaveSuccessModal] = React.useState(false);
  const {
    isSaving,
    editableGeneratedResume,
    handleCompleteAndSaveClick,
    updateGeneratedPersonalInfo,
    updateGeneratedSummary,
    updateGeneratedSkills,
    updateGeneratedWorkField,
    updateGeneratedProjectField,
    updateGeneratedEducationField,
    applyGeneratedSelectionRewrite,
    getDisplayDate,
  } = useEditablePostInterviewResume({
    generatedResume,
    onCompleteAndSave,
  });
  const handleSaveAsNewResumeClick = React.useCallback(async () => {
    const outcome = resolvePostInterviewSaveResult(await handleCompleteAndSaveClick());
    if (outcome.shouldOpenSuccessModal) {
      setShowSaveSuccessModal(true);
    }
  }, [handleCompleteAndSaveClick]);
  const handleGoToAllResumes = React.useCallback(() => {
    setShowSaveSuccessModal(false);
    navigateToView(View.ALL_RESUMES, { replace: true });
  }, [navigateToView]);
  const annBySection = React.useMemo(
    () => groupAnnotationsBySection(annotations),
    [annotations]
  );

  type SelectionRewriteSection = 'workExps' | 'projects';
  type SelectionRewriteDraft = {
    section: SelectionRewriteSection;
    index: number;
    start: number;
    end: number;
    text: string;
  };

  const [selectionRewriteDraft, setSelectionRewriteDraft] = React.useState<SelectionRewriteDraft | null>(null);
  const [selectionRewriteMessage, setSelectionRewriteMessage] = React.useState('');

  const captureSelectionRewriteFromTextarea = React.useCallback((
    section: SelectionRewriteSection,
    index: number,
    target: HTMLTextAreaElement
  ) => {
    const start = Number(target.selectionStart ?? 0);
    const end = Number(target.selectionEnd ?? 0);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      setSelectionRewriteDraft((prev) => {
        if (prev && prev.section === section && prev.index === index) {
          return null;
        }
        return prev;
      });
      return;
    }
    const selectedText = String(target.value || '').slice(start, end);
    if (!selectedText.trim()) {
      setSelectionRewriteDraft(null);
      return;
    }
    setSelectionRewriteDraft({ section, index, start, end, text: selectedText });
    setSelectionRewriteMessage('');
  }, []);

  const makeSelectionRewriteHandlers = React.useCallback((section: SelectionRewriteSection, index: number) => ({
    onSelect: (event: React.SyntheticEvent<HTMLTextAreaElement>) => {
      captureSelectionRewriteFromTextarea(section, index, event.currentTarget);
    },
    onMouseUp: (event: React.MouseEvent<HTMLTextAreaElement>) => {
      captureSelectionRewriteFromTextarea(section, index, event.currentTarget);
    },
    onKeyUp: (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      captureSelectionRewriteFromTextarea(section, index, event.currentTarget);
    },
    onBlur: (event: React.FocusEvent<HTMLTextAreaElement>) => {
      captureSelectionRewriteFromTextarea(section, index, event.currentTarget);
    },
  }), [captureSelectionRewriteFromTextarea]);

  const selectionRewriteBoundaryReason = React.useMemo(
    () => resolveSelectionRewriteBoundaryReason(selectionRewriteDraft?.text || ''),
    [selectionRewriteDraft]
  );

  const selectionRewriteCandidate = React.useMemo(() => {
    if (!selectionRewriteDraft) return null;
    const list = selectionRewriteDraft.section === 'workExps'
      ? (editableGeneratedResume as any)?.workExps
      : (editableGeneratedResume as any)?.projects;
    const item = Array.isArray(list) ? list[selectionRewriteDraft.index] : null;
    const itemId = String(item?.id ?? selectionRewriteDraft.index);
    const notes = (annBySection[selectionRewriteDraft.section] || [])
      .filter((note) => !isModuleOnlyNote(note))
      .filter((note) => isDescriptionNote(note))
      .filter((note) => String(note.suggestedValue || '').trim().length > 0);
    if (!notes.length) return null;

    const normalizedSelection = normalizeForMatch(selectionRewriteDraft.text);
    const withExactTarget = notes.filter((note) => String(note.targetId || '').trim() === itemId);
    const withBlankTarget = notes.filter((note) => !String(note.targetId || '').trim());
    const candidatePool = withExactTarget.length ? withExactTarget : withBlankTarget;

    const matched = candidatePool.find((note) => {
      const original = normalizeForMatch(String(note.originalValue || ''));
      if (!original || !normalizedSelection) return false;
      return original.includes(normalizedSelection) || normalizedSelection.includes(original);
    });

    return matched || null;
  }, [selectionRewriteDraft, annBySection, editableGeneratedResume]);

  const canApplySelectionRewrite = Boolean(
    selectionRewriteDraft &&
    selectionRewriteCandidate &&
    !selectionRewriteBoundaryReason
  );

  const handleApplySelectionRewrite = React.useCallback(() => {
    if (!selectionRewriteDraft || !selectionRewriteCandidate) return;
    if (selectionRewriteBoundaryReason) return;
    const suggestedText = String(selectionRewriteCandidate.suggestedValue || '').trim();
    if (!suggestedText) return;

    const didApply = applyGeneratedSelectionRewrite({
      section: selectionRewriteDraft.section,
      index: selectionRewriteDraft.index,
      rangeStart: selectionRewriteDraft.start,
      rangeEnd: selectionRewriteDraft.end,
      replacement: suggestedText,
    });

    if (!didApply) {
      setSelectionRewriteMessage('选区已失效，请重新选中后再试。');
      return;
    }

    setSelectionRewriteMessage('已应用选区改写，结果已回写到当前编辑内容。');
    setSelectionRewriteDraft(null);
  }, [
    selectionRewriteDraft,
    selectionRewriteCandidate,
    selectionRewriteBoundaryReason,
    applyGeneratedSelectionRewrite,
  ]);

  const renderInlineNote = (_key: string, _note: { title: string; reason: string }) => null;
  const renderModuleFeedback = () => (
    onFeedback ? (
      <div className="mt-3">
        <ReportFeedback onFeedback={onFeedback} showTitle={false} variant="compact" />
      </div>
    ) : null
  );

  const renderModuleOverview = (section: string, label: string, hasContent = true) => {
    const overview = buildModuleOverview(annBySection, section, hasContent);
    if (!overview) return null;
    return (
      <div className="mb-2.5 rounded-lg border border-primary/20 bg-primary/5 p-2.5 animate-in fade-in slide-in-from-top-2 duration-300">
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="material-symbols-outlined text-primary text-[16px]">verified</span>
          <p className="text-[9px] font-black text-primary uppercase tracking-[0.12em]">{label}诊断建议</p>
        </div>
        <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 leading-[1.5]">{overview}</p>
      </div>
    );
  };


  const renderTextWithSentenceNotes = (text: string, notes: AnnotationItem[], keyPrefix: string, allowInline: boolean) => {
    const sourceText = String(text || '').trim();
    if (!allowInline || !notes.length || !sourceText) return <p className="text-sm mt-1 whitespace-pre-wrap">{sourceText || '暂无'}</p>;

    const sentences = splitSentences(sourceText);
    const mapped: Array<AnnotationItem[]> = sentences.map(() => []);
    const used = new Set<string>();

    notes.forEach((note) => {
      const target = normalizeForMatch(String(note.originalValue || ''));
      if (!target || target.length < 4) return;
      const hitIdx = sentences.findIndex((s) => {
        const candidate = normalizeForMatch(s);
        return candidate.includes(target) || target.includes(candidate);
      });
      if (hitIdx >= 0) {
        mapped[hitIdx].push(note);
        used.add(note.id);
      }
    });

    let fallbackIdx = 0;
    notes.forEach((note) => {
      if (used.has(note.id)) return;
      const idx = Math.min(fallbackIdx, Math.max(0, sentences.length - 1));
      mapped[idx].push(note);
      fallbackIdx += 1;
    });

    const mappedNotes = mapped.flat();
    const noteSigs = new Set(mappedNotes.map((n) => noteSignature(n)));
    const isAllSameRepeated = mappedNotes.length >= Math.max(2, sentences.length) && noteSigs.size === 1;
    if (isAllSameRepeated) {
      return <p className="text-sm mt-1 whitespace-pre-wrap">{sourceText || '暂无'}</p>;
    }
    const shownNoteSigs = new Set<string>();

    return (
      <div className="space-y-2 mt-1">
        {sentences.map((sentence, idx) => (
          <div key={`${keyPrefix}-sent-${idx}`}>
            <p className="whitespace-pre-wrap">{sentence}</p>
            {mapped[idx]
              .filter((note) => {
                const sig = noteSignature(note);
                if (shownNoteSigs.has(sig)) return false;
                shownNoteSigs.add(sig);
                return true;
              })
              .slice(0, 3)
              .map((note) => renderInlineNote(`${keyPrefix}-note-${idx}-${note.id}`, note))}
          </div>
        ))}
      </div>
    );
  };

  const renderSummaryWithInlineNotes = (data: ResumeData, allowInline: boolean) => {
    const summaryText = String(data.summary || data.personalInfo?.summary || '暂无');
    if (!allowInline) {
      return <p className="whitespace-pre-wrap">{summaryText}</p>;
    }
    const rawSummaryNotes = (annBySection.summary || [])
      .filter((n) => !isModuleOnlyNote(n))
      .filter((n) => !String(n.targetId || '').trim())
      .slice(0, 6);
    const seenSummarySignatures = new Set<string>();
    const summaryNotes = rawSummaryNotes.filter((n) => {
      const sig = noteSignature(n);
      if (!sig) return false;
      if (seenSummarySignatures.has(sig)) return false;
      seenSummarySignatures.add(sig);
      return true;
    });
    const summaryUniform = getUniformSectionNote(annBySection, 'summary');
    if (summaryUniform?.reason) {
      return <p className="whitespace-pre-wrap">{summaryText}</p>;
    }
    if (!summaryNotes.length) {
      return <p className="whitespace-pre-wrap">{summaryText}</p>;
    }

    const sentences = (summaryText.match(/[^。！？!?；;]+[。！？!?；;]?/g) || [])
      .map((s) => s.trim())
      .filter(Boolean);
    const chunks = sentences.length ? sentences : [summaryText];

    return (
      <div className="space-y-2">
        {chunks.map((chunk, idx) => (
          <div key={`summary-sentence-${idx}`}>
            <p className="whitespace-pre-wrap">{chunk}</p>
            {summaryNotes[idx] && renderInlineNote(`summary-note-${summaryNotes[idx].id}`, summaryNotes[idx])}
          </div>
        ))}
        {summaryNotes.slice(chunks.length).map((note) => renderInlineNote(`summary-extra-${note.id}`, note))}
      </div>
    );
  };

  const renderWorkList = (items: any[] = [], allowInline = true) => {
    const sectionNotes = (annBySection.workExps || []).filter((n) => !isModuleOnlyNote(n));
    const unmatchedNoIdDescNotes = sectionNotes.filter((n) => !String(n.targetId || '').trim() && isDescriptionNote(n));
    const consumedNoId = new Set<string>();
    let roundRobinIdx = 0;

    return items.map((w: any, idx: number) => {
      const itemId = String(w?.id ?? idx);
      const descText = String(w?.description || '');
      const descNorm = normalizeForMatch(descText);

      const directItemNotes = sectionNotes.filter((n) => String(n.targetId || '').trim() === itemId);
      const matchedNoIdDescNotes = unmatchedNoIdDescNotes.filter((n) => {
        if (consumedNoId.has(n.id)) return false;
        const ov = normalizeForMatch(String(n.originalValue || ''));
        if (!ov || ov.length < 4) return false;
        const hit = descNorm.includes(ov) || ov.includes(descNorm.slice(0, Math.min(24, descNorm.length)));
        if (hit) consumedNoId.add(n.id);
        return hit;
      });
      const fallbackNoIdNotes: AnnotationItem[] = [];
      if (!matchedNoIdDescNotes.length) {
        const remain = unmatchedNoIdDescNotes.filter((n) => !consumedNoId.has(n.id));
        if (remain.length > 0 && items.length > 0) {
          const targetIdx = roundRobinIdx % items.length;
          if (targetIdx === idx) {
            const pick = remain[0];
            consumedNoId.add(pick.id);
            fallbackNoIdNotes.push(pick);
            roundRobinIdx += 1;
          }
        }
      }
      const itemNotes = [...directItemNotes, ...matchedNoIdDescNotes, ...fallbackNoIdNotes];
      const descriptionNotes = itemNotes.filter(isDescriptionNote);
      const metaNotes = itemNotes.filter((n) => !isDescriptionNote(n));

      return (
        <div key={itemId} className="mb-3 last:mb-0">
          {metaNotes.slice(0, 3).map((n) => renderInlineNote(`workExps-${itemId}-${n.id}`, n))}
          <p className="font-semibold">{w.company || w.title || '工作经历'}</p>
          <p className="text-xs opacity-80">{w.subtitle || w.position || ''} {w.date ? `· ${w.date}` : ''}</p>
          {renderTextWithSentenceNotes(String(w.description || ''), descriptionNotes, `workExps-${itemId}`, allowInline)}
        </div>
      );
    });
  };

  const renderProjectList = (items: any[] = [], allowInline = true) => {
    const sectionNotes = (annBySection.projects || []).filter((n) => !isModuleOnlyNote(n));
    const unmatchedNoIdDescNotes = sectionNotes.filter((n) => !String(n.targetId || '').trim() && isDescriptionNote(n));
    const consumedNoId = new Set<string>();
    let roundRobinIdx = 0;

    return items.map((p, idx) => {
      const itemId = String(p?.id ?? idx);
      const descText = String(p?.description || '');
      const descNorm = normalizeForMatch(descText);

      const directItemNotes = sectionNotes.filter((n) => String(n.targetId || '').trim() === itemId);
      const matchedNoIdDescNotes = unmatchedNoIdDescNotes.filter((n) => {
        if (consumedNoId.has(n.id)) return false;
        const ov = normalizeForMatch(String(n.originalValue || ''));
        if (!ov || ov.length < 4) return false;
        const hit = descNorm.includes(ov) || ov.includes(descNorm.slice(0, Math.min(24, descNorm.length)));
        if (hit) consumedNoId.add(n.id);
        return hit;
      });
      const fallbackNoIdNotes: AnnotationItem[] = [];
      if (!matchedNoIdDescNotes.length) {
        const remain = unmatchedNoIdDescNotes.filter((n) => !consumedNoId.has(n.id));
        if (remain.length > 0 && items.length > 0) {
          const targetIdx = roundRobinIdx % items.length;
          if (targetIdx === idx) {
            const pick = remain[0];
            consumedNoId.add(pick.id);
            fallbackNoIdNotes.push(pick);
            roundRobinIdx += 1;
          }
        }
      }
      const itemNotes = [...directItemNotes, ...matchedNoIdDescNotes, ...fallbackNoIdNotes];
      const descriptionNotes = itemNotes.filter(isDescriptionNote);
      const metaNotes = itemNotes.filter((n) => !isDescriptionNote(n));

      return (
        <div key={itemId} className="mb-3 last:mb-0">
          {metaNotes.slice(0, 3).map((n) => renderInlineNote(`projects-${itemId}-${n.id}`, n))}
          <p className="font-semibold">{p.title || '项目经历'}</p>
          <p className="text-xs opacity-80">{p.subtitle || ''} {p.date ? `· ${p.date}` : ''}</p>
          {renderTextWithSentenceNotes(String(p.description || ''), descriptionNotes, `projects-${itemId}`, allowInline)}
        </div>
      );
    });
  };

  const renderResume = (data: ResumeData | null, withAnnotations: boolean) => {
    if (!data) return <p className="text-sm text-slate-500 dark:text-slate-400">暂无简历内容</p>;
    const workItems = (data as any).workExps || [];
    const educationItems = (data as any).educations || [];
    const projectItems = (data as any).projects || [];
    const hasWorkContent = Array.isArray(workItems) && workItems.length > 0;
    const hasEducationContent = Array.isArray(educationItems) && educationItems.length > 0;
    const hasProjectContent = Array.isArray(projectItems) && projectItems.length > 0;
    return (
      <div className="space-y-3">
        <ResumeBlock title="基本信息">
          {withAnnotations && renderModuleOverview('personalInfo', '基本信息')}
          <p>{data.personalInfo?.name || ''} {data.personalInfo?.title ? `· ${data.personalInfo.title}` : ''}</p>
          <p className="text-xs opacity-80">{data.personalInfo?.email || ''} {data.personalInfo?.phone ? `· ${data.personalInfo.phone}` : ''}</p>
        </ResumeBlock>
        {renderModuleFeedback()}
        <ResumeBlock title="个人简介">
          {withAnnotations && renderModuleOverview('summary', '个人简介')}
          {withAnnotations ? renderSummaryWithInlineNotes(data, true) : <p className="whitespace-pre-wrap">{data.summary || data.personalInfo?.summary || '暂无'}</p>}
        </ResumeBlock>
        {renderModuleFeedback()}
        <ResumeBlock title="工作经历">
          {withAnnotations && hasWorkContent && renderModuleOverview('workExps', '工作经历')}
          {hasWorkContent ? renderWorkList(workItems, withAnnotations) : <p className="text-sm text-slate-500 dark:text-slate-400">暂无工作经历</p>}
        </ResumeBlock>
        {renderModuleFeedback()}
        <ResumeBlock title="教育背景">
          {hasEducationContent ? (
            educationItems.map((e: any, idx: number) => (
              <div key={String(e?.id ?? idx)} className="mb-3 last:mb-0">
                <p className="font-semibold">{e.school || e.title || '教育经历'}</p>
                <p className="text-xs opacity-80">
                  {e.degree || ''}{(e.degree || (e.major || e.subtitle)) ? ' · ' : ''}{e.major || e.subtitle || ''}
                  {getDisplayDate(e) ? ` · ${getDisplayDate(e)}` : ''}
                </p>
              </div>
            ))
          ) : <p className="text-sm text-slate-500 dark:text-slate-400">暂无教育背景</p>}
        </ResumeBlock>
        {renderModuleFeedback()}
        <ResumeBlock title="项目经历">
          {withAnnotations && renderModuleOverview('projects', '项目经历', hasProjectContent)}
          {hasProjectContent ? renderProjectList(projectItems, withAnnotations) : <p className="text-sm text-slate-500 dark:text-slate-400">暂无项目经历</p>}
        </ResumeBlock>
        {renderModuleFeedback()}
        <ResumeBlock title="技能">
          {withAnnotations && renderModuleOverview('skills', '技能')}
          <p>{Array.isArray((data as any).skills) ? (data as any).skills.join('、') : ''}</p>
        </ResumeBlock>
        {renderModuleFeedback()}
      </div>
    );
  };

  const renderEditableGeneratedResume = (data: ResumeData | null) => {
    if (!data) return <p className="text-sm text-slate-500 dark:text-slate-400">暂无简历内容</p>;
    const workItems = Array.isArray((data as any).workExps) ? (data as any).workExps : [];
    const educationItems = Array.isArray((data as any).educations) ? (data as any).educations : [];
    const projectItems = Array.isArray((data as any).projects) ? (data as any).projects : [];
    const skillsText = Array.isArray((data as any).skills) ? ((data as any).skills as string[]).join('、') : '';
    return (
      <div className="space-y-4">
        <ResumeBlock title="基本信息">
          <div className="grid grid-cols-2 gap-3">
            <input className="h-11 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-white/5 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all text-sm font-bold text-slate-900 dark:text-white px-4" value={String(data.personalInfo?.name || '')} onChange={(e) => updateGeneratedPersonalInfo('name', e.target.value)} placeholder="姓名" />
            <input className="h-11 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-white/5 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all text-sm font-bold text-slate-900 dark:text-white px-4" value={String(data.personalInfo?.title || '')} onChange={(e) => updateGeneratedPersonalInfo('title', e.target.value)} placeholder="职位" />
            <input className="h-11 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-white/5 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all text-sm font-bold text-slate-900 dark:text-white px-4" value={String(data.personalInfo?.email || '')} onChange={(e) => updateGeneratedPersonalInfo('email', e.target.value)} placeholder="邮箱" />
            <input className="h-11 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-white/5 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all text-sm font-bold text-slate-900 dark:text-white px-4" value={String(data.personalInfo?.phone || '')} onChange={(e) => updateGeneratedPersonalInfo('phone', e.target.value)} placeholder="电话" />
          </div>
        </ResumeBlock>
        {renderModuleFeedback()}
        <ResumeBlock title="个人简介">
          <AutoResizeTextarea className="w-full min-h-[120px] rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-white/5 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all text-sm font-bold text-slate-900 dark:text-white px-4 py-3 resize-none leading-relaxed" value={String(data.summary || data.personalInfo?.summary || '')} onChange={(e) => updateGeneratedSummary(e.target.value)} placeholder="个人简介" />
        </ResumeBlock>
        {renderModuleFeedback()}
        <ResumeBlock title="工作经历">
          {workItems.length === 0 ? <p className="text-sm text-slate-500 dark:text-slate-400 italic">暂无工作经历</p> : workItems.map((w: any, idx: number) => (
            <div key={String(w?.id ?? idx)} className="mb-6 last:mb-0 space-y-3 pb-6 last:pb-0 border-b last:border-0 border-slate-100 dark:border-white/5">
              <input className="h-11 w-full rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-white/5 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all text-sm font-bold text-slate-900 dark:text-white px-4" value={String(w?.company || w?.title || '')} onChange={(e) => updateGeneratedWorkField(idx, 'company', e.target.value)} placeholder="公司/经历名称" />
              <div className="grid grid-cols-2 gap-3">
                <input className="h-11 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-white/5 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all text-sm font-bold text-slate-900 dark:text-white px-4" value={String(w?.position || w?.subtitle || '')} onChange={(e) => updateGeneratedWorkField(idx, 'position', e.target.value)} placeholder="岗位" />
                <input className="h-11 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-white/5 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all text-sm font-bold text-slate-900 dark:text-white px-4" value={getDisplayDate(w)} onChange={(e) => updateGeneratedWorkField(idx, 'date', e.target.value)} placeholder="时间" />
              </div>
              <AutoResizeTextarea className="w-full min-h-[140px] rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-white/5 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all text-sm font-bold text-slate-900 dark:text-white px-4 py-3 resize-none leading-relaxed" value={String(w?.description || '')} onChange={(e) => updateGeneratedWorkField(idx, 'description', e.target.value)} {...makeSelectionRewriteHandlers('workExps', idx)} placeholder="工作描述" />
            </div>
          ))}
        </ResumeBlock>
        {renderModuleFeedback()}
        <ResumeBlock title="教育背景">
          {educationItems.length === 0 ? <p className="text-sm text-slate-500 dark:text-slate-400 italic">暂无教育背景</p> : educationItems.map((e: any, idx: number) => (
            <div key={String(e?.id ?? idx)} className="mb-6 last:mb-0 space-y-3 pb-6 last:pb-0 border-b last:border-0 border-slate-100 dark:border-white/5">
              <input className="h-11 w-full rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-white/5 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all text-sm font-bold text-slate-900 dark:text-white px-4" value={String(e?.school || e?.title || '')} onChange={(ev) => updateGeneratedEducationField(idx, 'title', ev.target.value)} placeholder="学校" />
              <div className="grid grid-cols-2 gap-3">
                <input className="h-11 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-white/5 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all text-sm font-bold text-slate-900 dark:text-white px-4" value={String(e?.degree || '')} onChange={(ev) => updateGeneratedEducationField(idx, 'degree', ev.target.value)} placeholder="学历" />
                <input className="h-11 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-white/5 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all text-sm font-bold text-slate-900 dark:text-white px-4" value={String(e?.major || e?.subtitle || '')} onChange={(ev) => updateGeneratedEducationField(idx, 'major', ev.target.value)} placeholder="专业" />
              </div>
              <input className="h-11 w-full rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-white/5 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all text-sm font-bold text-slate-900 dark:text-white px-4" value={getDisplayDate(e)} onChange={(ev) => updateGeneratedEducationField(idx, 'date', ev.target.value)} placeholder="时间" />
            </div>
          ))}
        </ResumeBlock>
        {renderModuleFeedback()}
        <ResumeBlock title="项目经历">
          {projectItems.length === 0 ? <p className="text-sm text-slate-500 dark:text-slate-400 italic">暂无项目经历</p> : projectItems.map((p: any, idx: number) => (
            <div key={String(p?.id ?? idx)} className="mb-6 last:mb-0 space-y-3 pb-6 last:pb-0 border-b last:border-0 border-slate-100 dark:border-white/5">
              <input className="h-11 w-full rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-white/5 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all text-sm font-bold text-slate-900 dark:text-white px-4" value={String(p?.title || '')} onChange={(e) => updateGeneratedProjectField(idx, 'title', e.target.value)} placeholder="项目名称" />
              <input className="h-11 w-full rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-white/5 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all text-sm font-bold text-slate-900 dark:text-white px-4" value={getDisplayDate(p)} onChange={(e) => updateGeneratedProjectField(idx, 'date', e.target.value)} placeholder="时间" />
              <AutoResizeTextarea className="w-full min-h-[140px] rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-white/5 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all text-sm font-bold text-slate-900 dark:text-white px-4 py-3 resize-none leading-relaxed" value={String(p?.description || '')} onChange={(e) => updateGeneratedProjectField(idx, 'description', e.target.value)} {...makeSelectionRewriteHandlers('projects', idx)} placeholder="项目描述" />
            </div>
          ))}
        </ResumeBlock>
        {renderModuleFeedback()}
        <ResumeBlock title="技能">
          <AutoResizeTextarea className="w-full min-h-[100px] rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-white/5 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all text-sm font-bold text-slate-900 dark:text-white px-4 py-3 resize-none leading-relaxed" value={skillsText} onChange={(e) => updateGeneratedSkills(e.target.value)} placeholder="技能（用顿号/逗号分隔）" />
        </ResumeBlock>
        {renderModuleFeedback()}
      </div>
    );
  };

  return (
    <div className="flex flex-col min-h-screen bg-background-light dark:bg-background-dark animate-in fade-in duration-500">
      <header className="fixed top-0 left-0 right-0 mx-auto w-full max-w-md z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-white/5">
        <div className="flex items-center justify-between h-14 px-4 relative">
          <BackButton onClick={onBack} className="-ml-2 size-9" iconClassName="text-[22px]" />
          <h1 className="text-base font-black tracking-tight text-slate-900 dark:text-white">生成简历</h1>
          <div className="w-10"></div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pt-[72px] p-4 pb-[calc(5.75rem+env(safe-area-inset-bottom))] space-y-6 max-w-md mx-auto w-full">
        <section className="animate-in slide-in-from-bottom-6 duration-700">
          <div className="flex items-center justify-center mb-5 px-1">
            <h3 className="text-[13px] font-black text-slate-900 dark:text-white tracking-[0.2em] uppercase flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[22px]">auto_awesome</span>
              AI 生成简历建议
            </h3>
          </div>

          <div className="relative">
            <div className="absolute -inset-1 bg-gradient-to-br from-primary/5 to-blue-500/5 rounded-[32px] blur-xl pointer-events-none" />
            <div className="relative space-y-3">
              <div className="rounded-2xl border border-amber-200/70 dark:border-amber-300/30 bg-amber-50/80 dark:bg-amber-400/10 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-black tracking-[0.16em] uppercase text-amber-700 dark:text-amber-300">选区改写</p>
                    <p className="mt-1 text-xs font-semibold text-amber-700/90 dark:text-amber-200 leading-relaxed">
                      入口：仅在「工作经历 / 项目经历」描述区选中片段后可触发。为保证事实边界，单次最多改写 {SELECTION_REWRITE_MAX_CHARS} 字。
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!canApplySelectionRewrite}
                    onClick={handleApplySelectionRewrite}
                    className="shrink-0 h-8 px-3 rounded-lg text-[11px] font-black transition-all border border-amber-300/80 dark:border-amber-300/40 text-amber-700 dark:text-amber-200 bg-white/80 dark:bg-black/10 disabled:opacity-45 disabled:cursor-not-allowed"
                  >
                    应用改写建议
                  </button>
                </div>
                {selectionRewriteBoundaryReason === 'empty' && (
                  <p className="mt-2 text-[11px] text-amber-700/90 dark:text-amber-200">请先选中需要改写的描述片段。</p>
                )}
                {selectionRewriteBoundaryReason === 'too_long' && (
                  <p className="mt-2 text-[11px] text-amber-700/90 dark:text-amber-200">当前选区过长，请控制在 {SELECTION_REWRITE_MAX_CHARS} 字以内。</p>
                )}
                {!selectionRewriteBoundaryReason && selectionRewriteDraft && !selectionRewriteCandidate && (
                  <p className="mt-2 text-[11px] text-amber-700/90 dark:text-amber-200">该选区暂无匹配建议，可直接手动修改，或重新选择更精确的片段。</p>
                )}
                {selectionRewriteMessage && (
                  <p className="mt-2 text-[11px] font-semibold text-emerald-600 dark:text-emerald-300">{selectionRewriteMessage}</p>
                )}
                <p className="mt-2 text-[10px] font-medium text-slate-500 dark:text-slate-400">事实边界提示：仅基于已有简历与画像事实改写，不会新增未提供经历/数据。</p>
              </div>
              {renderEditableGeneratedResume(editableGeneratedResume)}
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-4 px-1">
            <div className="sticky bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-30 mt-2">
              <button
                type="button"
                onClick={() => { void handleSaveAsNewResumeClick(); }}
                disabled={!editableGeneratedResume || isSaving}
                className="w-full h-12 rounded-xl bg-primary text-white text-sm font-bold shadow-lg shadow-primary/25 hover:bg-blue-600 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <span className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>正在保存至云端...</span>
                  </>
                ) : (
                  '保存为新简历'
                )}
              </button>
            </div>
            <p className="text-[10px] text-center text-slate-400 dark:text-slate-500 font-bold opacity-60 uppercase tracking-widest leading-relaxed">保存后可前往“我的简历”查看</p>
          </div>
        </section>

        <div className="px-1">
          <AiDisclaimer className="pt-4 opacity-60" />
        </div>
      </main>

      {showSaveSuccessModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setShowSaveSuccessModal(false)}>
          <div
            className="w-full max-w-sm bg-white dark:bg-[#1c2936] rounded-[28px] shadow-[0_20px_50px_rgba(0,0,0,0.3)] overflow-hidden border border-slate-100 dark:border-white/5 animate-in zoom-in-95 duration-200"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="p-8 pb-6">
              <div className="flex flex-col items-center text-center">
                <div className="size-16 rounded-3xl bg-emerald-50 dark:bg-emerald-400/10 flex items-center justify-center mb-6">
                  <span className="material-symbols-outlined text-emerald-500 text-[36px]">check_circle</span>
                </div>
                <h3 className="text-xl font-black text-slate-900 dark:text-white mb-3 tracking-tight">保存成功</h3>
                <p className="text-[15px] font-medium text-slate-500 dark:text-slate-400 leading-relaxed px-2">
                  已保存为新的生成简历。
                </p>
              </div>
            </div>
            <div className="p-6 pt-0 flex flex-col gap-3">
              <button
                type="button"
                onClick={handleGoToAllResumes}
                className="w-full h-12 rounded-2xl bg-primary text-white text-sm font-bold shadow-lg shadow-blue-500/25 hover:bg-blue-600 transition-all active:scale-95"
              >
                去我的简历查看
              </button>
              <button
                type="button"
                onClick={() => setShowSaveSuccessModal(false)}
                className="w-full h-12 rounded-2xl text-sm font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-all active:scale-95"
              >
                留在本页面
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PostInterviewReportPage;
