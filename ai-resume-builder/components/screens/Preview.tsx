import React from 'react';
import { View, ScreenProps, ResumeData } from '../../types';
import { formatTimeline } from '../../src/timeline-utils';
import BottomNav from '../BottomNav';
import { useAppContext } from '../../src/app-context';
import { useAppStore } from '../../src/app-store';
import BackButton from '../shared/BackButton';
import { usePreviewPdfExport } from './preview/hooks/usePreviewPdfExport';
import { usePreviewSectionOrder, type MoveSectionDirection, type PreviewSectionKey } from './preview/hooks/usePreviewSectionOrder';
import { usePreviewZoomPan } from './preview/hooks/usePreviewZoomPan';

// --- Helper Functions ---

// Format date range: handles 'date' field or 'startDate/endDate' fields
const formatDateRange = (item: any): string => {
  return formatTimeline(item);
};

const resolveExperienceTitle = (item: any): string => {
  if (!item) return '';
  return (item.company || item.school || item.title || '').trim();
};

const resolveExperienceSubtitle = (item: any): string => {
  if (!item) return '';

  // 1. Logic for Education (Combine degree and major if visible)
  // Check if it has school or degree-related fields
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

  // 2. Logic for Work/Projects
  let raw = (item.position || item.jobTitle || item.role || item.subtitle || '').trim();
  if (!raw) return '';

  // 3. User request: "Only keep the core title" 
  // Split by common separators: |, ·, -, or any whitespace (including non-breaking spaces \u00A0)
  // We use a regex that catches multiple variations.
  const separators = /[|\/·-]/;
  if (separators.test(raw)) {
    return raw.split(separators)[0].trim();
  }

  // Handle any kind of whitespace (ASCII space, tab, non-breaking space, etc.)
  const whitespaceRegex = /\s+/;
  if (whitespaceRegex.test(raw)) {
    const segments = raw.split(whitespaceRegex);
    // If the first part is substantial (>=2 chars), take it
    if (segments.length > 1 && segments[0].length >= 2) {
      return segments[0].trim();
    }
  }

  return raw;
};

const resolveJobTitle = (data: any): string => {
  if (!data) return '求职意向';

  const personal = data.personalInfo || {};

  // A comprehensive list of keys that might contain the job title
  const keys = [
    'title', 'position', 'jobTitle', 'job_title',
    'occupation', 'profession', 'role', 'subtitle'
  ];

  let raw = '';

  // 1. Check personalInfo first
  for (const key of keys) {
    if (personal[key] && String(personal[key]).trim()) {
      raw = personal[key];
      break;
    }
  }

  // 2. Check root data if not found in personalInfo
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

const PREVIEW_SECTION_LABELS: Record<PreviewSectionKey, string> = {
  summary: '个人简介',
  workExps: '工作经历',
  educations: '教育背景',
  projects: '项目经历',
  skills: '技能',
};


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


// --- Template Definitions ---

const TEMPLATE_OPTIONS = [
  { id: 'modern', name: '现代极简', color: '#3b82f6' },
  { id: 'classic', name: '经典商务', color: '#475569' },
  { id: 'minimal', name: '简约白黑', color: '#000000' },
];

// --- Template Components ---

const ModernTemplate: React.FC<{
  data: ResumeData;
  sectionOrder: PreviewSectionKey[];
  onMoveSection: (index: number, direction: MoveSectionDirection) => void;
  hideOrderButtons?: boolean;
}> = ({ data, sectionOrder, onMoveSection, hideOrderButtons }) => (
  <div
    id="resume-content-modern"
    className="bg-white p-8 w-full text-slate-900 h-full min-h-[1123px]"
    style={{
      fontFamily: "'CustomFont'",
    }}
  >
    {/* Modern Header */}
    <div className="flex gap-4 mb-6 border-b border-gray-200 pb-4 no-break">
      <div className="w-16 h-20 bg-gray-200 rounded-sm shrink-0 overflow-hidden">
        {/* Avatar Display */}
        {data?.personalInfo?.avatar ? (
          <img src={data.personalInfo.avatar} alt="Avatar" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-slate-200 border border-slate-300 rounded-sm flex items-center justify-center text-slate-400">
            <span className="material-symbols-outlined text-[28px]">person</span>
          </div>
        )}
      </div>
      <div className="flex-1 flex flex-col justify-center space-y-1.5">
        <h1 className="text-xl font-bold text-gray-900" style={{ fontSize: '18px', fontWeight: 'bold' }}>{data?.personalInfo?.name || '姓名'}</h1>
        <p className="text-sm text-gray-600" style={{ fontSize: '14px', color: '#666' }}>{resolveJobTitle(data)}</p>
        <div className="flex flex-wrap gap-2 mt-1 text-[10px] text-gray-500" style={{ fontSize: '10px', color: '#999' }}>
          {(resolveExplicitGenderLabel(data?.gender) || data?.personalInfo?.age) && (
            <>
              <span>
                {[
                  resolveExplicitGenderLabel(data?.gender),
                  data.personalInfo.age ? `${data.personalInfo.age}岁` : ''
                ].filter(Boolean).join(' · ')}
              </span>
              <span>•</span>
            </>
          )}
          <span>{data?.personalInfo?.email || 'email@example.com'}</span>
          <span>•</span>
          <span>{data?.personalInfo?.phone || '+86 138 0000 0000'}</span>
          {data?.personalInfo?.linkedin && (
            <>
              <span>•</span>
              <span>{data.personalInfo.linkedin}</span>
            </>
          )}
          {data?.personalInfo?.website && (
            <>
              <span>•</span>
              <span>{data.personalInfo.website}</span>
            </>
          )}
        </div>
      </div>
    </div>

    {sectionOrder.map((section, orderIndex) => {
      if (section === 'summary' && resolveSummaryText(data)) {
        return (
          <div key={section} className="mb-5 no-break">
            <div className="flex items-center justify-between border-b border-blue-100 pb-1 mb-2">
              <h3 className="text-sm font-bold text-blue-600 uppercase" style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e40af' }}>个人简介</h3>
              <SectionOrderButtons orderIndex={orderIndex} total={sectionOrder.length} onMoveSection={onMoveSection} hidden={hideOrderButtons} />
            </div>
            <p className="text-[10px] text-gray-600 leading-relaxed whitespace-pre-wrap" style={{ fontSize: '10px', color: '#4b5563', lineHeight: '1.4' }}>{resolveSummaryText(data)}</p>
          </div>
        );
      }
      if (section === 'workExps' && data?.workExps && data.workExps.length > 0) {
        return (
          <div key={section} className="mb-5 space-y-2 no-break">
            <div className="flex items-center justify-between border-b border-blue-100 pb-1 mb-2">
              <h3 className="text-sm font-bold text-blue-600 uppercase" style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e40af' }}>工作经历</h3>
              <SectionOrderButtons orderIndex={orderIndex} total={sectionOrder.length} onMoveSection={onMoveSection} hidden={hideOrderButtons} />
            </div>
            {data.workExps.map((exp: any) => (
              <div key={exp.id} className="mb-2 no-break">
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-xs font-bold text-gray-800" style={{ fontSize: '12px', fontWeight: 'bold', color: '#1f2937' }}>{resolveExperienceTitle(exp)}</span>
                  <span className="text-[10px] text-gray-500" style={{ fontSize: '10px', color: '#6b7280' }}>{formatDateRange(exp) || '工作时间'}</span>
                </div>
                <p className="text-[10px] font-medium text-gray-700" style={{ fontSize: '10px', fontWeight: '500', color: '#374151' }}>{resolveExperienceSubtitle(exp) || '职位'}</p>
                <p className="text-[10px] text-gray-600 leading-relaxed mt-1" style={{ fontSize: '10px', color: '#4b5563', lineHeight: '1.4' }}>{exp.description || '工作描述'}</p>
              </div>
            ))}
          </div>
        );
      }
      if (section === 'educations' && data?.educations && data.educations.length > 0) {
        return (
          <div key={section} className="mb-5 space-y-2 no-break">
            <div className="flex items-center justify-between border-b border-blue-100 pb-1 mb-2">
              <h3 className="text-sm font-bold text-blue-600 uppercase" style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e40af' }}>教育背景</h3>
              <SectionOrderButtons orderIndex={orderIndex} total={sectionOrder.length} onMoveSection={onMoveSection} hidden={hideOrderButtons} />
            </div>
            {data.educations.map((edu: any) => (
              <div key={edu.id} className="flex justify-between items-baseline mb-1 no-break">
                <span className="text-xs font-bold text-gray-800" style={{ fontSize: '12px', fontWeight: 'bold', color: '#1f2937' }}>{resolveExperienceTitle(edu)}</span>
                <span className="text-[10px] text-gray-500" style={{ fontSize: '10px', color: '#6b7280' }}>{formatDateRange(edu) || '教育时间'}</span>
              </div>
            ))}
            {data.educations.length > 0 && (
              <p className="text-[10px] text-gray-600" style={{ fontSize: '10px', color: '#4b5563' }}>{resolveExperienceSubtitle(data.educations[0])}</p>
            )}
          </div>
        );
      }
      if (section === 'projects' && data?.projects && data.projects.length > 0) {
        return (
          <div key={section} className="mb-5 space-y-2 no-break">
            <div className="flex items-center justify-between border-b border-blue-100 pb-1 mb-2">
              <h3 className="text-sm font-bold text-blue-600 uppercase" style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e40af' }}>项目经历</h3>
              <SectionOrderButtons orderIndex={orderIndex} total={sectionOrder.length} onMoveSection={onMoveSection} hidden={hideOrderButtons} />
            </div>
            {data.projects.map((proj: any) => (
              <div key={proj.id} className="mb-2 no-break">
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-xs font-bold text-gray-800" style={{ fontSize: '12px', fontWeight: 'bold', color: '#1f2937' }}>{resolveExperienceTitle(proj)}</span>
                  <span className="text-[10px] text-gray-500" style={{ fontSize: '10px', color: '#6b7280' }}>{formatDateRange(proj) || '项目时间'}</span>
                </div>
                <p className="text-[10px] font-medium text-gray-700" style={{ fontSize: '10px', fontWeight: '500', color: '#374151' }}>{resolveExperienceSubtitle(proj) || '项目角色'}</p>
                {proj.link && (
                  <p className="text-[10px] text-blue-600 break-all" style={{ fontSize: '10px', color: '#2563eb' }}>{proj.link}</p>
                )}
                <p className="text-[10px] text-gray-600 leading-relaxed mt-1" style={{ fontSize: '10px', color: '#4b5563', lineHeight: '1.4' }}>{proj.description || '项目描述'}</p>
              </div>
            ))}
          </div>
        );
      }
      if (section === 'skills') {
        const skills = resolveSkillsList((data as any)?.skills);
        if (skills.length === 0) return null;
        return (
          <div key={section} className="mb-5 space-y-2 no-break">
            <div className="flex items-center justify-between border-b border-blue-100 pb-1 mb-2">
              <h3 className="text-sm font-bold text-blue-600 uppercase" style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e40af' }}>技能</h3>
              <SectionOrderButtons orderIndex={orderIndex} total={sectionOrder.length} onMoveSection={onMoveSection} hidden={hideOrderButtons} />
            </div>
            <div className="flex flex-wrap gap-2">
              {skills.map((skill: string, index: number) => (
                <span key={index} className="text-gray-700 text-[10px] mr-2" style={{ fontSize: '10px', color: '#374151' }}>{skill}</span>
              ))}
            </div>
          </div>
        );
      }
      return null;
    })}
  </div>
);

const ClassicTemplate: React.FC<{
  data: ResumeData;
  sectionOrder: PreviewSectionKey[];
  onMoveSection: (index: number, direction: MoveSectionDirection) => void;
  hideOrderButtons?: boolean;
}> = ({ data, sectionOrder, onMoveSection, hideOrderButtons }) => (
  <div
    id="resume-content-classic"
    className="bg-white p-8 w-full text-slate-900 h-full min-h-[1123px]"
    style={{
      fontFamily: "'CustomFont'",
    }}
  >
    {/* Classic Centered Header */}
    <div className="mb-8 text-center border-b-2 border-black pb-4 no-break">
      <div className="mx-auto mb-3 w-16 h-16 rounded-full border border-black bg-slate-200 flex items-center justify-center text-gray-400">
        {data?.personalInfo?.avatar ? (
          <img src={data.personalInfo.avatar} alt="Avatar" className="w-full h-full object-cover rounded-full" />
        ) : (
          <span className="material-symbols-outlined text-[28px]">person</span>
        )}
      </div>
      <h1 className="text-2xl font-bold text-black uppercase tracking-wider mb-2" style={{ fontSize: '24px', fontWeight: 'bold' }}>{data?.personalInfo?.name || '姓名'}</h1>
      <p className="text-base text-gray-800 font-serif italic mb-2" style={{ fontSize: '16px' }}>{resolveJobTitle(data)}</p>
      <div className="flex justify-center gap-4 text-xs text-gray-600" style={{ fontSize: '12px', color: '#333' }}>
        {(resolveExplicitGenderLabel(data?.gender) || data?.personalInfo?.age) && (
          <span>
            {[
              resolveExplicitGenderLabel(data?.gender),
              data.personalInfo.age ? `${data.personalInfo.age}岁` : ''
            ].filter(Boolean).join(' · ')}
          </span>
        )}
        <span>{data?.personalInfo?.email || 'email@example.com'}</span>
        <span>{data?.personalInfo?.phone || '+86 138 0000 0000'}</span>
        {data?.personalInfo?.linkedin && <span>{data.personalInfo.linkedin}</span>}
        {data?.personalInfo?.website && <span>{data.personalInfo.website}</span>}
      </div>
    </div>

    {sectionOrder.map((section, orderIndex) => {
      if (section === 'summary' && resolveSummaryText(data)) {
        return (
          <div key={section} className="mb-8 px-2 no-break">
            <div className="flex items-center justify-between border-b-2 border-gray-900 mb-2 pb-0.5">
              <h3 className="text-sm font-bold text-gray-900" style={{ fontSize: '14px', fontWeight: 'bold' }}>个人简介</h3>
              <SectionOrderButtons orderIndex={orderIndex} total={sectionOrder.length} onMoveSection={onMoveSection} hidden={hideOrderButtons} />
            </div>
            <p className="text-xs text-gray-700 italic leading-relaxed whitespace-pre-wrap" style={{ fontSize: '12px' }}>{resolveSummaryText(data)}</p>
          </div>
        );
      }
      if (section === 'workExps' && data?.workExps && data.workExps.length > 0) {
        return (
          <div key={section} className="mb-6 space-y-4 no-break">
            <div className="flex items-center justify-between border-b border-black pb-1 mb-3 bg-gray-100 pl-2 pr-1">
              <h3 className="text-sm font-bold text-black uppercase" style={{ fontSize: '14px', fontWeight: 'bold', color: '#000', backgroundColor: '#f3f4f6' }}>工作经历</h3>
              <SectionOrderButtons orderIndex={orderIndex} total={sectionOrder.length} onMoveSection={onMoveSection} hidden={hideOrderButtons} />
            </div>
            {data.workExps.map((exp: any) => (
              <div key={exp.id} className="mb-4 no-break pl-2">
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-sm font-bold text-black" style={{ fontSize: '12px', fontWeight: 'bold' }}>{resolveExperienceTitle(exp)}</span>
                  <span className="text-xs text-gray-600 italic" style={{ fontSize: '10px' }}>{formatDateRange(exp) || '工作时间'}</span>
                </div>
                <p className="text-xs font-bold text-gray-800 mb-1" style={{ fontSize: '10px', fontWeight: 'bold' }}>{resolveExperienceSubtitle(exp) || '职位'}</p>
                <p className="text-xs text-gray-700 leading-relaxed text-justify" style={{ fontSize: '10px', lineHeight: '1.5' }}>{exp.description || '工作描述'}</p>
              </div>
            ))}
          </div>
        );
      }
      if (section === 'educations' && data?.educations && data.educations.length > 0) {
        return (
          <div key={section} className="mb-6 space-y-4 no-break">
            <div className="flex items-center justify-between border-b border-black pb-1 mb-3 bg-gray-100 pl-2 pr-1">
              <h3 className="text-sm font-bold text-black uppercase" style={{ fontSize: '14px', fontWeight: 'bold', color: '#000', backgroundColor: '#f3f4f6' }}>教育背景</h3>
              <SectionOrderButtons orderIndex={orderIndex} total={sectionOrder.length} onMoveSection={onMoveSection} hidden={hideOrderButtons} />
            </div>
            {data.educations.map((edu: any) => (
              <div key={edu.id} className="flex justify-between items-baseline mb-2 no-break pl-2">
                <div>
                  <span className="text-sm font-bold text-black block" style={{ fontSize: '12px', fontWeight: 'bold' }}>{resolveExperienceTitle(edu)}</span>
                  <span className="text-xs text-gray-800" style={{ fontSize: '10px' }}>{resolveExperienceSubtitle(edu)}</span>
                </div>
                <span className="text-xs text-gray-600 italic" style={{ fontSize: '10px' }}>{formatDateRange(edu) || '教育时间'}</span>
              </div>
            ))}
          </div>
        );
      }
      if (section === 'projects' && data?.projects && data.projects.length > 0) {
        return (
          <div key={section} className="mb-6 space-y-4 no-break">
            <div className="flex items-center justify-between border-b border-black pb-1 mb-3 bg-gray-100 pl-2 pr-1">
              <h3 className="text-sm font-bold text-black uppercase" style={{ fontSize: '14px', fontWeight: 'bold', color: '#000', backgroundColor: '#f3f4f6' }}>项目经历</h3>
              <SectionOrderButtons orderIndex={orderIndex} total={sectionOrder.length} onMoveSection={onMoveSection} hidden={hideOrderButtons} />
            </div>
            {data.projects.map((proj: any) => (
              <div key={proj.id} className="mb-4 no-break pl-2">
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-sm font-bold text-black" style={{ fontSize: '12px', fontWeight: 'bold' }}>{resolveExperienceTitle(proj)}</span>
                  <span className="text-xs text-gray-600 italic" style={{ fontSize: '10px' }}>{formatDateRange(proj) || '项目时间'}</span>
                </div>
                <p className="text-xs font-bold text-gray-800 mb-1" style={{ fontSize: '10px', fontWeight: 'bold' }}>{resolveExperienceSubtitle(proj) || '项目角色'}</p>
                {proj.link && (
                  <p className="text-xs text-blue-600 break-all" style={{ fontSize: '10px', color: '#2563eb' }}>{proj.link}</p>
                )}
                <p className="text-xs text-gray-700 leading-relaxed text-justify" style={{ fontSize: '10px', lineHeight: '1.5' }}>{proj.description || '项目描述'}</p>
              </div>
            ))}
          </div>
        );
      }
      if (section === 'skills') {
        const skills = resolveSkillsList((data as any)?.skills);
        if (skills.length === 0) return null;
        return (
          <div key={section} className="mb-6 space-y-2 no-break">
            <div className="flex items-center justify-between border-b border-black pb-1 mb-3 bg-gray-100 pl-2 pr-1">
              <h3 className="text-sm font-bold text-black uppercase" style={{ fontSize: '14px', fontWeight: 'bold', color: '#000', backgroundColor: '#f3f4f6' }}>专业技能</h3>
              <SectionOrderButtons orderIndex={orderIndex} total={sectionOrder.length} onMoveSection={onMoveSection} hidden={hideOrderButtons} />
            </div>
            <p className="text-xs text-gray-800 pl-2 leading-relaxed" style={{ fontSize: '10px' }}>
              {skills.join(' • ')}
            </p>
          </div>
        );
      }
      return null;
    })}
  </div>
);

const MinimalTemplate: React.FC<{
  data: ResumeData;
  sectionOrder: PreviewSectionKey[];
  onMoveSection: (index: number, direction: MoveSectionDirection) => void;
  hideOrderButtons?: boolean;
}> = ({ data, sectionOrder, onMoveSection, hideOrderButtons }) => (
  <div
    id="resume-content-minimal"
    className="bg-white p-8 w-full text-slate-900 h-full min-h-[1123px]"
    style={{
      fontFamily: "'CustomFont'",
    }}
  >
    {/* Minimal Header */}
    <div className="mb-10 no-break">
      <div className="mb-4 w-14 h-14 rounded-full border border-slate-300 bg-slate-200 flex items-center justify-center text-slate-400">
        {data?.personalInfo?.avatar ? (
          <img src={data.personalInfo.avatar} alt="Avatar" className="w-full h-full object-cover rounded-full" />
        ) : (
          <span className="material-symbols-outlined text-[24px]">person</span>
        )}
      </div>
      <h1 className="text-4xl font-black text-black tracking-tight mb-2" style={{ fontSize: '36px', fontWeight: '900' }}>{data?.personalInfo?.name || '姓名'}</h1>
      <p className="text-lg text-gray-500 font-light mb-4" style={{ fontSize: '18px' }}>{resolveJobTitle(data)}</p>
      <div className="flex flex-col gap-1 text-xs text-gray-400 font-mono" style={{ fontSize: '11px', fontFamily: "'CustomFont'" }}>
        {(resolveExplicitGenderLabel(data?.gender) || data?.personalInfo?.age) && (
          <span>
            {[
              resolveExplicitGenderLabel(data?.gender),
              data.personalInfo.age ? `${data.personalInfo.age}岁` : ''
            ].filter(Boolean).join(' · ')}
          </span>
        )}
        <span>{data?.personalInfo?.email || 'email@example.com'}</span>
        <span>{data?.personalInfo?.phone || '+86 138 0000 0000'}</span>
        {data?.personalInfo?.linkedin && <span>{data.personalInfo.linkedin}</span>}
        {data?.personalInfo?.website && <span>{data.personalInfo.website}</span>}
      </div>
    </div>

    <div className="flex flex-col gap-8">
      {sectionOrder.map((section, orderIndex) => {
        if (section === 'summary' && resolveSummaryText(data)) {
          return (
            <section key={section} className="mb-6 no-break">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[2px]" style={{ fontSize: '14px' }}>个人总结</h3>
                <SectionOrderButtons orderIndex={orderIndex} total={sectionOrder.length} onMoveSection={onMoveSection} hidden={hideOrderButtons} />
              </div>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap" style={{ fontSize: '12px' }}>
                {resolveSummaryText(data)}
              </p>
            </section>
          );
        }
        if (section === 'workExps' && data?.workExps && data.workExps.length > 0) {
          return (
            <div key={section} className="no-break">
              <div className="flex items-center justify-between border-b border-black pb-2 mb-4">
                <h3 className="text-sm font-bold text-black uppercase tracking-widest" style={{ fontSize: '14px' }}>工作经历</h3>
                <SectionOrderButtons orderIndex={orderIndex} total={sectionOrder.length} onMoveSection={onMoveSection} hidden={hideOrderButtons} />
              </div>
              <div className="space-y-6">
                {data.workExps.map((exp: any) => (
                  <div key={exp.id}>
                    <div className="flex justify-between items-baseline mb-1">
                      <h4 className="font-bold text-black" style={{ fontSize: '12px' }}>{resolveExperienceTitle(exp)}</h4>
                      <span className="text-sm text-gray-600 font-mono" style={{ fontSize: '10px' }}>{formatDateRange(exp)}</span>
                    </div>
                    <p className="text-sm text-gray-700 mb-2 font-medium italic" style={{ fontSize: '10px' }}>{resolveExperienceSubtitle(exp)}</p>
                    <p className="text-sm text-gray-800 leading-relaxed text-justify" style={{ fontSize: '10px' }}>{exp.description}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        }
        if (section === 'educations' && data?.educations && data.educations.length > 0) {
          return (
            <div key={section} className="no-break">
              <div className="flex items-center justify-between border-b border-black pb-2 mb-4">
                <h3 className="text-sm font-bold text-black uppercase tracking-widest" style={{ fontSize: '14px' }}>教育背景</h3>
                <SectionOrderButtons orderIndex={orderIndex} total={sectionOrder.length} onMoveSection={onMoveSection} hidden={hideOrderButtons} />
              </div>
              <div className="space-y-4">
                {data.educations.map((edu: any) => (
                  <div key={edu.id}>
                    <div className="flex justify-between items-baseline mb-1">
                      <h4 className="font-bold text-black" style={{ fontSize: '12px' }}>{resolveExperienceTitle(edu)}</h4>
                      <span className="text-sm text-gray-600 font-mono" style={{ fontSize: '10px' }}>{formatDateRange(edu)}</span>
                    </div>
                    <p className="text-sm text-gray-700 italic" style={{ fontSize: '10px' }}>{resolveExperienceSubtitle(edu)}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        }
        if (section === 'projects' && data?.projects && data.projects.length > 0) {
          return (
            <div key={section} className="no-break">
              <div className="flex items-center justify-between border-b border-black pb-2 mb-4">
                <h3 className="text-sm font-bold text-black uppercase tracking-widest" style={{ fontSize: '14px' }}>项目经历</h3>
                <SectionOrderButtons orderIndex={orderIndex} total={sectionOrder.length} onMoveSection={onMoveSection} hidden={hideOrderButtons} />
              </div>
              <div className="space-y-6">
                {data.projects.map((proj: any) => (
                  <div key={proj.id}>
                    <div className="flex justify-between items-baseline mb-1">
                      <h4 className="font-bold text-black" style={{ fontSize: '12px' }}>{resolveExperienceTitle(proj)}</h4>
                      <span className="text-sm text-gray-600 font-mono" style={{ fontSize: '10px' }}>{formatDateRange(proj)}</span>
                    </div>
                    <p className="text-sm text-gray-700 mb-2 font-medium italic" style={{ fontSize: '10px' }}>{resolveExperienceSubtitle(proj)}</p>
                    {proj.link && <p className="text-sm text-blue-600 break-all mb-1" style={{ fontSize: '10px', color: '#2563eb' }}>{proj.link}</p>}
                    <p className="text-sm text-gray-800 leading-relaxed text-justify" style={{ fontSize: '10px' }}>{proj.description}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        }
        if (section === 'skills') {
          const skills = resolveSkillsList((data as any)?.skills);
          if (skills.length === 0) return null;
          return (
            <div key={section} className="no-break">
              <div className="flex items-center justify-between border-b border-black pb-2 mb-4">
                <h3 className="text-sm font-bold text-black uppercase tracking-widest" style={{ fontSize: '14px' }}>专业技能</h3>
                <SectionOrderButtons orderIndex={orderIndex} total={sectionOrder.length} onMoveSection={onMoveSection} hidden={hideOrderButtons} />
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-3">
                {skills.map((skill: string) => (
                  <span key={skill} className="text-sm text-black font-medium" style={{ fontSize: '10px' }}>{skill}</span>
                ))}
              </div>
            </div>
          );
        }
        return null;
      })}
    </div>
  </div >
);


const Preview: React.FC<ScreenProps> = () => {
  const navigateToView = useAppContext((s) => s.navigateToView);
  const goBack = useAppContext((s) => s.goBack);
  const resumeData = useAppStore((state) => state.resumeData);
  const setResumeData = useAppStore((state) => state.setResumeData);
  const isOptimized = resumeData?.optimizationStatus === 'optimized';
  const currentTemplateId = resumeData?.templateId || 'modern';
  const { isGenerating, handleExportPDF } = usePreviewPdfExport({ resumeData });
  const { sectionOrder, handleTemplateChange, moveSection } = usePreviewSectionOrder({ resumeData, setResumeData });
  const {
    previewScale,
    previewOffset,
    previewCardRef,
    isZoomed,
    handlePreviewTouchStart,
    handlePreviewTouchMove,
    handlePreviewTouchEnd,
  } = usePreviewZoomPan();

  const renderTemplate = () => {
    if (!resumeData) return null;
    const templateId = resumeData.templateId || 'modern';

    switch (templateId) {
      case 'classic':
        return <ClassicTemplate data={resumeData} sectionOrder={sectionOrder} onMoveSection={(index, direction) => { void moveSection(index, direction); }} hideOrderButtons={isZoomed} />;
      case 'minimal':
        return <MinimalTemplate data={resumeData} sectionOrder={sectionOrder} onMoveSection={(index, direction) => { void moveSection(index, direction); }} hideOrderButtons={isZoomed} />;
      case 'modern':
      default:
        return <ModernTemplate data={resumeData} sectionOrder={sectionOrder} onMoveSection={(index, direction) => { void moveSection(index, direction); }} hideOrderButtons={isZoomed} />;
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-background-dark animate-in slide-in-from-right duration-300">
      <header className="fixed top-0 left-0 right-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-white/5 mx-auto w-full max-w-md">
        <div className="h-14 px-4 flex items-center justify-between relative">
          <BackButton
            onClick={goBack}
            className="z-10"
          />
          <h2 className="absolute inset-0 flex items-center justify-center text-lg font-bold leading-tight tracking-[-0.015em] text-slate-900 dark:text-white pointer-events-none">
            简历预览
          </h2>
          <button
            onClick={() => navigateToView(View.EDITOR)}
            className="z-10 flex items-center gap-1.5 h-9 px-3 rounded-full bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 active:scale-95 transition-all text-slate-700 dark:text-white text-xs font-semibold"
          >
            <span className="material-symbols-outlined text-[18px]">edit</span>
            编辑
          </button>
        </div>
      </header>

      <main className="flex-1 w-full relative overflow-y-auto no-scrollbar bg-slate-50 dark:bg-background-dark pt-20 pb-32 flex flex-col items-center gap-6" id="preview-area">
        <div className="w-[90%] bg-white dark:bg-slate-900/50 backdrop-blur-md rounded-2xl p-3 border border-slate-200 dark:border-white/5 shadow-xl shadow-slate-200/20 dark:shadow-none">
          <div className="flex items-center gap-3">
            {TEMPLATE_OPTIONS.map((t) => (
              <button
                key={t.id}
                onClick={() => handleTemplateChange(t.id)}
                className={`
                  relative flex-1 py-2 rounded-xl text-[11px] font-bold transition-all duration-300 flex items-center justify-center gap-1.5 border
                  ${currentTemplateId === t.id
                    ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20 scale-[1.02]'
                    : 'bg-slate-50 dark:bg-white/5 border-slate-100 dark:border-transparent text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-white/10 hover:border-slate-200'
                  }
                `}
              >
                <div className={`w-1.5 h-1.5 rounded-full ${currentTemplateId === t.id ? 'bg-white' : ''}`} style={{ backgroundColor: currentTemplateId === t.id ? undefined : t.color }}></div>
                {t.name}
              </button>
            ))}
          </div>
        </div>
        <div
          className="relative w-[85%] flex flex-col items-center group/doc-wrapper"
          onTouchStart={handlePreviewTouchStart}
          onTouchMove={handlePreviewTouchMove}
          onTouchEnd={handlePreviewTouchEnd}
          onTouchCancel={handlePreviewTouchEnd}
          style={{ touchAction: isZoomed ? 'none' : 'pan-y' }}
        >
          <div className={`
                relative w-full aspect-[1/1.414] bg-white rounded-sm shadow-2xl ease-out origin-center 
                ${currentTemplateId === 'modern' ? 'shadow-blue-900/20' : ''}
                ${currentTemplateId === 'classic' ? 'shadow-slate-900/20' : ''}
                ${currentTemplateId === 'minimal' ? 'shadow-black/20' : ''}
                ${isZoomed ? '' : 'transition-all duration-500'}
            `}
            ref={previewCardRef}
            style={{
              transform: `translate3d(${previewOffset.x}px, ${previewOffset.y}px, 0) scale(${previewScale})`,
              transformOrigin: 'center center',
            }}
          >
            {/* Styles for print/PDF consistency */}
            <style dangerouslySetInnerHTML={{
              __html: `
                            @media print {
                                #resume-content-modern, #resume-content-classic, #resume-content-minimal {
                                    width: 794px !important;
                                    min-width: 794px !important;
                                    max-width: 794px !important;
                                    margin: 0 !important;
                                    padding: 32px !important;
                                    box-shadow: none !important;
                                    border-radius: 0 !important;
                                    background-color: #ffffff !important;
                                    font-family: inherit !important;
                                    color: #0f172a !important;
                                    overflow: visible !important;
                                }
                                .no-print { display: none !important; }
                                @page { margin: 0; size: A4 portrait; }
                                body { margin: 0; padding: 0; background: #ffffff !important; -webkit-print-color-adjust: exact !important; }
                                * { -webkit-print-color-adjust: exact !important; color-adjust: exact !important; }
                                .no-break { break-inside: avoid; page-break-inside: avoid; }
                                h1, h2, h3, h4, h5, h6 { break-after: avoid; page-break-after: avoid; }
                            }
                        `
            }} />
            {renderTemplate()}
          </div>
        </div>

        <div className="w-[85%] flex flex-col gap-4">

          <button
            onClick={handleExportPDF}
            disabled={isGenerating}
            className="w-full flex items-center justify-center gap-2 h-14 bg-primary hover:bg-blue-600 active:bg-blue-700 text-white rounded-xl shadow-[0_0_20px_rgba(19,127,236,0.15)] transition-all transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <>
                <span className="size-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                <span className="text-base font-bold tracking-wide">生成中...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[24px]">download</span>
                <span className="text-base font-bold tracking-wide">导出 PDF</span>
              </>
            )}
          </button>
          <p className="text-center text-xs text-slate-400 dark:text-slate-600 mt-2 mb-4">
            注意：PDF导出样式取决于后端生成配置，可能与预览略有差异。
          </p>
        </div>
      </main>

      <BottomNav />
    </div>
  );
};

export default Preview;
