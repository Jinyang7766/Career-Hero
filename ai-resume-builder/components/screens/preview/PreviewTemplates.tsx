import React from 'react';
import type { ResumeData } from '../../../types';
import { formatTimeline } from '../../../src/timeline-utils';
import type { MoveSectionDirection, PreviewSectionKey } from './hooks/usePreviewSectionOrder';

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

const ModernTemplate: React.FC<{
  data: ResumeData;
  sectionOrder: PreviewSectionKey[];
  onMoveSection: (index: number, direction: MoveSectionDirection) => void;
  hideOrderButtons?: boolean;
}> = ({ data, sectionOrder, onMoveSection, hideOrderButtons }) => (
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
        <h1 className="text-xl font-bold text-gray-900" style={{ fontSize: '18px', fontWeight: 'bold' }}>{data?.personalInfo?.name || '姓名'}</h1>
        <p className="text-sm text-gray-600" style={{ fontSize: '14px', color: '#666' }}>{resolveJobTitle(data)}</p>
        <div className="flex flex-wrap gap-2 mt-1 text-[10px] text-gray-500" style={{ fontSize: '10px', color: '#999' }}>
          {(resolveExplicitGenderLabel(data?.gender) || data?.personalInfo?.age) && (
            <>
              <span>{[resolveExplicitGenderLabel(data?.gender), data.personalInfo.age ? `${data.personalInfo.age}岁` : ''].filter(Boolean).join(' · ')}</span>
              <span>•</span>
            </>
          )}
          <span>{data?.personalInfo?.email || 'email@example.com'}</span>
          <span>•</span>
          <span>{data?.personalInfo?.phone || '+86 138 0000 0000'}</span>
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
      if (section === 'workExps' && data?.workExps?.length) {
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
      if (section === 'educations' && data?.educations?.length) {
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
            <p className="text-[10px] text-gray-600" style={{ fontSize: '10px', color: '#4b5563' }}>{resolveExperienceSubtitle(data.educations[0])}</p>
          </div>
        );
      }
      if (section === 'projects' && data?.projects?.length) {
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
                <p className="text-[10px] text-gray-600 leading-relaxed mt-1" style={{ fontSize: '10px', color: '#4b5563', lineHeight: '1.4' }}>{proj.description || '项目描述'}</p>
              </div>
            ))}
          </div>
        );
      }
      if (section === 'skills') {
        const skills = resolveSkillsList((data as any)?.skills);
        if (!skills.length) return null;
        return (
          <div key={section} className="mb-5 space-y-2 no-break">
            <div className="flex items-center justify-between border-b border-blue-100 pb-1 mb-2">
              <h3 className="text-sm font-bold text-blue-600 uppercase" style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e40af' }}>技能</h3>
              <SectionOrderButtons orderIndex={orderIndex} total={sectionOrder.length} onMoveSection={onMoveSection} hidden={hideOrderButtons} />
            </div>
            <div className="flex flex-wrap gap-2">{skills.map((skill, index) => <span key={`${skill}-${index}`} className="text-gray-700 text-[10px] mr-2">{skill}</span>)}</div>
          </div>
        );
      }
      return null;
    })}
  </div>
);

const ClassicTemplate: React.FC<{ data: ResumeData; sectionOrder: PreviewSectionKey[]; onMoveSection: (index: number, direction: MoveSectionDirection) => void; hideOrderButtons?: boolean; }> = ({ data, sectionOrder, onMoveSection, hideOrderButtons }) => (
  <div id="resume-content-classic" className="bg-white p-8 w-full text-slate-900 h-full min-h-[1123px]" style={{ fontFamily: "'CustomFont'" }}>
    <div className="mb-8 text-center border-b-2 border-black pb-4 no-break">
      <div className="mx-auto mb-3 w-16 h-16 rounded-full border border-black bg-slate-200 flex items-center justify-center text-gray-400">
        {data?.personalInfo?.avatar ? <img src={data.personalInfo.avatar} alt="Avatar" className="w-full h-full object-cover rounded-full" /> : <span className="material-symbols-outlined text-[28px]">person</span>}
      </div>
      <h1 className="text-2xl font-bold text-black uppercase tracking-wider mb-2">{data?.personalInfo?.name || '姓名'}</h1>
      <p className="text-base text-gray-800 font-serif italic mb-2">{resolveJobTitle(data)}</p>
      <div className="flex justify-center gap-4 text-xs text-gray-600">
        <span>{data?.personalInfo?.email || 'email@example.com'}</span>
        <span>{data?.personalInfo?.phone || '+86 138 0000 0000'}</span>
      </div>
    </div>
    {sectionOrder.map((section, orderIndex) => {
      if (section === 'summary' && resolveSummaryText(data)) return (
        <div key={section} className="mb-8 px-2 no-break">
          <div className="flex items-center justify-between border-b-2 border-gray-900 mb-2 pb-0.5">
            <h3 className="text-sm font-bold text-gray-900">个人简介</h3>
            <SectionOrderButtons orderIndex={orderIndex} total={sectionOrder.length} onMoveSection={onMoveSection} hidden={hideOrderButtons} />
          </div>
          <p className="text-xs text-gray-700 italic leading-relaxed whitespace-pre-wrap">{resolveSummaryText(data)}</p>
        </div>
      );
      if (section === 'workExps' && data?.workExps?.length) return (
        <div key={section} className="mb-6 space-y-4 no-break">
          <div className="flex items-center justify-between border-b border-black pb-1 mb-3 bg-gray-100 pl-2 pr-1">
            <h3 className="text-sm font-bold text-black uppercase">工作经历</h3>
            <SectionOrderButtons orderIndex={orderIndex} total={sectionOrder.length} onMoveSection={onMoveSection} hidden={hideOrderButtons} />
          </div>
          {data.workExps.map((exp: any) => (
            <div key={exp.id} className="mb-4 no-break pl-2">
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-sm font-bold text-black">{resolveExperienceTitle(exp)}</span>
                <span className="text-xs text-gray-600 italic">{formatDateRange(exp) || '工作时间'}</span>
              </div>
              <p className="text-xs font-bold text-gray-800 mb-1">{resolveExperienceSubtitle(exp) || '职位'}</p>
              <p className="text-xs text-gray-700 leading-relaxed text-justify">{exp.description || '工作描述'}</p>
            </div>
          ))}
        </div>
      );
      if (section === 'educations' && data?.educations?.length) return (
        <div key={section} className="mb-6 space-y-4 no-break">
          <div className="flex items-center justify-between border-b border-black pb-1 mb-3 bg-gray-100 pl-2 pr-1">
            <h3 className="text-sm font-bold text-black uppercase">教育背景</h3>
            <SectionOrderButtons orderIndex={orderIndex} total={sectionOrder.length} onMoveSection={onMoveSection} hidden={hideOrderButtons} />
          </div>
          {data.educations.map((edu: any) => (
            <div key={edu.id} className="flex justify-between items-baseline mb-2 no-break pl-2">
              <div>
                <span className="text-sm font-bold text-black block">{resolveExperienceTitle(edu)}</span>
                <span className="text-xs text-gray-800">{resolveExperienceSubtitle(edu)}</span>
              </div>
              <span className="text-xs text-gray-600 italic">{formatDateRange(edu) || '教育时间'}</span>
            </div>
          ))}
        </div>
      );
      if (section === 'projects' && data?.projects?.length) return (
        <div key={section} className="mb-6 space-y-4 no-break">
          <div className="flex items-center justify-between border-b border-black pb-1 mb-3 bg-gray-100 pl-2 pr-1">
            <h3 className="text-sm font-bold text-black uppercase">项目经历</h3>
            <SectionOrderButtons orderIndex={orderIndex} total={sectionOrder.length} onMoveSection={onMoveSection} hidden={hideOrderButtons} />
          </div>
          {data.projects.map((proj: any) => (
            <div key={proj.id} className="mb-4 no-break pl-2">
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-sm font-bold text-black">{resolveExperienceTitle(proj)}</span>
                <span className="text-xs text-gray-600 italic">{formatDateRange(proj) || '项目时间'}</span>
              </div>
              <p className="text-xs font-bold text-gray-800 mb-1">{resolveExperienceSubtitle(proj) || '项目角色'}</p>
              <p className="text-xs text-gray-700 leading-relaxed text-justify">{proj.description || '项目描述'}</p>
            </div>
          ))}
        </div>
      );
      if (section === 'skills') {
        const skills = resolveSkillsList((data as any)?.skills);
        if (!skills.length) return null;
        return (
          <div key={section} className="mb-6 space-y-2 no-break">
            <div className="flex items-center justify-between border-b border-black pb-1 mb-3 bg-gray-100 pl-2 pr-1">
              <h3 className="text-sm font-bold text-black uppercase">专业技能</h3>
              <SectionOrderButtons orderIndex={orderIndex} total={sectionOrder.length} onMoveSection={onMoveSection} hidden={hideOrderButtons} />
            </div>
            <p className="text-xs text-gray-800 pl-2 leading-relaxed">{skills.join(' • ')}</p>
          </div>
        );
      }
      return null;
    })}
  </div>
);

const MinimalTemplate: React.FC<{ data: ResumeData; sectionOrder: PreviewSectionKey[]; onMoveSection: (index: number, direction: MoveSectionDirection) => void; hideOrderButtons?: boolean; }> = ({ data, sectionOrder, onMoveSection, hideOrderButtons }) => (
  <div id="resume-content-minimal" className="bg-white p-8 w-full text-slate-900 h-full min-h-[1123px]" style={{ fontFamily: "'CustomFont'" }}>
    <div className="mb-10 no-break">
      <div className="mb-4 w-14 h-14 rounded-full border border-slate-300 bg-slate-200 flex items-center justify-center text-slate-400">
        {data?.personalInfo?.avatar ? <img src={data.personalInfo.avatar} alt="Avatar" className="w-full h-full object-cover rounded-full" /> : <span className="material-symbols-outlined text-[24px]">person</span>}
      </div>
      <h1 className="text-4xl font-black text-black tracking-tight mb-2">{data?.personalInfo?.name || '姓名'}</h1>
      <p className="text-lg text-gray-500 font-light mb-4">{resolveJobTitle(data)}</p>
      <div className="flex flex-col gap-1 text-xs text-gray-400 font-mono">
        <span>{data?.personalInfo?.email || 'email@example.com'}</span>
        <span>{data?.personalInfo?.phone || '+86 138 0000 0000'}</span>
      </div>
    </div>
    <div className="flex flex-col gap-8">
      {sectionOrder.map((section, orderIndex) => {
        if (section === 'summary' && resolveSummaryText(data)) {
          return (
            <section key={section} className="mb-6 no-break">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[2px]">个人总结</h3>
                <SectionOrderButtons orderIndex={orderIndex} total={sectionOrder.length} onMoveSection={onMoveSection} hidden={hideOrderButtons} />
              </div>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{resolveSummaryText(data)}</p>
            </section>
          );
        }
        if (section === 'workExps' && data?.workExps?.length) {
          return (
            <div key={section} className="no-break">
              <div className="flex items-center justify-between border-b border-black pb-2 mb-4">
                <h3 className="text-sm font-bold text-black uppercase tracking-widest">工作经历</h3>
                <SectionOrderButtons orderIndex={orderIndex} total={sectionOrder.length} onMoveSection={onMoveSection} hidden={hideOrderButtons} />
              </div>
              <div className="space-y-6">
                {data.workExps.map((exp: any) => (
                  <div key={exp.id}>
                    <div className="flex justify-between items-baseline mb-1">
                      <h4 className="font-bold text-black">{resolveExperienceTitle(exp)}</h4>
                      <span className="text-sm text-gray-600 font-mono">{formatDateRange(exp)}</span>
                    </div>
                    <p className="text-sm text-gray-700 mb-2 font-medium italic">{resolveExperienceSubtitle(exp)}</p>
                    <p className="text-sm text-gray-800 leading-relaxed text-justify">{exp.description}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        }
        if (section === 'educations' && data?.educations?.length) {
          return (
            <div key={section} className="no-break">
              <div className="flex items-center justify-between border-b border-black pb-2 mb-4">
                <h3 className="text-sm font-bold text-black uppercase tracking-widest">教育背景</h3>
                <SectionOrderButtons orderIndex={orderIndex} total={sectionOrder.length} onMoveSection={onMoveSection} hidden={hideOrderButtons} />
              </div>
              <div className="space-y-4">
                {data.educations.map((edu: any) => (
                  <div key={edu.id}>
                    <div className="flex justify-between items-baseline mb-1">
                      <h4 className="font-bold text-black">{resolveExperienceTitle(edu)}</h4>
                      <span className="text-sm text-gray-600 font-mono">{formatDateRange(edu)}</span>
                    </div>
                    <p className="text-sm text-gray-700 italic">{resolveExperienceSubtitle(edu)}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        }
        if (section === 'projects' && data?.projects?.length) {
          return (
            <div key={section} className="no-break">
              <div className="flex items-center justify-between border-b border-black pb-2 mb-4">
                <h3 className="text-sm font-bold text-black uppercase tracking-widest">项目经历</h3>
                <SectionOrderButtons orderIndex={orderIndex} total={sectionOrder.length} onMoveSection={onMoveSection} hidden={hideOrderButtons} />
              </div>
              <div className="space-y-6">
                {data.projects.map((proj: any) => (
                  <div key={proj.id}>
                    <div className="flex justify-between items-baseline mb-1">
                      <h4 className="font-bold text-black">{resolveExperienceTitle(proj)}</h4>
                      <span className="text-sm text-gray-600 font-mono">{formatDateRange(proj)}</span>
                    </div>
                    <p className="text-sm text-gray-700 mb-2 font-medium italic">{resolveExperienceSubtitle(proj)}</p>
                    <p className="text-sm text-gray-800 leading-relaxed text-justify">{proj.description}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        }
        if (section === 'skills') {
          const skills = resolveSkillsList((data as any)?.skills);
          if (!skills.length) return null;
          return (
            <div key={section} className="no-break">
              <div className="flex items-center justify-between border-b border-black pb-2 mb-4">
                <h3 className="text-sm font-bold text-black uppercase tracking-widest">专业技能</h3>
                <SectionOrderButtons orderIndex={orderIndex} total={sectionOrder.length} onMoveSection={onMoveSection} hidden={hideOrderButtons} />
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-3">
                {skills.map((skill: string) => <span key={skill} className="text-sm text-black font-medium">{skill}</span>)}
              </div>
            </div>
          );
        }
        return null;
      })}
    </div>
  </div>
);

export const renderPreviewTemplate = ({
  templateId,
  data,
  sectionOrder,
  onMoveSection,
  hideOrderButtons,
}: {
  templateId: string;
  data: ResumeData;
  sectionOrder: PreviewSectionKey[];
  onMoveSection: (index: number, direction: MoveSectionDirection) => void;
  hideOrderButtons?: boolean;
}) => {
  switch (templateId) {
    case 'classic':
      return <ClassicTemplate data={data} sectionOrder={sectionOrder} onMoveSection={onMoveSection} hideOrderButtons={hideOrderButtons} />;
    case 'minimal':
      return <MinimalTemplate data={data} sectionOrder={sectionOrder} onMoveSection={onMoveSection} hideOrderButtons={hideOrderButtons} />;
    case 'modern':
    default:
      return <ModernTemplate data={data} sectionOrder={sectionOrder} onMoveSection={onMoveSection} hideOrderButtons={hideOrderButtons} />;
  }
};

