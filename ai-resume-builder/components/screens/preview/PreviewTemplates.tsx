import React from 'react';
import type { ResumeData } from '../../../types';
import { formatTimeline } from '../../../src/timeline-utils';
import type { MoveSectionDirection, PreviewSectionKey } from './hooks/usePreviewSectionOrder';
import { buildSectionTitleFocusKey, buildSkillFocusKey } from './inline-focus';
import {
  buildPreviewPersonalDirtyKey,
  buildPreviewSectionCollectionDirtyKey,
  buildPreviewSectionFieldDirtyKey,
  buildPreviewSkillDirtyKey,
  buildPreviewSkillsCollectionDirtyKey,
  buildPreviewSummaryDirtyKey,
} from './preview-dirty';

export type PreviewEditBindings = {
  enabled: boolean;
  onPersonalFieldChange: (field: keyof ResumeData['personalInfo'], value: string) => void;
  onSummaryChange: (value: string) => void;
  onWorkFieldChange: (id: number, field: 'title' | 'subtitle' | 'description' | 'date', value: string) => void;
  onEducationFieldChange: (id: number, field: 'title' | 'subtitle' | 'description' | 'date', value: string) => void;
  onProjectFieldChange: (id: number, field: 'title' | 'subtitle' | 'description' | 'date', value: string) => void;
  onAddWorkItem: () => void;
  onRemoveWorkItem: (id: number) => void;
  onAddEducationItem: () => void;
  onRemoveEducationItem: (id: number) => void;
  onAddProjectItem: () => void;
  onRemoveProjectItem: (id: number) => void;
  onSkillItemChange: (index: number, value: string) => void;
  onAddSkillItem: () => void;
  onRemoveSkillItem: (index: number) => void;
  onSkillsTextChange: (value: string) => void;
  isFieldDirty?: (dirtyKey: string) => boolean;
  autoFocusKey?: string;
  autoFocusToken?: number;
};

type EditableTextProps = {
  as?: React.ElementType;
  value: string;
  className?: string;
  style?: React.CSSProperties;
  editable?: boolean;
  multiline?: boolean;
  onCommit?: (value: string) => void;
  focusKey?: string;
  autoFocusKey?: string;
  autoFocusToken?: number;
  dirtyKey?: string;
};

const PreviewDirtyContext = React.createContext<((dirtyKey: string) => boolean) | undefined>(undefined);

const EditableText: React.FC<EditableTextProps> = ({
  as = 'span',
  value,
  className,
  style,
  editable = false,
  multiline = false,
  onCommit,
  focusKey,
  autoFocusKey,
  autoFocusToken,
  dirtyKey,
}) => {
  const Tag = as as any;
  const elementRef = React.useRef<HTMLElement | null>(null);
  const isFieldDirty = React.useContext(PreviewDirtyContext);
  const isDirty = Boolean(editable && dirtyKey && isFieldDirty?.(dirtyKey));
  const editableClass = editable
    ? 'rounded-sm px-0.5 -mx-0.5 hover:bg-amber-100/70 focus:bg-amber-100/70 focus:outline-none focus:ring-1 focus:ring-amber-300'
    : '';
  const dirtyClass = isDirty ? 'bg-amber-50 ring-1 ring-amber-300' : '';

  const handleBlur = (event: React.FocusEvent<HTMLElement>) => {
    if (!editable || !onCommit) return;
    const raw = String(event.currentTarget.textContent || '').replace(/\u00a0/g, ' ');
    const next = multiline ? raw.trim() : raw.replace(/\s+/g, ' ').trim();
    onCommit(next);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!editable) return;
    if (!multiline && event.key === 'Enter') {
      event.preventDefault();
      (event.currentTarget as HTMLElement).blur();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      (event.currentTarget as HTMLElement).blur();
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLElement>) => {
    if (!editable) return;
    event.preventDefault();
    const text = event.clipboardData.getData('text/plain');
    if (!text) return;
    document.execCommand('insertText', false, multiline ? text : text.replace(/\s+/g, ' '));
  };

  React.useEffect(() => {
    if (!editable) return;
    if (!focusKey || !autoFocusKey || focusKey !== autoFocusKey) return;
    const target = elementRef.current;
    if (!target) return;

    const raf = window.requestAnimationFrame(() => {
      target.focus({ preventScroll: true });
      const selection = window.getSelection?.();
      if (!selection) return;
      const range = document.createRange();
      range.selectNodeContents(target);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    });

    return () => window.cancelAnimationFrame(raf);
  }, [autoFocusKey, autoFocusToken, editable, focusKey]);

  return React.createElement(
    Tag,
    {
      className: [className, editableClass, dirtyClass].filter(Boolean).join(' '),
      style,
      ref: elementRef as any,
      contentEditable: editable || undefined,
      suppressContentEditableWarning: editable ? true : undefined,
      spellCheck: false,
      onBlur: handleBlur,
      onKeyDown: handleKeyDown,
      onPaste: handlePaste,
      title: isDirty ? 'Field has unsaved edits' : undefined,
      'data-focus-key': focusKey,
      'data-dirty-key': dirtyKey,
      'data-dirty': isDirty ? 'true' : undefined,
    },
    value
  );
};

const formatDateRange = (item: any): string => {
  return formatTimeline(item);
};

const resolveExperienceTitle = (item: any): string => {
  if (!item) return '';
  return (item.company || item.school || item.title || '').trim();
};

const resolveExperienceSubtitle = (item: any): string => {
  if (!item) return '';

  const isEdu = !!(item.school || item.degree || item.major);
  if (isEdu) {
    const parts: string[] = [];
    const d = String(item.degree || '').trim();
    const m = String(item.major || '').trim();
    if (d && m) {
      if (d === m) parts.push(d);
      else {
        parts.push(d);
        parts.push(m);
      }
    } else if (d || m) {
      parts.push(d || m);
    }
    if (parts.length > 0) return parts.join(' · ');
    return (item.subtitle || item.position || item.jobTitle || item.role || item.title || '').trim();
  }

  let raw = (item.position || item.jobTitle || item.role || item.subtitle || '').trim();
  if (!raw) return '';
  const separators = /[|\/·-]/;
  if (separators.test(raw)) return raw.split(separators)[0].trim();
  const whitespaceRegex = /\s+/;
  if (whitespaceRegex.test(raw)) {
    const segments = raw.split(whitespaceRegex);
    if (segments.length > 1 && segments[0].length >= 2) return segments[0].trim();
  }
  return raw;
};

const resolveJobTitle = (data: any): string => {
  if (!data) return '求职意向';
  const personal = data.personalInfo || {};
  const keys = ['title', 'position', 'jobTitle', 'job_title', 'occupation', 'profession', 'role', 'subtitle'];
  let raw = '';
  for (const key of keys) {
    if (personal[key] && String(personal[key]).trim()) {
      raw = personal[key];
      break;
    }
  }
  if (!raw) {
    for (const key of keys) {
      if (data[key] && String(data[key]).trim()) {
        raw = data[key];
        break;
      }
    }
  }
  return String(raw || '').trim() || '求职意向';
};

const resolveSummaryText = (data: any): string =>
  String(data?.summary || data?.personalInfo?.summary || '').trim();

const resolveExplicitGenderLabel = (value: any): string => {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'male') return '男';
  if (v === 'female') return '女';
  return '';
};

const resolvePersonalMetaItems = (data: ResumeData): string[] => {
  const personal = data?.personalInfo;
  const genderAge = [resolveExplicitGenderLabel((data as any)?.gender), personal?.age ? `${personal.age}岁` : '']
    .filter(Boolean)
    .join(' · ');
  const location = String(personal?.location || '').trim();
  const email = String(personal?.email || '').trim() || 'email@example.com';
  const phone = String(personal?.phone || '').trim() || '+86 138 0000 0000';
  const linkedin = String(personal?.linkedin || '').trim();
  const website = String(personal?.website || '').trim();
  return [genderAge, location, email, phone, linkedin, website].filter(Boolean);
};

const resolveSkillsList = (raw: any): string[] => {
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item || '').trim()).filter(Boolean);
  }
  const text = String(raw || '').trim();
  if (!text) return [];
  return text
    .split(/[、,，\n;；|]/)
    .map((item) => item.trim())
    .filter(Boolean);
};

export const TEMPLATE_OPTIONS = [
  { id: 'modern', name: '现代极简', color: '#3b82f6' },
  { id: 'classic', name: '经典商务', color: '#475569' },
  { id: 'minimal', name: '简约白黑', color: '#000000' },
];

const SectionOrderButtons: React.FC<{
  orderIndex: number;
  total: number;
  onMoveSection: (index: number, direction: MoveSectionDirection) => void;
  hidden?: boolean;
}> = ({ orderIndex, total, onMoveSection, hidden }) => {
  if (hidden) return null;
  return (
    <div className="no-print flex items-center gap-1">
      <button
        type="button"
        onClick={() => onMoveSection(orderIndex, -1)}
        disabled={orderIndex === 0}
        className="w-6 h-6 rounded-md border border-slate-200 text-slate-500 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 transition-colors"
        aria-label="上移模块"
      >
        <span className="material-symbols-outlined text-[14px] align-middle">keyboard_arrow_up</span>
      </button>
      <button
        type="button"
        onClick={() => onMoveSection(orderIndex, 1)}
        disabled={orderIndex === total - 1}
        className="w-6 h-6 rounded-md border border-slate-200 text-slate-500 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 transition-colors"
        aria-label="下移模块"
      >
        <span className="material-symbols-outlined text-[14px] align-middle">keyboard_arrow_down</span>
      </button>
    </div>
  );
};

const EditIconButton: React.FC<{
  icon: 'add' | 'remove';
  label: string;
  onClick: () => void;
  danger?: boolean;
}> = ({ icon, label, onClick, danger = false }) => (
  <button
    type="button"
    onClick={onClick}
    className={`no-print w-6 h-6 rounded-md border transition-colors flex items-center justify-center ${
      danger
        ? 'border-red-200 text-red-500 hover:bg-red-50'
        : 'border-slate-200 text-slate-500 hover:bg-slate-100'
    }${icon === 'remove' ? ' order-last' : ''}`}
    aria-label={label}
    title={label}
  >
    <span className="material-symbols-outlined text-[14px] align-middle">{icon}</span>
  </button>
);

const HeaderActions: React.FC<{
  sectionOrderIndex: number;
  total: number;
  onMoveSection: (index: number, direction: MoveSectionDirection) => void;
  hideOrderButtons?: boolean;
  canAdd?: boolean;
  onAdd?: () => void;
  dirty?: boolean;
}> = ({ sectionOrderIndex, total, onMoveSection, hideOrderButtons, canAdd, onAdd, dirty }) => (
  <div className="flex items-center gap-1">
    {dirty ? (
      <span
        className="no-print inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 text-amber-600 text-[10px] font-bold"
        title="该模块存在未保存改动"
        aria-label="该模块存在未保存改动"
      >
        •
      </span>
    ) : null}
    {canAdd && onAdd ? (
      <EditIconButton icon="add" label="新增条目" onClick={onAdd} />
    ) : null}
    <SectionOrderButtons
      orderIndex={sectionOrderIndex}
      total={total}
      onMoveSection={onMoveSection}
      hidden={hideOrderButtons}
    />
  </div>
);

const ModernTemplate: React.FC<{
  data: ResumeData;
  sectionOrder: PreviewSectionKey[];
  onMoveSection: (index: number, direction: MoveSectionDirection) => void;
  hideOrderButtons?: boolean;
  editBindings?: PreviewEditBindings;
}> = ({ data, sectionOrder, onMoveSection, hideOrderButtons, editBindings }) => (
  <PreviewDirtyContext.Provider value={editBindings?.isFieldDirty}>
    <div id="resume-content-modern" className="bg-white p-8 w-full text-slate-900 h-full min-h-[1123px]" style={{ fontFamily: "'CustomFont'" }}>
    <div className="flex gap-4 mb-6 border-b border-gray-200 pb-4 no-break">
      <div className="w-16 h-20 bg-gray-200 rounded-sm shrink-0 overflow-hidden">
        {data?.personalInfo?.avatar ? (
          <img src={data.personalInfo.avatar} alt="Avatar" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-slate-200 border border-slate-300 rounded-sm flex items-center justify-center text-slate-400">
            <span className="material-symbols-outlined text-[28px]">person</span>
          </div>
        )}
      </div>
      <div className="flex-1 flex flex-col justify-center space-y-1.5">
        <EditableText
          as="h1"
          className="text-xl font-bold text-gray-900"
          style={{ fontSize: '18px', fontWeight: 'bold' }}
          value={String(data?.personalInfo?.name || (editBindings?.enabled ? '' : '姓名'))}
          editable={!!editBindings?.enabled}
          dirtyKey={buildPreviewPersonalDirtyKey('name')}
          onCommit={(value) => editBindings?.onPersonalFieldChange('name', value)}
        />
        <EditableText
          as="p"
          className="text-sm text-gray-600"
          style={{ fontSize: '14px', color: '#666' }}
          value={String(resolveJobTitle(data) || (editBindings?.enabled ? '' : '求职意向'))}
          editable={!!editBindings?.enabled}
          dirtyKey={buildPreviewPersonalDirtyKey('title')}
          onCommit={(value) => editBindings?.onPersonalFieldChange('title', value)}
        />
        <div className="flex flex-wrap gap-2 mt-1 text-[10px] text-gray-500" style={{ fontSize: '10px', color: '#999' }}>
          {resolvePersonalMetaItems(data).map((item, idx, arr) => (
            <React.Fragment key={`${item}-${idx}`}>
              <span>{item}</span>
              {idx < arr.length - 1 ? <span>•</span> : null}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>

    {sectionOrder.map((section, orderIndex) => {
      if (section === 'summary' && (resolveSummaryText(data) || editBindings?.enabled)) {
        return (
          <div key={section} className="mb-5 no-break">
            <div className="flex items-center justify-between border-b border-blue-100 pb-1 mb-2">
              <h3 className="text-sm font-bold text-blue-600 uppercase" style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e40af' }}>个人简介</h3>
              <HeaderActions
                sectionOrderIndex={orderIndex}
                total={sectionOrder.length}
                onMoveSection={onMoveSection}
                hideOrderButtons={hideOrderButtons}
              />
            </div>
            <EditableText
              as="p"
              className="text-[10px] text-gray-600 leading-relaxed whitespace-pre-wrap"
              style={{ fontSize: '10px', color: '#4b5563', lineHeight: '1.4' }}
              value={resolveSummaryText(data)}
              editable={!!editBindings?.enabled}
              multiline
              dirtyKey={buildPreviewSummaryDirtyKey()}
              onCommit={(value) => editBindings?.onSummaryChange(value)}
            />
          </div>
        );
      }
      if (section === 'workExps' && (data?.workExps?.length || editBindings?.enabled)) {
        return (
          <div key={section} className="mb-5 space-y-2 no-break">
            <div className="flex items-center justify-between border-b border-blue-100 pb-1 mb-2">
              <h3 className="text-sm font-bold text-blue-600 uppercase" style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e40af' }}>工作经历</h3>
              <HeaderActions
                sectionOrderIndex={orderIndex}
                total={sectionOrder.length}
                onMoveSection={onMoveSection}
                hideOrderButtons={hideOrderButtons}
                canAdd={!!editBindings?.enabled}
                onAdd={editBindings?.onAddWorkItem}
                dirty={editBindings?.isFieldDirty?.(buildPreviewSectionCollectionDirtyKey('workExps'))}
              />
            </div>
            {data.workExps.length === 0 && editBindings?.enabled ? (
              <p className="text-[10px] text-slate-400">暂无工作经历，点击右上角 + 新增</p>
            ) : null}
            {data.workExps.map((exp: any) => (
              <div key={exp.id} className="mb-2 no-break">
                <div className="flex items-start gap-2 mb-1">
                  {editBindings?.enabled ? (
                    <EditIconButton
                      icon="remove"
                      label="删除工作经历"
                      onClick={() => editBindings.onRemoveWorkItem(Number(exp.id))}
                    />
                  ) : null}
                  <EditableText
                    className="flex-1 min-w-0 break-words text-xs font-bold text-gray-800"
                    style={{ fontSize: '12px', fontWeight: 'bold', color: '#1f2937' }}
                    value={resolveExperienceTitle(exp)}
                    editable={!!editBindings?.enabled}
                    focusKey={buildSectionTitleFocusKey('workExps', Number(exp.id))}
                    autoFocusKey={editBindings?.autoFocusKey}
                    autoFocusToken={editBindings?.autoFocusToken}
                    dirtyKey={buildPreviewSectionFieldDirtyKey('workExps', Number(exp.id), 'title')}
                    onCommit={(value) => editBindings?.onWorkFieldChange(Number(exp.id), 'title', value)}
                  />
                  <EditableText
                    className="shrink-0 min-w-[104px] text-right whitespace-nowrap text-[10px] text-gray-500"
                    style={{ fontSize: '10px', color: '#6b7280' }}
                    value={formatDateRange(exp) || (editBindings?.enabled ? '' : '工作时间')}
                    editable={!!editBindings?.enabled}
                    dirtyKey={buildPreviewSectionFieldDirtyKey('workExps', Number(exp.id), 'date')}
                    onCommit={(value) => editBindings?.onWorkFieldChange(Number(exp.id), 'date', value)}
                  />
                </div>
                <EditableText
                  as="p"
                  className="text-[10px] font-medium text-gray-700"
                  style={{ fontSize: '10px', fontWeight: '500', color: '#374151' }}
                  value={resolveExperienceSubtitle(exp) || (editBindings?.enabled ? '' : '职位')}
                  editable={!!editBindings?.enabled}
                  dirtyKey={buildPreviewSectionFieldDirtyKey('workExps', Number(exp.id), 'subtitle')}
                  onCommit={(value) => editBindings?.onWorkFieldChange(Number(exp.id), 'subtitle', value)}
                />
                <EditableText
                  as="p"
                  className="text-[10px] text-gray-600 leading-relaxed mt-1 whitespace-pre-wrap"
                  style={{ fontSize: '10px', color: '#4b5563', lineHeight: '1.4' }}
                  value={String(exp.description || '')}
                  editable={!!editBindings?.enabled}
                  multiline
                  dirtyKey={buildPreviewSectionFieldDirtyKey('workExps', Number(exp.id), 'description')}
                  onCommit={(value) => editBindings?.onWorkFieldChange(Number(exp.id), 'description', value)}
                />
              </div>
            ))}
          </div>
        );
      }
      if (section === 'educations' && (data?.educations?.length || editBindings?.enabled)) {
        return (
          <div key={section} className="mb-5 space-y-2 no-break">
            <div className="flex items-center justify-between border-b border-blue-100 pb-1 mb-2">
              <h3 className="text-sm font-bold text-blue-600 uppercase" style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e40af' }}>教育背景</h3>
              <HeaderActions
                sectionOrderIndex={orderIndex}
                total={sectionOrder.length}
                onMoveSection={onMoveSection}
                hideOrderButtons={hideOrderButtons}
                canAdd={!!editBindings?.enabled}
                onAdd={editBindings?.onAddEducationItem}
                dirty={editBindings?.isFieldDirty?.(buildPreviewSectionCollectionDirtyKey('educations'))}
              />
            </div>
            {data.educations.length === 0 && editBindings?.enabled ? (
              <p className="text-[10px] text-slate-400">暂无教育背景，点击右上角 + 新增</p>
            ) : null}
            {data.educations.map((edu: any) => (
              <div key={edu.id} className="flex items-start gap-2 mb-1 no-break">
                {editBindings?.enabled ? (
                  <EditIconButton
                    icon="remove"
                    label="删除教育背景"
                    onClick={() => editBindings.onRemoveEducationItem(Number(edu.id))}
                  />
                ) : null}
                <EditableText
                  className="flex-1 min-w-0 break-words text-xs font-bold text-gray-800"
                  style={{ fontSize: '12px', fontWeight: 'bold', color: '#1f2937' }}
                  value={resolveExperienceTitle(edu)}
                  editable={!!editBindings?.enabled}
                  focusKey={buildSectionTitleFocusKey('educations', Number(edu.id))}
                  autoFocusKey={editBindings?.autoFocusKey}
                  autoFocusToken={editBindings?.autoFocusToken}
                  dirtyKey={buildPreviewSectionFieldDirtyKey('educations', Number(edu.id), 'title')}
                  onCommit={(value) => editBindings?.onEducationFieldChange(Number(edu.id), 'title', value)}
                />
                <EditableText
                  className="shrink-0 min-w-[104px] text-right whitespace-nowrap text-[10px] text-gray-500"
                  style={{ fontSize: '10px', color: '#6b7280' }}
                  value={formatDateRange(edu) || (editBindings?.enabled ? '' : '教育时间')}
                  editable={!!editBindings?.enabled}
                  dirtyKey={buildPreviewSectionFieldDirtyKey('educations', Number(edu.id), 'date')}
                  onCommit={(value) => editBindings?.onEducationFieldChange(Number(edu.id), 'date', value)}
                />
              </div>
            ))}
            <div className="space-y-1">
              {data.educations.map((edu: any) => (
                <EditableText
                  key={`edu-subtitle-${edu.id}`}
                  as="p"
                  className="text-[10px] text-gray-600"
                  style={{ fontSize: '10px', color: '#4b5563' }}
                  value={resolveExperienceSubtitle(edu)}
                  editable={!!editBindings?.enabled}
                  dirtyKey={buildPreviewSectionFieldDirtyKey('educations', Number(edu.id), 'subtitle')}
                  onCommit={(value) => editBindings?.onEducationFieldChange(Number(edu.id), 'subtitle', value)}
                />
              ))}
            </div>
          </div>
        );
      }
      if (section === 'projects' && (data?.projects?.length || editBindings?.enabled)) {
        return (
          <div key={section} className="mb-5 space-y-2 no-break">
            <div className="flex items-center justify-between border-b border-blue-100 pb-1 mb-2">
              <h3 className="text-sm font-bold text-blue-600 uppercase" style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e40af' }}>项目经历</h3>
              <HeaderActions
                sectionOrderIndex={orderIndex}
                total={sectionOrder.length}
                onMoveSection={onMoveSection}
                hideOrderButtons={hideOrderButtons}
                canAdd={!!editBindings?.enabled}
                onAdd={editBindings?.onAddProjectItem}
                dirty={editBindings?.isFieldDirty?.(buildPreviewSectionCollectionDirtyKey('projects'))}
              />
            </div>
            {data.projects.length === 0 && editBindings?.enabled ? (
              <p className="text-[10px] text-slate-400">暂无项目经历，点击右上角 + 新增</p>
            ) : null}
            {data.projects.map((proj: any) => (
              <div key={proj.id} className="mb-2 no-break">
                <div className="flex items-start gap-2 mb-1">
                  {editBindings?.enabled ? (
                    <EditIconButton
                      icon="remove"
                      label="删除项目经历"
                      onClick={() => editBindings.onRemoveProjectItem(Number(proj.id))}
                    />
                  ) : null}
                  <EditableText
                    className="flex-1 min-w-0 break-words text-xs font-bold text-gray-800"
                    style={{ fontSize: '12px', fontWeight: 'bold', color: '#1f2937' }}
                    value={resolveExperienceTitle(proj)}
                    editable={!!editBindings?.enabled}
                    focusKey={buildSectionTitleFocusKey('projects', Number(proj.id))}
                    autoFocusKey={editBindings?.autoFocusKey}
                    autoFocusToken={editBindings?.autoFocusToken}
                    dirtyKey={buildPreviewSectionFieldDirtyKey('projects', Number(proj.id), 'title')}
                    onCommit={(value) => editBindings?.onProjectFieldChange(Number(proj.id), 'title', value)}
                  />
                  <EditableText
                    className="shrink-0 min-w-[104px] text-right whitespace-nowrap text-[10px] text-gray-500"
                    style={{ fontSize: '10px', color: '#6b7280' }}
                    value={formatDateRange(proj) || (editBindings?.enabled ? '' : '项目时间')}
                    editable={!!editBindings?.enabled}
                    dirtyKey={buildPreviewSectionFieldDirtyKey('projects', Number(proj.id), 'date')}
                    onCommit={(value) => editBindings?.onProjectFieldChange(Number(proj.id), 'date', value)}
                  />
                </div>
                <EditableText
                  as="p"
                  className="text-[10px] font-medium text-gray-700"
                  style={{ fontSize: '10px', fontWeight: '500', color: '#374151' }}
                  value={resolveExperienceSubtitle(proj) || (editBindings?.enabled ? '' : '项目角色')}
                  editable={!!editBindings?.enabled}
                  dirtyKey={buildPreviewSectionFieldDirtyKey('projects', Number(proj.id), 'subtitle')}
                  onCommit={(value) => editBindings?.onProjectFieldChange(Number(proj.id), 'subtitle', value)}
                />
                <EditableText
                  as="p"
                  className="text-[10px] text-gray-600 leading-relaxed mt-1 whitespace-pre-wrap"
                  style={{ fontSize: '10px', color: '#4b5563', lineHeight: '1.4' }}
                  value={String(proj.description || '')}
                  editable={!!editBindings?.enabled}
                  multiline
                  dirtyKey={buildPreviewSectionFieldDirtyKey('projects', Number(proj.id), 'description')}
                  onCommit={(value) => editBindings?.onProjectFieldChange(Number(proj.id), 'description', value)}
                />
              </div>
            ))}
          </div>
        );
      }
      if (section === 'skills') {
        const skills = resolveSkillsList((data as any)?.skills);
        if (!skills.length && !editBindings?.enabled) return null;
        const editableSkills = skills.length ? skills : [''];
        return (
          <div key={section} className="mb-5 space-y-2 no-break">
            <div className="flex items-center justify-between border-b border-blue-100 pb-1 mb-2">
              <h3 className="text-sm font-bold text-blue-600 uppercase" style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e40af' }}>技能</h3>
              <HeaderActions
                sectionOrderIndex={orderIndex}
                total={sectionOrder.length}
                onMoveSection={onMoveSection}
                hideOrderButtons={hideOrderButtons}
                canAdd={!!editBindings?.enabled}
                onAdd={editBindings?.onAddSkillItem}
                dirty={editBindings?.isFieldDirty?.(buildPreviewSkillsCollectionDirtyKey())}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {editableSkills.map((skill, index) => (
                <span key={`${skill}-${index}`} className="inline-flex items-center gap-1">
                  <EditableText
                    className="text-gray-700 text-[10px] mr-2"
                    value={skill}
                    editable={!!editBindings?.enabled}
                    focusKey={buildSkillFocusKey(index)}
                    autoFocusKey={editBindings?.autoFocusKey}
                    autoFocusToken={editBindings?.autoFocusToken}
                    dirtyKey={buildPreviewSkillDirtyKey(index)}
                    onCommit={(value) => editBindings?.onSkillItemChange(index, value)}
                  />
                  {editBindings?.enabled ? (
                    <EditIconButton
                      icon="remove"
                      label="删除技能"
                      onClick={() => editBindings.onRemoveSkillItem(index)}
                    />
                  ) : null}
                </span>
              ))}
            </div>
          </div>
        );
      }
      return null;
    })}
    </div>
  </PreviewDirtyContext.Provider>
);

const ClassicTemplate: React.FC<{ data: ResumeData; sectionOrder: PreviewSectionKey[]; onMoveSection: (index: number, direction: MoveSectionDirection) => void; hideOrderButtons?: boolean; editBindings?: PreviewEditBindings; }> = ({ data, sectionOrder, onMoveSection, hideOrderButtons, editBindings }) => (
  <PreviewDirtyContext.Provider value={editBindings?.isFieldDirty}>
    <div id="resume-content-classic" className="bg-white p-8 w-full text-slate-900 h-full min-h-[1123px]" style={{ fontFamily: "'CustomFont'" }}>
    <div className="mb-8 text-center border-b-2 border-black pb-4 no-break">
      <div className="mx-auto mb-3 w-16 h-16 rounded-full border border-black bg-slate-200 flex items-center justify-center text-gray-400">
        {data?.personalInfo?.avatar ? <img src={data.personalInfo.avatar} alt="Avatar" className="w-full h-full object-cover rounded-full" /> : <span className="material-symbols-outlined text-[28px]">person</span>}
      </div>
      <EditableText
        as="h1"
        className="text-2xl font-bold text-black uppercase tracking-wider mb-2"
        value={String(data?.personalInfo?.name || (editBindings?.enabled ? '' : '姓名'))}
        editable={!!editBindings?.enabled}
        dirtyKey={buildPreviewPersonalDirtyKey('name')}
        onCommit={(value) => editBindings?.onPersonalFieldChange('name', value)}
      />
      <EditableText
        as="p"
        className="text-base text-gray-800 font-serif italic mb-2"
        value={String(resolveJobTitle(data) || (editBindings?.enabled ? '' : '求职意向'))}
        editable={!!editBindings?.enabled}
        dirtyKey={buildPreviewPersonalDirtyKey('title')}
        onCommit={(value) => editBindings?.onPersonalFieldChange('title', value)}
      />
      <div className="flex flex-wrap justify-center items-center gap-x-2 gap-y-1 text-xs text-gray-600">
        {resolvePersonalMetaItems(data).map((item, idx, arr) => (
          <React.Fragment key={`${item}-${idx}`}>
            <span>{item}</span>
            {idx < arr.length - 1 ? <span className="text-gray-400">•</span> : null}
          </React.Fragment>
        ))}
      </div>
    </div>
    {sectionOrder.map((section, orderIndex) => {
      if (section === 'summary' && (resolveSummaryText(data) || editBindings?.enabled)) return (
        <div key={section} className="mb-8 px-2 no-break">
          <div className="flex items-center justify-between border-b-2 border-gray-900 mb-2 pb-0.5">
            <h3 className="text-sm font-bold text-gray-900">个人简介</h3>
            <HeaderActions
              sectionOrderIndex={orderIndex}
              total={sectionOrder.length}
              onMoveSection={onMoveSection}
              hideOrderButtons={hideOrderButtons}
            />
          </div>
          <EditableText
            as="p"
            className="text-xs text-gray-700 italic leading-relaxed whitespace-pre-wrap"
            value={resolveSummaryText(data)}
            editable={!!editBindings?.enabled}
            multiline
            dirtyKey={buildPreviewSummaryDirtyKey()}
            onCommit={(value) => editBindings?.onSummaryChange(value)}
          />
        </div>
      );
      if (section === 'workExps' && (data?.workExps?.length || editBindings?.enabled)) return (
        <div key={section} className="mb-6 space-y-4 no-break">
          <div className="flex items-center justify-between border-b border-black pb-1 mb-3 bg-gray-100 pl-2 pr-1">
            <h3 className="text-sm font-bold text-black uppercase">工作经历</h3>
            <HeaderActions
              sectionOrderIndex={orderIndex}
              total={sectionOrder.length}
              onMoveSection={onMoveSection}
              hideOrderButtons={hideOrderButtons}
              canAdd={!!editBindings?.enabled}
              onAdd={editBindings?.onAddWorkItem}
              dirty={editBindings?.isFieldDirty?.(buildPreviewSectionCollectionDirtyKey('workExps'))}
            />
          </div>
          {data.workExps.length === 0 && editBindings?.enabled ? (
            <p className="text-xs text-slate-400 pl-2">暂无工作经历，点击右上角 + 新增</p>
          ) : null}
          {data.workExps.map((exp: any) => (
            <div key={exp.id} className="mb-4 no-break pl-2">
              <div className="flex items-start gap-2 mb-1">
                {editBindings?.enabled ? (
                  <EditIconButton
                    icon="remove"
                    label="删除工作经历"
                    onClick={() => editBindings.onRemoveWorkItem(Number(exp.id))}
                  />
                ) : null}
                <EditableText
                  className="flex-1 min-w-0 break-words text-sm font-bold text-black"
                  value={resolveExperienceTitle(exp)}
                  editable={!!editBindings?.enabled}
                  focusKey={buildSectionTitleFocusKey('workExps', Number(exp.id))}
                  autoFocusKey={editBindings?.autoFocusKey}
                  autoFocusToken={editBindings?.autoFocusToken}
                  dirtyKey={buildPreviewSectionFieldDirtyKey('workExps', Number(exp.id), 'title')}
                  onCommit={(value) => editBindings?.onWorkFieldChange(Number(exp.id), 'title', value)}
                />
                <EditableText
                  className="shrink-0 min-w-[116px] text-right whitespace-nowrap text-xs text-gray-600 italic"
                  value={formatDateRange(exp) || (editBindings?.enabled ? '' : '工作时间')}
                  editable={!!editBindings?.enabled}
                  dirtyKey={buildPreviewSectionFieldDirtyKey('workExps', Number(exp.id), 'date')}
                  onCommit={(value) => editBindings?.onWorkFieldChange(Number(exp.id), 'date', value)}
                />
              </div>
              <EditableText
                as="p"
                className="text-xs font-bold text-gray-800 mb-1"
                value={resolveExperienceSubtitle(exp) || (editBindings?.enabled ? '' : '职位')}
                editable={!!editBindings?.enabled}
                dirtyKey={buildPreviewSectionFieldDirtyKey('workExps', Number(exp.id), 'subtitle')}
                onCommit={(value) => editBindings?.onWorkFieldChange(Number(exp.id), 'subtitle', value)}
              />
              <EditableText
                as="p"
                className="text-xs text-gray-700 leading-relaxed text-justify whitespace-pre-wrap"
                value={String(exp.description || '')}
                editable={!!editBindings?.enabled}
                multiline
                dirtyKey={buildPreviewSectionFieldDirtyKey('workExps', Number(exp.id), 'description')}
                onCommit={(value) => editBindings?.onWorkFieldChange(Number(exp.id), 'description', value)}
              />
            </div>
          ))}
        </div>
      );
      if (section === 'educations' && (data?.educations?.length || editBindings?.enabled)) return (
        <div key={section} className="mb-6 space-y-4 no-break">
          <div className="flex items-center justify-between border-b border-black pb-1 mb-3 bg-gray-100 pl-2 pr-1">
            <h3 className="text-sm font-bold text-black uppercase">教育背景</h3>
            <HeaderActions
              sectionOrderIndex={orderIndex}
              total={sectionOrder.length}
              onMoveSection={onMoveSection}
              hideOrderButtons={hideOrderButtons}
              canAdd={!!editBindings?.enabled}
              onAdd={editBindings?.onAddEducationItem}
              dirty={editBindings?.isFieldDirty?.(buildPreviewSectionCollectionDirtyKey('educations'))}
            />
          </div>
          {data.educations.length === 0 && editBindings?.enabled ? (
            <p className="text-xs text-slate-400 pl-2">暂无教育背景，点击右上角 + 新增</p>
          ) : null}
          {data.educations.map((edu: any) => (
            <div key={edu.id} className="flex items-start gap-2 mb-2 no-break pl-2">
              {editBindings?.enabled ? (
                <EditIconButton
                  icon="remove"
                  label="删除教育背景"
                  onClick={() => editBindings.onRemoveEducationItem(Number(edu.id))}
                />
              ) : null}
              <div className="flex-1 min-w-0">
                <EditableText
                  as="span"
                  className="text-sm font-bold text-black block break-words"
                  value={resolveExperienceTitle(edu)}
                  editable={!!editBindings?.enabled}
                  focusKey={buildSectionTitleFocusKey('educations', Number(edu.id))}
                  autoFocusKey={editBindings?.autoFocusKey}
                  autoFocusToken={editBindings?.autoFocusToken}
                  dirtyKey={buildPreviewSectionFieldDirtyKey('educations', Number(edu.id), 'title')}
                  onCommit={(value) => editBindings?.onEducationFieldChange(Number(edu.id), 'title', value)}
                />
                <EditableText
                  as="span"
                  className="text-xs text-gray-800"
                  value={resolveExperienceSubtitle(edu)}
                  editable={!!editBindings?.enabled}
                  dirtyKey={buildPreviewSectionFieldDirtyKey('educations', Number(edu.id), 'subtitle')}
                  onCommit={(value) => editBindings?.onEducationFieldChange(Number(edu.id), 'subtitle', value)}
                />
              </div>
              <EditableText
                className="shrink-0 min-w-[116px] text-right whitespace-nowrap text-xs text-gray-600 italic"
                value={formatDateRange(edu) || (editBindings?.enabled ? '' : '教育时间')}
                editable={!!editBindings?.enabled}
                dirtyKey={buildPreviewSectionFieldDirtyKey('educations', Number(edu.id), 'date')}
                onCommit={(value) => editBindings?.onEducationFieldChange(Number(edu.id), 'date', value)}
              />
            </div>
          ))}
        </div>
      );
      if (section === 'projects' && (data?.projects?.length || editBindings?.enabled)) return (
        <div key={section} className="mb-6 space-y-4 no-break">
          <div className="flex items-center justify-between border-b border-black pb-1 mb-3 bg-gray-100 pl-2 pr-1">
            <h3 className="text-sm font-bold text-black uppercase">项目经历</h3>
            <HeaderActions
              sectionOrderIndex={orderIndex}
              total={sectionOrder.length}
              onMoveSection={onMoveSection}
              hideOrderButtons={hideOrderButtons}
              canAdd={!!editBindings?.enabled}
              onAdd={editBindings?.onAddProjectItem}
              dirty={editBindings?.isFieldDirty?.(buildPreviewSectionCollectionDirtyKey('projects'))}
            />
          </div>
          {data.projects.length === 0 && editBindings?.enabled ? (
            <p className="text-xs text-slate-400 pl-2">暂无项目经历，点击右上角 + 新增</p>
          ) : null}
          {data.projects.map((proj: any) => (
            <div key={proj.id} className="mb-4 no-break pl-2">
              <div className="flex items-start gap-2 mb-1">
                {editBindings?.enabled ? (
                  <EditIconButton
                    icon="remove"
                    label="删除项目经历"
                    onClick={() => editBindings.onRemoveProjectItem(Number(proj.id))}
                  />
                ) : null}
                <EditableText
                  className="flex-1 min-w-0 break-words text-sm font-bold text-black"
                  value={resolveExperienceTitle(proj)}
                  editable={!!editBindings?.enabled}
                  focusKey={buildSectionTitleFocusKey('projects', Number(proj.id))}
                  autoFocusKey={editBindings?.autoFocusKey}
                  autoFocusToken={editBindings?.autoFocusToken}
                  dirtyKey={buildPreviewSectionFieldDirtyKey('projects', Number(proj.id), 'title')}
                  onCommit={(value) => editBindings?.onProjectFieldChange(Number(proj.id), 'title', value)}
                />
                <EditableText
                  className="shrink-0 min-w-[116px] text-right whitespace-nowrap text-xs text-gray-600 italic"
                  value={formatDateRange(proj) || (editBindings?.enabled ? '' : '项目时间')}
                  editable={!!editBindings?.enabled}
                  dirtyKey={buildPreviewSectionFieldDirtyKey('projects', Number(proj.id), 'date')}
                  onCommit={(value) => editBindings?.onProjectFieldChange(Number(proj.id), 'date', value)}
                />
              </div>
              <EditableText
                as="p"
                className="text-xs font-bold text-gray-800 mb-1"
                value={resolveExperienceSubtitle(proj) || (editBindings?.enabled ? '' : '项目角色')}
                editable={!!editBindings?.enabled}
                dirtyKey={buildPreviewSectionFieldDirtyKey('projects', Number(proj.id), 'subtitle')}
                onCommit={(value) => editBindings?.onProjectFieldChange(Number(proj.id), 'subtitle', value)}
              />
              <EditableText
                as="p"
                className="text-xs text-gray-700 leading-relaxed text-justify whitespace-pre-wrap"
                value={String(proj.description || '')}
                editable={!!editBindings?.enabled}
                multiline
                dirtyKey={buildPreviewSectionFieldDirtyKey('projects', Number(proj.id), 'description')}
                onCommit={(value) => editBindings?.onProjectFieldChange(Number(proj.id), 'description', value)}
              />
            </div>
          ))}
        </div>
      );
      if (section === 'skills') {
        const skills = resolveSkillsList((data as any)?.skills);
        if (!skills.length && !editBindings?.enabled) return null;
        return (
          <div key={section} className="mb-6 space-y-2 no-break">
            <div className="flex items-center justify-between border-b border-black pb-1 mb-3 bg-gray-100 pl-2 pr-1">
              <h3 className="text-sm font-bold text-black uppercase">专业技能</h3>
            <HeaderActions
              sectionOrderIndex={orderIndex}
              total={sectionOrder.length}
              onMoveSection={onMoveSection}
              hideOrderButtons={hideOrderButtons}
              canAdd={!!editBindings?.enabled}
              onAdd={editBindings?.onAddSkillItem}
              dirty={editBindings?.isFieldDirty?.(buildPreviewSkillsCollectionDirtyKey())}
            />
          </div>
          <div className="flex flex-wrap gap-2 pl-2">
            {(skills.length ? skills : ['']).map((skill, index) => (
              <span key={`${skill}-${index}`} className="inline-flex items-center gap-1">
                <EditableText
                  as="span"
                  className="text-xs text-gray-800 leading-relaxed whitespace-pre-wrap"
                  value={skill}
                  editable={!!editBindings?.enabled}
                  focusKey={buildSkillFocusKey(index)}
                  autoFocusKey={editBindings?.autoFocusKey}
                  autoFocusToken={editBindings?.autoFocusToken}
                  dirtyKey={buildPreviewSkillDirtyKey(index)}
                  onCommit={(value) => editBindings?.onSkillItemChange(index, value)}
                />
                {editBindings?.enabled ? (
                  <EditIconButton
                    icon="remove"
                    label="删除技能"
                    onClick={() => editBindings.onRemoveSkillItem(index)}
                  />
                ) : null}
              </span>
            ))}
          </div>
        </div>
      );
      }
      return null;
    })}
    </div>
  </PreviewDirtyContext.Provider>
);

const MinimalTemplate: React.FC<{ data: ResumeData; sectionOrder: PreviewSectionKey[]; onMoveSection: (index: number, direction: MoveSectionDirection) => void; hideOrderButtons?: boolean; editBindings?: PreviewEditBindings; }> = ({ data, sectionOrder, onMoveSection, hideOrderButtons, editBindings }) => (
  <PreviewDirtyContext.Provider value={editBindings?.isFieldDirty}>
    <div id="resume-content-minimal" className="bg-white p-8 w-full text-slate-900 h-full min-h-[1123px]" style={{ fontFamily: "'CustomFont'" }}>
    <div className="mb-10 no-break">
      <div className="mb-4 w-14 h-14 rounded-full border border-slate-300 bg-slate-200 flex items-center justify-center text-slate-400">
        {data?.personalInfo?.avatar ? <img src={data.personalInfo.avatar} alt="Avatar" className="w-full h-full object-cover rounded-full" /> : <span className="material-symbols-outlined text-[24px]">person</span>}
      </div>
      <EditableText
        as="h1"
        className="text-4xl font-black text-black tracking-tight mb-2"
        value={String(data?.personalInfo?.name || (editBindings?.enabled ? '' : '姓名'))}
        editable={!!editBindings?.enabled}
        dirtyKey={buildPreviewPersonalDirtyKey('name')}
        onCommit={(value) => editBindings?.onPersonalFieldChange('name', value)}
      />
      <EditableText
        as="p"
        className="text-lg text-gray-500 font-light mb-4"
        value={String(resolveJobTitle(data) || (editBindings?.enabled ? '' : '求职意向'))}
        editable={!!editBindings?.enabled}
        dirtyKey={buildPreviewPersonalDirtyKey('title')}
        onCommit={(value) => editBindings?.onPersonalFieldChange('title', value)}
      />
      <div className="flex flex-col gap-1 text-xs text-gray-400 font-mono">
        {resolvePersonalMetaItems(data).map((item, idx) => (
          <span key={`${item}-${idx}`}>{item}</span>
        ))}
      </div>
    </div>
    <div className="flex flex-col gap-8">
      {sectionOrder.map((section, orderIndex) => {
        if (section === 'summary' && (resolveSummaryText(data) || editBindings?.enabled)) {
          return (
            <section key={section} className="mb-6 no-break">
              <div className="flex items-center justify-between border-b border-black pb-2 mb-4">
                <h3 className="text-sm font-bold text-black uppercase tracking-widest">个人总结</h3>
                <SectionOrderButtons orderIndex={orderIndex} total={sectionOrder.length} onMoveSection={onMoveSection} hidden={hideOrderButtons} />
              </div>
              <EditableText
                as="p"
                className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap"
                value={resolveSummaryText(data)}
                editable={!!editBindings?.enabled}
                multiline
                dirtyKey={buildPreviewSummaryDirtyKey()}
                onCommit={(value) => editBindings?.onSummaryChange(value)}
              />
            </section>
          );
        }
        if (section === 'workExps' && (data?.workExps?.length || editBindings?.enabled)) {
          return (
            <div key={section} className="no-break">
              <div className="flex items-center justify-between border-b border-black pb-2 mb-4">
                <h3 className="text-sm font-bold text-black uppercase tracking-widest">工作经历</h3>
                <HeaderActions
                  sectionOrderIndex={orderIndex}
                  total={sectionOrder.length}
                  onMoveSection={onMoveSection}
                  hideOrderButtons={hideOrderButtons}
                  canAdd={!!editBindings?.enabled}
                  onAdd={editBindings?.onAddWorkItem}
                  dirty={editBindings?.isFieldDirty?.(buildPreviewSectionCollectionDirtyKey('workExps'))}
                />
              </div>
              <div className="space-y-6">
                {data.workExps.length === 0 && editBindings?.enabled ? (
                  <p className="text-xs text-slate-400">暂无工作经历，点击右上角 + 新增</p>
                ) : null}
                {data.workExps.map((exp: any) => (
                  <div key={exp.id}>
                    <div className="flex items-start gap-3 mb-1">
                      {editBindings?.enabled ? (
                        <EditIconButton
                          icon="remove"
                          label="删除工作经历"
                          onClick={() => editBindings.onRemoveWorkItem(Number(exp.id))}
                        />
                      ) : null}
                      <EditableText
                        as="h4"
                        className="flex-1 min-w-0 break-words font-bold text-black"
                        value={resolveExperienceTitle(exp)}
                        editable={!!editBindings?.enabled}
                        focusKey={buildSectionTitleFocusKey('workExps', Number(exp.id))}
                        autoFocusKey={editBindings?.autoFocusKey}
                        autoFocusToken={editBindings?.autoFocusToken}
                        dirtyKey={buildPreviewSectionFieldDirtyKey('workExps', Number(exp.id), 'title')}
                        onCommit={(value) => editBindings?.onWorkFieldChange(Number(exp.id), 'title', value)}
                      />
                      <EditableText
                        className="shrink-0 min-w-[122px] text-right whitespace-nowrap text-sm text-gray-600 font-mono"
                        value={formatDateRange(exp)}
                        editable={!!editBindings?.enabled}
                        dirtyKey={buildPreviewSectionFieldDirtyKey('workExps', Number(exp.id), 'date')}
                        onCommit={(value) => editBindings?.onWorkFieldChange(Number(exp.id), 'date', value)}
                      />
                    </div>
                    <EditableText
                      as="p"
                      className="text-sm text-gray-700 mb-2 font-medium italic"
                      value={resolveExperienceSubtitle(exp)}
                      editable={!!editBindings?.enabled}
                      dirtyKey={buildPreviewSectionFieldDirtyKey('workExps', Number(exp.id), 'subtitle')}
                      onCommit={(value) => editBindings?.onWorkFieldChange(Number(exp.id), 'subtitle', value)}
                    />
                    <EditableText
                      as="p"
                      className="text-sm text-gray-800 leading-relaxed text-justify whitespace-pre-wrap"
                      value={String(exp.description || '')}
                      editable={!!editBindings?.enabled}
                      multiline
                      dirtyKey={buildPreviewSectionFieldDirtyKey('workExps', Number(exp.id), 'description')}
                      onCommit={(value) => editBindings?.onWorkFieldChange(Number(exp.id), 'description', value)}
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        }
        if (section === 'educations' && (data?.educations?.length || editBindings?.enabled)) {
          return (
            <div key={section} className="no-break">
              <div className="flex items-center justify-between border-b border-black pb-2 mb-4">
                <h3 className="text-sm font-bold text-black uppercase tracking-widest">教育背景</h3>
                <HeaderActions
                  sectionOrderIndex={orderIndex}
                  total={sectionOrder.length}
                  onMoveSection={onMoveSection}
                  hideOrderButtons={hideOrderButtons}
                  canAdd={!!editBindings?.enabled}
                  onAdd={editBindings?.onAddEducationItem}
                  dirty={editBindings?.isFieldDirty?.(buildPreviewSectionCollectionDirtyKey('educations'))}
                />
              </div>
              <div className="space-y-4">
                {data.educations.length === 0 && editBindings?.enabled ? (
                  <p className="text-xs text-slate-400">暂无教育背景，点击右上角 + 新增</p>
                ) : null}
                {data.educations.map((edu: any) => (
                  <div key={edu.id}>
                    <div className="flex items-start gap-3 mb-1">
                      {editBindings?.enabled ? (
                        <EditIconButton
                          icon="remove"
                          label="删除教育背景"
                          onClick={() => editBindings.onRemoveEducationItem(Number(edu.id))}
                        />
                      ) : null}
                      <EditableText
                        as="h4"
                        className="flex-1 min-w-0 break-words font-bold text-black"
                        value={resolveExperienceTitle(edu)}
                        editable={!!editBindings?.enabled}
                        focusKey={buildSectionTitleFocusKey('educations', Number(edu.id))}
                        autoFocusKey={editBindings?.autoFocusKey}
                        autoFocusToken={editBindings?.autoFocusToken}
                        dirtyKey={buildPreviewSectionFieldDirtyKey('educations', Number(edu.id), 'title')}
                        onCommit={(value) => editBindings?.onEducationFieldChange(Number(edu.id), 'title', value)}
                      />
                      <EditableText
                        className="shrink-0 min-w-[122px] text-right whitespace-nowrap text-sm text-gray-600 font-mono"
                        value={formatDateRange(edu)}
                        editable={!!editBindings?.enabled}
                        dirtyKey={buildPreviewSectionFieldDirtyKey('educations', Number(edu.id), 'date')}
                        onCommit={(value) => editBindings?.onEducationFieldChange(Number(edu.id), 'date', value)}
                      />
                    </div>
                    <EditableText
                      as="p"
                      className="text-sm text-gray-700 italic"
                      value={resolveExperienceSubtitle(edu)}
                      editable={!!editBindings?.enabled}
                      dirtyKey={buildPreviewSectionFieldDirtyKey('educations', Number(edu.id), 'subtitle')}
                      onCommit={(value) => editBindings?.onEducationFieldChange(Number(edu.id), 'subtitle', value)}
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        }
        if (section === 'projects' && (data?.projects?.length || editBindings?.enabled)) {
          return (
            <div key={section} className="no-break">
              <div className="flex items-center justify-between border-b border-black pb-2 mb-4">
                <h3 className="text-sm font-bold text-black uppercase tracking-widest">项目经历</h3>
                <HeaderActions
                  sectionOrderIndex={orderIndex}
                  total={sectionOrder.length}
                  onMoveSection={onMoveSection}
                  hideOrderButtons={hideOrderButtons}
                  canAdd={!!editBindings?.enabled}
                  onAdd={editBindings?.onAddProjectItem}
                  dirty={editBindings?.isFieldDirty?.(buildPreviewSectionCollectionDirtyKey('projects'))}
                />
              </div>
              <div className="space-y-6">
                {data.projects.length === 0 && editBindings?.enabled ? (
                  <p className="text-xs text-slate-400">暂无项目经历，点击右上角 + 新增</p>
                ) : null}
                {data.projects.map((proj: any) => (
                  <div key={proj.id}>
                    <div className="flex items-start gap-3 mb-1">
                      {editBindings?.enabled ? (
                        <EditIconButton
                          icon="remove"
                          label="删除项目经历"
                          onClick={() => editBindings.onRemoveProjectItem(Number(proj.id))}
                        />
                      ) : null}
                      <EditableText
                        as="h4"
                        className="flex-1 min-w-0 break-words font-bold text-black"
                        value={resolveExperienceTitle(proj)}
                        editable={!!editBindings?.enabled}
                        focusKey={buildSectionTitleFocusKey('projects', Number(proj.id))}
                        autoFocusKey={editBindings?.autoFocusKey}
                        autoFocusToken={editBindings?.autoFocusToken}
                        dirtyKey={buildPreviewSectionFieldDirtyKey('projects', Number(proj.id), 'title')}
                        onCommit={(value) => editBindings?.onProjectFieldChange(Number(proj.id), 'title', value)}
                      />
                      <EditableText
                        className="shrink-0 min-w-[122px] text-right whitespace-nowrap text-sm text-gray-600 font-mono"
                        value={formatDateRange(proj)}
                        editable={!!editBindings?.enabled}
                        dirtyKey={buildPreviewSectionFieldDirtyKey('projects', Number(proj.id), 'date')}
                        onCommit={(value) => editBindings?.onProjectFieldChange(Number(proj.id), 'date', value)}
                      />
                    </div>
                    <EditableText
                      as="p"
                      className="text-sm text-gray-700 mb-2 font-medium italic"
                      value={resolveExperienceSubtitle(proj)}
                      editable={!!editBindings?.enabled}
                      dirtyKey={buildPreviewSectionFieldDirtyKey('projects', Number(proj.id), 'subtitle')}
                      onCommit={(value) => editBindings?.onProjectFieldChange(Number(proj.id), 'subtitle', value)}
                    />
                    <EditableText
                      as="p"
                      className="text-sm text-gray-800 leading-relaxed text-justify whitespace-pre-wrap"
                      value={String(proj.description || '')}
                      editable={!!editBindings?.enabled}
                      multiline
                      dirtyKey={buildPreviewSectionFieldDirtyKey('projects', Number(proj.id), 'description')}
                      onCommit={(value) => editBindings?.onProjectFieldChange(Number(proj.id), 'description', value)}
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        }
        if (section === 'skills') {
          const skills = resolveSkillsList((data as any)?.skills);
          if (!skills.length && !editBindings?.enabled) return null;
          return (
            <div key={section} className="no-break">
              <div className="flex items-center justify-between border-b border-black pb-2 mb-4">
                <h3 className="text-sm font-bold text-black uppercase tracking-widest">专业技能</h3>
                <HeaderActions
                  sectionOrderIndex={orderIndex}
                  total={sectionOrder.length}
                  onMoveSection={onMoveSection}
                  hideOrderButtons={hideOrderButtons}
                  canAdd={!!editBindings?.enabled}
                  onAdd={editBindings?.onAddSkillItem}
                  dirty={editBindings?.isFieldDirty?.(buildPreviewSkillsCollectionDirtyKey())}
                />
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-3">
                {(skills.length ? skills : ['']).map((skill: string, index: number) => (
                  <span key={`${skill}-${index}`} className="inline-flex items-center gap-1">
                    <EditableText
                      className="text-sm text-black font-medium"
                      value={skill}
                      editable={!!editBindings?.enabled}
                      focusKey={buildSkillFocusKey(index)}
                      autoFocusKey={editBindings?.autoFocusKey}
                      autoFocusToken={editBindings?.autoFocusToken}
                      dirtyKey={buildPreviewSkillDirtyKey(index)}
                      onCommit={(value) => editBindings?.onSkillItemChange(index, value)}
                    />
                    {editBindings?.enabled ? (
                      <EditIconButton
                        icon="remove"
                        label="删除技能"
                        onClick={() => editBindings.onRemoveSkillItem(index)}
                      />
                    ) : null}
                  </span>
                ))}
              </div>
            </div>
          );
        }
        return null;
      })}
    </div>
    </div>
  </PreviewDirtyContext.Provider>
);

export const renderPreviewTemplate = ({
  templateId,
  data,
  sectionOrder,
  onMoveSection,
  hideOrderButtons,
  editBindings,
}: {
  templateId: string;
  data: ResumeData;
  sectionOrder: PreviewSectionKey[];
  onMoveSection: (index: number, direction: MoveSectionDirection) => void;
  hideOrderButtons?: boolean;
  editBindings?: PreviewEditBindings;
}) => {
  switch (templateId) {
    case 'classic':
      return <ClassicTemplate data={data} sectionOrder={sectionOrder} onMoveSection={onMoveSection} hideOrderButtons={hideOrderButtons} editBindings={editBindings} />;
    case 'minimal':
      return <MinimalTemplate data={data} sectionOrder={sectionOrder} onMoveSection={onMoveSection} hideOrderButtons={hideOrderButtons} editBindings={editBindings} />;
    case 'modern':
    default:
      return <ModernTemplate data={data} sectionOrder={sectionOrder} onMoveSection={onMoveSection} hideOrderButtons={hideOrderButtons} editBindings={editBindings} />;
  }
};

