import React from 'react';
import type { ResumeData } from '../../../../types';
import AiDisclaimer from '../AiDisclaimer';
import BackButton from '../../../shared/BackButton';
import ReportFeedback from '../ReportFeedback';

type Props = {
  originalResume: ResumeData | null;
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
};

const ResumeBlock: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="rounded-[24px] border border-slate-100 dark:border-white/5 bg-white dark:bg-[#1c2936] p-6 shadow-sm hover:shadow-md transition-shadow">
    <h4 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
      <div className="size-1.5 rounded-full bg-primary" />
      {title}
    </h4>
    <div className="text-[14px] text-slate-700 dark:text-slate-300 leading-relaxed font-medium">{children}</div>
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
  originalResume,
  generatedResume,
  annotations,
  onFeedback,
  onCompleteAndSave,
  onBack,
}) => {
  const [isSaving, setIsSaving] = React.useState(false);
  const [editableGeneratedResume, setEditableGeneratedResume] = React.useState<ResumeData | null>(generatedResume);
  React.useEffect(() => {
    setEditableGeneratedResume(generatedResume);
  }, [generatedResume]);
  type AnnotationItem = {
    id: string;
    title: string;
    reason: string;
    targetId?: string;
    targetField?: string;
    originalValue?: string;
    suggestedValue?: string;
  };
  const annBySection = annotations.reduce<Record<string, AnnotationItem[]>>((acc, item) => {
    const key = item.section || 'other';
    if (!acc[key]) acc[key] = [];
    acc[key].push({
      id: item.id,
      title: item.title,
      reason: item.reason,
      targetId: item.targetId,
      targetField: item.targetField,
      originalValue: item.originalValue,
      suggestedValue: item.suggestedValue,
    });
    return acc;
  }, {});

  const renderInlineNote = (key: string, note: { title: string; reason: string }) => (
    <div key={key} className="mt-2 rounded-xl border border-amber-200/50 dark:border-amber-500/10 bg-amber-50/50 dark:bg-amber-500/5 p-3 animate-in fade-in zoom-in-95 duration-300">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-[14px]">edit_note</span>
        <p className="text-[10px] font-black text-amber-700 dark:text-amber-300 uppercase tracking-[0.12em]">{note.title}</p>
      </div>
      <p className="text-[11px] font-semibold text-amber-600/80 dark:text-amber-200/60 leading-[1.5]">{note.reason}</p>
    </div>
  );
  const renderModuleFeedback = () => (
    onFeedback ? (
      <div className="mt-3">
        <ReportFeedback onFeedback={onFeedback} showTitle={false} variant="compact" />
      </div>
    ) : null
  );

  const getSectionNotes = (section: string) => annBySection[section] || [];
  const normalizeNoteText = (v: string) => String(v || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^该句[描述表达内容信息结构]*[，,:：\s]*/i, '')
    .replace(/^此句[描述表达内容信息结构]*[，,:：\s]*/i, '');
  const noteSignature = (note: { title?: string; reason?: string }) => (
    `${normalizeNoteText(String(note.title || ''))}||${normalizeNoteText(String(note.reason || ''))}`.toLowerCase()
  );
  const normalizeDisplayPunctuation = (text: string) => String(text || '')
    .replace(/[；;]+(?=[。！？!?])/g, '')
    .replace(/[，,]+(?=[。！？!?])/g, '')
    .replace(/[：:]+(?=[。！？!?])/g, '')
    .replace(/[。]{2,}/g, '。')
    .replace(/[；;]{2,}/g, '；')
    .replace(/[，,]{2,}/g, '，')
    .replace(/\s+([，。；：！？])/g, '$1')
    .trim();

  const getUniformSectionNote = (section: string) => {
    const notes = getSectionNotes(section);
    if (!notes.length) return null;
    const counts = new Map<string, { count: number; title: string; reason: string }>();
    notes.forEach((n) => {
      const title = normalizeNoteText(String(n.title || ''));
      const reason = normalizeNoteText(String(n.reason || ''));
      const sig = `${title}||${reason}`.toLowerCase();
      const prev = counts.get(sig);
      if (prev) {
        prev.count += 1;
      } else {
        counts.set(sig, { count: 1, title, reason });
      }
    });
    const top = Array.from(counts.values()).sort((a, b) => b.count - a.count)[0];
    if (!top || top.count < 2 || top.count !== notes.length) return null;
    return top;
  };

  const buildModuleOverview = (section: string, hasContent = true): string | null => {
    if (section === 'projects' && !hasContent) {
      const notes = getSectionNotes('projects');
      if (!notes.length) return null;
      const merged = notes
        .map((n) => `${String(n.title || '')} ${String(n.reason || '')}`)
        .join(' ');
      const shouldAddProjects = /新增|补充|添加|增加|项目经历|项目经验|项目模块|AI项目|项目字段/i.test(merged);
      if (!shouldAddProjects) return null;
      const firstReason = normalizeNoteText(String(notes[0]?.reason || ''));
      if (firstReason) return normalizeDisplayPunctuation(`当前暂无项目经历。${firstReason}`);
      return '当前暂无项目经历，建议新增项目经历模块，并补充与目标岗位相关的代表性项目。';
    }

    const uniform = getUniformSectionNote(section);
    if (uniform?.reason) {
      const uniformText = normalizeNoteText(uniform.reason).replace(/[。！？!?；;，,、\s]+$/g, '');
      const sectionActionByType: Record<string, string> = {
        personalInfo: '补齐关键信息并统一呈现格式，确保招聘方可快速判断匹配度。',
        summary: '按“岗位关键词-核心能力-可量化成果”三段重写简介，减少空泛表达。',
        workExps: '按“职责范围-关键动作-量化结果”补全每段经历，优先补充指标。',
        projects: '按“背景目标-个人贡献-结果复盘”重写项目描述，突出个人价值。',
        skills: '按岗位相关性对技能分层，并补充可证明的工具/场景。',
      };
      return normalizeDisplayPunctuation(`当前模块存在共性问题：${uniformText || '表达与岗位匹配度不足'}。建议${sectionActionByType[section] || '围绕岗位匹配度进行针对性优化。'}`);
    }

    const notes = getSectionNotes(section);
    const source = notes;
    const defaultOverviewBySection: Record<string, string> = {
      personalInfo: '本模块信息完整，联系方式清晰可读。',
      summary: '本模块结构完整，建议继续强化岗位匹配亮点。',
      workExps: '本模块结构完整，建议继续强化结果导向与关键成果。',
      projects: '本模块结构完整，建议继续突出项目目标、行动与结果。',
      skills: '本模块结构完整，建议继续聚焦与目标岗位高度相关的技能。',
    };
    if (!source.length) return defaultOverviewBySection[section] || '本模块信息结构完整。';
    const text = source
      .map((n) => `${String(n.title || '')} ${String(n.reason || '')}`)
      .join(' ');
    const sectionDimensions: Record<string, Array<{ label: string; regex: RegExp }>> = {
      personalInfo: [
        { label: '信息完整性', regex: /信息|联系方式|邮箱|电话|姓名|title|职位/i },
        { label: '求职定位', regex: /定位|方向|岗位|职能|匹配/i },
        { label: '呈现规范性', regex: /规范|格式|可读|清晰|统一/i },
      ],
      summary: [
        { label: '岗位匹配亮点', regex: /匹配|岗位|关键词|契合|相关/i },
        { label: '价值主张', regex: /优势|价值|亮点|核心竞争力|定位/i },
        { label: '表达凝练度', regex: /精炼|冗长|结构|逻辑|表达|叙述/i },
      ],
      workExps: [
        { label: '职责边界', regex: /职责|边界|负责|分工|角色/i },
        { label: '业务动作', regex: /动作|方法|策略|执行|推进|落地/i },
        { label: '结果指标', regex: /结果|成果|指标|量化|roi|gmv|转化|增长|点击率/i },
      ],
      projects: [
        { label: '问题场景', regex: /问题|场景|背景|目标/i },
        { label: '方案方法', regex: /方案|方法|设计|实现|技术路线/i },
        { label: '个人贡献与结果', regex: /贡献|结果|产出|效果|指标|量化/i },
      ],
      skills: [
        { label: '技能分层', regex: /技能|能力|熟练|掌握|精通/i },
        { label: '工具与平台', regex: /工具|平台|系统|软件|excel|sql|python|bi/i },
        { label: '岗位相关性', regex: /岗位|业务|相关|匹配|应用场景/i },
      ],
    };
    const defs = sectionDimensions[section] || [];
    const dimensions = defs.filter((d) => d.regex.test(text)).map((d) => d.label);
    if (!dimensions.length) return defaultOverviewBySection[section] || '本模块建议已识别，可继续提升表达清晰度。';

    const reasons = source
      .map((n) => normalizeNoteText(String(n.reason || '')))
      .filter(Boolean);
    const reasonCounts = new Map<string, number>();
    reasons.forEach((r) => reasonCounts.set(r, (reasonCounts.get(r) || 0) + 1));
    const topReasons = Array.from(reasonCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([r]) => r.replace(/[。！？!?；;，,、\s]+$/g, ''))
      .slice(0, 2);

    const sectionNameByKey: Record<string, string> = {
      personalInfo: '基本信息',
      summary: '个人简介',
      workExps: '工作经历',
      projects: '项目经历',
      skills: '技能模块',
    };
    const dimActionBySection: Record<string, Record<string, string>> = {
      personalInfo: {
        信息完整性: '补齐姓名/联系方式/求职岗位等关键项',
        求职定位: '明确目标岗位与职能关键词',
        呈现规范性: '统一字段格式，避免口语化或冗余',
      },
      summary: {
        岗位匹配亮点: '补入与目标岗位直接相关的经历关键词',
        价值主张: '明确“你能解决什么问题”',
        表达凝练度: '压缩泛化表述，保留高价值信息',
      },
      workExps: {
        职责边界: '明确你负责的范围与角色边界',
        业务动作: '补充具体方法、策略与执行动作',
        结果指标: '补入可验证的结果指标与变化幅度',
      },
      projects: {
        问题场景: '写清业务背景、目标与挑战',
        方案方法: '补充关键方案与实现路径',
        个人贡献与结果: '强调个人贡献并给出结果数据',
      },
      skills: {
        技能分层: '区分熟练度并分层展示',
        工具与平台: '补充实际使用的工具与平台',
        岗位相关性: '保留高相关技能，弱化无关信息',
      },
    };

    const topDims = dimensions.slice(0, 3);
    const actions = topDims
      .map((d) => dimActionBySection[section]?.[d])
      .filter(Boolean)
      .slice(0, 2);
    const sectionLabel = sectionNameByKey[section] || '该模块';
    const issueText = topReasons.length
      ? `主要问题：${topReasons.join('；')}。`
      : '主要问题：当前内容与岗位价值的连接仍不够充分。';
    const actionText = actions.length
      ? `优化建议：${actions.join('；')}。`
      : '优化建议：围绕岗位要求补充细节、过程与结果，提升说服力。';
    return normalizeDisplayPunctuation(`当前${sectionLabel}已有基础信息，但在${topDims.join('、')}方面仍有提升空间。${issueText}${actionText}`);
  };

  const renderModuleOverview = (section: string, label: string, hasContent = true) => {
    const overview = buildModuleOverview(section, hasContent);
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

  const normalizeForMatch = (v: string) => String(v || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[，,。.;；:：\-—_()（）\[\]【】'"`]/g, '');

  const splitSentences = (text: string) => {
    const chunks = (String(text || '').match(/[^。！？!?；;]+[。！？!?；;]?/g) || [])
      .map((s) => s.trim())
      .filter(Boolean);
    return chunks.length ? chunks : [String(text || '').trim()].filter(Boolean);
  };

  const isDescriptionNote = (note: AnnotationItem) => {
    const field = String(note.targetField || '').trim().toLowerCase();
    if (!field) return true;
    return ['description', 'content', 'responsibility', 'achievement', 'highlights'].includes(field);
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
    const summaryNotes = (annBySection.summary || [])
      .filter((n) => !String(n.targetId || '').trim())
      .slice(0, 6);
    const summaryUniform = getUniformSectionNote('summary');
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
    const sectionNotes = annBySection.workExps || [];
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
    const sectionNotes = annBySection.projects || [];
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
    const projectItems = (data as any).projects || [];
    const hasWorkContent = Array.isArray(workItems) && workItems.length > 0;
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

  const handleCompleteAndSaveClick = async () => {
    if (!onCompleteAndSave || isSaving) return;
    setIsSaving(true);
    try {
      await onCompleteAndSave(editableGeneratedResume);
    } finally {
      setIsSaving(false);
    }
  };

  const updateGeneratedPersonalInfo = (field: 'name' | 'title' | 'email' | 'phone', value: string) => {
    setEditableGeneratedResume((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        personalInfo: {
          ...(prev.personalInfo || {}),
          [field]: value,
        } as any,
      };
    });
  };

  const updateGeneratedSummary = (value: string) => {
    setEditableGeneratedResume((prev) => (prev ? { ...prev, summary: value } : prev));
  };

  const updateGeneratedSkills = (value: string) => {
    setEditableGeneratedResume((prev) => {
      if (!prev) return prev;
      const skills = value
        .split(/[、,，\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
      return { ...prev, skills: skills as any };
    });
  };

  const updateGeneratedWorkField = (index: number, field: string, value: string) => {
    setEditableGeneratedResume((prev) => {
      if (!prev) return prev;
      const list = Array.isArray((prev as any).workExps) ? [...((prev as any).workExps as any[])] : [];
      if (!list[index]) return prev;
      list[index] = { ...list[index], [field]: value };
      return { ...prev, workExps: list as any };
    });
  };

  const updateGeneratedProjectField = (index: number, field: string, value: string) => {
    setEditableGeneratedResume((prev) => {
      if (!prev) return prev;
      const list = Array.isArray((prev as any).projects) ? [...((prev as any).projects as any[])] : [];
      if (!list[index]) return prev;
      list[index] = { ...list[index], [field]: value };
      return { ...prev, projects: list as any };
    });
  };

  const getDisplayDate = (item: any) => {
    const date = String(item?.date || '').trim();
    if (date) return date;
    const start = String(item?.startDate || '').trim();
    const end = String(item?.endDate || '').trim();
    if (start && end) return `${start} - ${end}`;
    return '';
  };

  const renderEditableGeneratedResume = (data: ResumeData | null) => {
    if (!data) return <p className="text-sm text-slate-500 dark:text-slate-400">暂无简历内容</p>;
    const workItems = Array.isArray((data as any).workExps) ? (data as any).workExps : [];
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
              <AutoResizeTextarea className="w-full min-h-[140px] rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-white/5 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all text-sm font-bold text-slate-900 dark:text-white px-4 py-3 resize-none leading-relaxed" value={String(w?.description || '')} onChange={(e) => updateGeneratedWorkField(idx, 'description', e.target.value)} placeholder="工作描述" />
            </div>
          ))}
        </ResumeBlock>
        {renderModuleFeedback()}
        <ResumeBlock title="项目经历">
          {projectItems.length === 0 ? <p className="text-sm text-slate-500 dark:text-slate-400 italic">暂无项目经历</p> : projectItems.map((p: any, idx: number) => (
            <div key={String(p?.id ?? idx)} className="mb-6 last:mb-0 space-y-3 pb-6 last:pb-0 border-b last:border-0 border-slate-100 dark:border-white/5">
              <input className="h-11 w-full rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-white/5 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all text-sm font-bold text-slate-900 dark:text-white px-4" value={String(p?.title || '')} onChange={(e) => updateGeneratedProjectField(idx, 'title', e.target.value)} placeholder="项目名称" />
              <input className="h-11 w-full rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-white/5 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all text-sm font-bold text-slate-900 dark:text-white px-4" value={getDisplayDate(p)} onChange={(e) => updateGeneratedProjectField(idx, 'date', e.target.value)} placeholder="时间" />
              <AutoResizeTextarea className="w-full min-h-[140px] rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-white/5 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all text-sm font-bold text-slate-900 dark:text-white px-4 py-3 resize-none leading-relaxed" value={String(p?.description || '')} onChange={(e) => updateGeneratedProjectField(idx, 'description', e.target.value)} placeholder="项目描述" />
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
      <header className="fixed top-0 left-0 right-0 z-40 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-xl border-b border-slate-200/50 dark:border-white/5">
        <div className="flex items-center justify-between h-14 px-4 relative">
          <BackButton onClick={onBack} className="-ml-2 size-9" iconClassName="text-[22px]" />
          <h1 className="text-base font-black tracking-tight text-slate-900 dark:text-white">简历批改</h1>
          <div className="w-10"></div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pt-[72px] p-4 pb-[calc(5.75rem+env(safe-area-inset-bottom))] space-y-10">
        <section className="animate-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center justify-center mb-4 px-1">
            <h3 className="text-sm font-black text-slate-900 dark:text-white tracking-widest uppercase flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-500 text-[20px]">mark_chat_read</span>
              原简历诊断
            </h3>
          </div>
          {renderResume(originalResume, true)}
        </section>

        <section className="animate-in slide-in-from-bottom-6 duration-700">
          <div className="flex items-center justify-center mb-4 px-1">
            <h3 className="text-sm font-black text-slate-900 dark:text-white tracking-widest uppercase flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[20px]">auto_awesome</span>
              AI 优化方案
            </h3>
          </div>

          <div className="relative">
            <div className="absolute -inset-1 bg-gradient-to-br from-primary/10 to-blue-500/10 rounded-[32px] blur-lg pointer-events-none" />
            <div className="relative">
              {renderEditableGeneratedResume(editableGeneratedResume)}
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-4 px-1">
            <div className="sticky bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-30 mt-2">
              <button
                type="button"
                onClick={() => { void handleCompleteAndSaveClick(); }}
                disabled={!editableGeneratedResume || isSaving}
                className={`w-full py-3 rounded-xl bg-primary text-white text-sm font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-600 active:scale-[0.98] transition-all flex items-center justify-center gap-2 ${(!editableGeneratedResume || isSaving) ? 'opacity-70 cursor-not-allowed shadow-none' : ''}`}
              >
                {isSaving ? (
                  <>
                    <span className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>正在保存至云端...</span>
                  </>
                ) : (
                  '确认为最终简历并保存'
                )}
              </button>
            </div>
            <p className="text-[10px] text-center text-slate-400 dark:text-slate-500 font-bold opacity-60 uppercase tracking-widest">保存后可前往“我的简历”下载 PDF 版本</p>
          </div>
        </section>

        <div className="px-1">
          <AiDisclaimer className="pt-4 opacity-60" />
        </div>
      </main>
    </div>
  );
};

export default PostInterviewReportPage;
