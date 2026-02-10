import React, { useState, useEffect } from 'react';
import { View, ScreenProps, ResumeData } from '../../types';
import { supabase } from '../../src/supabase-client';
import { DatabaseService } from '../../src/database-service';

// --- Helper Functions ---

// Format date range: handles 'date' field or 'startDate/endDate' fields
const formatDateRange = (item: any): string => {
  // If 'date' field exists and is not empty, use it directly
  if (item.date && item.date.trim()) {
    return item.date;
  }

  // Otherwise, try to build from startDate and endDate
  const startDate = item.startDate || '';
  const endDate = item.endDate || '';

  if (startDate && endDate) {
    return `${startDate} - ${endDate}`;
  } else if (startDate) {
    return `${startDate} - 至今`;
  } else if (endDate) {
    return endDate;
  }

  return '';
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
    const parts = [];
    if (item.degree && String(item.degree).trim()) parts.push(String(item.degree).trim());
    if (item.major && String(item.major).trim()) parts.push(String(item.major).trim());
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

// --- Template Definitions ---

const TEMPLATE_OPTIONS = [
  { id: 'modern', name: '现代极简', color: '#3b82f6' },
  { id: 'classic', name: '经典商务', color: '#475569' },
  { id: 'minimal', name: '简约白黑', color: '#000000' },
];

// --- Template Components ---

const ModernTemplate: React.FC<{ data: ResumeData }> = ({ data }) => (
  <div
    id="resume-content-modern"
    className="bg-white p-8 w-full text-slate-900 h-full min-h-[1123px]"
    style={{
      fontFamily: "'PingFang SC', 'Microsoft YaHei', sans-serif",
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
          <span>{data?.personalInfo?.email || 'email@example.com'}</span>
          <span>•</span>
          <span>{data?.personalInfo?.phone || '+86 138 0000 0000'}</span>
        </div>
      </div>
    </div>

    {/* Summary */}
    {data?.summary && (
      <div className="mb-5 no-break">
        <h3 className="text-sm font-bold text-blue-600 uppercase border-b border-blue-100 pb-1 mb-2" style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e40af' }}>个人简介</h3>
        <p className="text-[10px] text-gray-600 leading-relaxed whitespace-pre-wrap" style={{ fontSize: '10px', color: '#4b5563', lineHeight: '1.4' }}>{data.summary}</p>
      </div>
    )}

    {/* Body */}
    {data?.workExps && data.workExps.length > 0 && (
      <div className="mb-5 space-y-2 no-break">
        <h3 className="text-sm font-bold text-blue-600 uppercase border-b border-blue-100 pb-1 mb-2" style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e40af' }}>工作经历</h3>
        {data.workExps.map((exp: any, index: number) => (
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
    )}

    {data?.educations && data.educations.length > 0 && (
      <div className="mb-5 space-y-2 no-break">
        <h3 className="text-sm font-bold text-blue-600 uppercase border-b border-blue-100 pb-1 mb-2" style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e40af' }}>教育背景</h3>
        {data.educations.map((edu: any, index: number) => (
          <div key={edu.id} className="flex justify-between items-baseline mb-1 no-break">
            <span className="text-xs font-bold text-gray-800" style={{ fontSize: '12px', fontWeight: 'bold', color: '#1f2937' }}>{resolveExperienceTitle(edu)}</span>
            <span className="text-[10px] text-gray-500" style={{ fontSize: '10px', color: '#6b7280' }}>{formatDateRange(edu) || '教育时间'}</span>
          </div>
        ))}
        {data.educations.length > 0 && (
          <p className="text-[10px] text-gray-600" style={{ fontSize: '10px', color: '#4b5563' }}>{resolveExperienceSubtitle(data.educations[0])}</p>
        )}
      </div>
    )}

    {data?.projects && data.projects.length > 0 && (
      <div className="mb-5 space-y-2 no-break">
        <h3 className="text-sm font-bold text-blue-600 uppercase border-b border-blue-100 pb-1 mb-2" style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e40af' }}>项目经历</h3>
        {data.projects.map((proj: any, index: number) => (
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
    )}

    {data?.skills && data.skills.length > 0 && (
      <div className="mb-5 space-y-2 no-break">
        <h3 className="text-sm font-bold text-blue-600 uppercase border-b border-blue-100 pb-1 mb-2" style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e40af' }}>技能</h3>
        <div className="flex flex-wrap gap-2">
          {data.skills.map((skill: string, index: number) => (
            <span key={index} className="text-gray-700 text-[10px] mr-2" style={{ fontSize: '10px', color: '#374151' }}>{skill}</span>
          ))}
        </div>
      </div>
    )}
  </div>
);

const ClassicTemplate: React.FC<{ data: ResumeData }> = ({ data }) => (
  <div
    id="resume-content-classic"
    className="bg-white p-8 w-full text-slate-900 h-full min-h-[1123px]"
    style={{
      fontFamily: "'Times New Roman', 'SimSun', serif",
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
        <span>{data?.personalInfo?.email || 'email@example.com'}</span>
        <span>{data?.personalInfo?.phone || '+86 138 0000 0000'}</span>
      </div>
    </div>

    {/* Summary */}
    {data?.summary && (
      <div className="mb-8 px-2 no-break">
        <h3 className="text-sm font-bold text-gray-900 border-b-2 border-gray-900 mb-2 pb-0.5" style={{ fontSize: '14px', fontWeight: 'bold' }}>个人简介</h3>
        <p className="text-xs text-gray-700 italic leading-relaxed whitespace-pre-wrap" style={{ fontSize: '12px' }}>{data.summary}</p>
      </div>
    )}

    {/* Body */}
    {data?.workExps && data.workExps.length > 0 && (
      <div className="mb-6 space-y-4 no-break">
        <h3 className="text-sm font-bold text-black uppercase border-b border-black pb-1 mb-3 bg-gray-100 pl-2" style={{ fontSize: '14px', fontWeight: 'bold', color: '#000', backgroundColor: '#f3f4f6' }}>工作经历</h3>
        {data.workExps.map((exp: any, index: number) => (
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
    )}

    {data?.educations && data.educations.length > 0 && (
      <div className="mb-6 space-y-4 no-break">
        <h3 className="text-sm font-bold text-black uppercase border-b border-black pb-1 mb-3 bg-gray-100 pl-2" style={{ fontSize: '14px', fontWeight: 'bold', color: '#000', backgroundColor: '#f3f4f6' }}>教育背景</h3>
        {data.educations.map((edu: any, index: number) => (
          <div key={edu.id} className="flex justify-between items-baseline mb-2 no-break pl-2">
            <div>
              <span className="text-sm font-bold text-black block" style={{ fontSize: '12px', fontWeight: 'bold' }}>{resolveExperienceTitle(edu)}</span>
              <span className="text-xs text-gray-800" style={{ fontSize: '10px' }}>{resolveExperienceSubtitle(edu)}</span>
            </div>
            <span className="text-xs text-gray-600 italic" style={{ fontSize: '10px' }}>{formatDateRange(edu) || '教育时间'}</span>
          </div>
        ))}
      </div>
    )}

    {data?.projects && data.projects.length > 0 && (
      <div className="mb-6 space-y-4 no-break">
        <h3 className="text-sm font-bold text-black uppercase border-b border-black pb-1 mb-3 bg-gray-100 pl-2" style={{ fontSize: '14px', fontWeight: 'bold', color: '#000', backgroundColor: '#f3f4f6' }}>项目经历</h3>
        {data.projects.map((proj: any, index: number) => (
          <div key={proj.id} className="mb-4 no-break pl-2">
            <div className="flex justify-between items-baseline mb-1">
              <span className="text-sm font-bold text-black" style={{ fontSize: '12px', fontWeight: 'bold' }}>{resolveExperienceTitle(proj)}</span>
              <span className="text-xs text-gray-600 italic" style={{ fontSize: '10px' }}>{formatDateRange(proj) || '项目时间'}</span>
            </div>
            <p className="text-xs font-bold text-gray-800 mb-1" style={{ fontSize: '10px', fontWeight: 'bold' }}>{resolveExperienceSubtitle(proj) || '项目角色'}</p>
            <p className="text-xs text-gray-700 leading-relaxed text-justify" style={{ fontSize: '10px', lineHeight: '1.5' }}>{proj.description || '项目描述'}</p>
          </div>
        ))}
      </div>
    )}

    {data?.skills && data.skills.length > 0 && (
      <div className="mb-6 space-y-2 no-break">
        <h3 className="text-sm font-bold text-black uppercase border-b border-black pb-1 mb-3 bg-gray-100 pl-2" style={{ fontSize: '14px', fontWeight: 'bold', color: '#000', backgroundColor: '#f3f4f6' }}>专业技能</h3>
        <p className="text-xs text-gray-800 pl-2 leading-relaxed" style={{ fontSize: '10px' }}>
          {data.skills.join(' • ')}
        </p>
      </div>
    )}
  </div>
);

const MinimalTemplate: React.FC<{ data: ResumeData }> = ({ data }) => (
  <div
    id="resume-content-minimal"
    className="bg-white p-8 w-full text-slate-900 h-full min-h-[1123px]"
    style={{
      fontFamily: "'Helvetica Neue', Arial, sans-serif",
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
      <div className="flex flex-col gap-1 text-xs text-gray-400 font-mono" style={{ fontSize: '11px', fontFamily: 'monospace' }}>
        <span>{data?.personalInfo?.email || 'email@example.com'}</span>
        <span>{data?.personalInfo?.phone || '+86 138 0000 0000'}</span>
      </div>
    </div>

    <div className="flex flex-col gap-8">
      {/* Summary Section */}
      {data?.summary && (
        <section className="mb-6 no-break">
          <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[2px] mb-2" style={{ fontSize: '14px' }}>Summary</h3>
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap" style={{ fontSize: '12px' }}>
            {data.summary}
          </p>
        </section>
      )}

      {/* Experience */}
      {data?.workExps && data.workExps.length > 0 && (
        <div className="no-break">
          <h3 className="text-sm font-bold text-black uppercase tracking-widest border-b border-black pb-2 mb-4" style={{ fontSize: '14px' }}>Experience</h3>
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
      )}



      {/* Education */}
      {data?.educations && data.educations.length > 0 && (
        <div className="no-break">
          <h3 className="text-sm font-bold text-black uppercase tracking-widest border-b border-black pb-2 mb-4" style={{ fontSize: '14px' }}>Education</h3>
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
      )}

      {/* Projects */}
      {data?.projects && data.projects.length > 0 && (
        <div className="no-break">
          <h3 className="text-sm font-bold text-black uppercase tracking-widest border-b border-black pb-2 mb-4" style={{ fontSize: '14px' }}>Projects</h3>
          <div className="space-y-6">
            {data.projects.map((proj: any) => (
              <div key={proj.id}>
                <div className="flex justify-between items-baseline mb-1">
                  <h4 className="font-bold text-black" style={{ fontSize: '12px' }}>{resolveExperienceTitle(proj)}</h4>
                  <span className="text-sm text-gray-600 font-mono" style={{ fontSize: '10px' }}>{formatDateRange(proj)}</span>
                </div>
                <p className="text-sm text-gray-700 mb-2 font-medium italic" style={{ fontSize: '10px' }}>{resolveExperienceSubtitle(proj)}</p>
                <p className="text-sm text-gray-800 leading-relaxed text-justify" style={{ fontSize: '10px' }}>{proj.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Skills */}
      {data?.skills && data.skills.length > 0 && (
        <div className="no-break">
          <h3 className="text-sm font-bold text-black uppercase tracking-widest border-b border-black pb-2 mb-4" style={{ fontSize: '14px' }}>Skills</h3>
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            {data.skills.map((skill: string) => (
              <span key={skill} className="text-sm text-black font-medium" style={{ fontSize: '10px' }}>{skill}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  </div >
);


  const sanitizeData = (data: any): any => {
    const fieldsToRemove = ['suggestions', 'metadata', 'status', 'optimizationStatus', 'interviewSessions', 'lastJdText', 'exportHistory', 'id'];
    if (Array.isArray(data)) return data.map(item => sanitizeData(item));
    if (typeof data === 'object' && data !== null) {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(data)) {
        if (fieldsToRemove.includes(key)) continue;
        sanitized[key] = sanitizeData(value);
      }
      return sanitized;
    }
    return data;
  };

  const buildExportFilename = (title?: string) => {
    const rawTitle = (title || '').trim();
    const cleaned = rawTitle.replace(/[\\/:*?"<>|]+/g, '').trim();
    const base = cleaned || '简历';
    return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
  };

const buildExportHtml = (templateId: string): string | null => {
  const resumeEl = document.getElementById(`resume-content-${templateId}`);
  if (!resumeEl) return null;

  const resumeHtml = resumeEl.outerHTML;

  return `
<!doctype html>
<html lang="zh">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=794, initial-scale=1" />
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined" rel="stylesheet" />
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
      html, body {
        margin: 0;
        padding: 0;
        width: 794px;
        background: #ffffff;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      #resume-root {
        width: 794px;
        min-height: 1123px;
      }
      .material-symbols-outlined {
        font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
      }
      .no-break { break-inside: avoid; page-break-inside: avoid; }
      h1, h2, h3, h4, h5, h6 { break-after: avoid; page-break-after: avoid; }
      @page { size: A4; margin: 0; }
    </style>
  </head>
  <body>
    <div id="resume-root">
      ${resumeHtml}
    </div>
  </body>
</html>
  `.trim();
};

const Preview: React.FC<ScreenProps> = ({ setCurrentView, goBack, resumeData, setResumeData }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const isOptimized = resumeData?.optimizationStatus === 'optimized';
  const currentTemplateId = resumeData?.templateId || 'modern';

  const recordExportHistory = async (filename: string, size: number) => {
    if (!resumeData?.id) return;

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) return;

      const entry = {
        filename: buildExportFilename(resumeData?.resumeTitle || resumeData?.personalInfo?.name),
        size,
        type: 'PDF' as const,
        exportedAt: new Date().toISOString()
      };
      const currentHistory = resumeData.exportHistory || [];
      const updatedResumeData: ResumeData = {
        ...resumeData,
        exportHistory: [entry, ...currentHistory].slice(0, 200)
      };

      await DatabaseService.updateResume(String(resumeData.id), {
        resume_data: updatedResumeData,
        updated_at: new Date().toISOString()
      });
    } catch (err) {
      console.error('Failed to record export history:', err);
    }
  };

  const handleExportPDF = async () => {
    if (isGenerating || !resumeData) return;
    setIsGenerating(true);

      try {
        const sanitizedResumeData = sanitizeData(resumeData);
        const htmlContent = buildExportHtml(currentTemplateId);
        const resumeTitle = resumeData?.resumeTitle || '';
        const payload: Record<string, unknown> = {
          resumeData: sanitizedResumeData,
          jdText: resumeData?.optimizationStatus === 'optimized' ? (resumeData?.lastJdText || '') : '',
          resumeTitle,
          filename: resumeTitle
        };
        if (htmlContent) payload.htmlContent = htmlContent;
        const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'}/api/export-pdf`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || errorData.message || 'PDF 生成失败');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;

        const contentDisposition = response.headers.get('content-disposition');
        let filename = buildExportFilename(resumeData?.resumeTitle);
        if (contentDisposition) {
          const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
          if (filenameMatch) filename = filenameMatch[1];
        } else {
          filename = buildExportFilename(resumeData?.resumeTitle || resumeData?.personalInfo?.name);
        }

      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      await recordExportHistory(filename, blob.size);
      console.log('✅ PDF 导出成功');

    } catch (error) {
      console.error('❌ PDF 导出失败:', error);
      alert(`PDF 导出失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleTemplateChange = async (templateId: string) => {
    if (!resumeData || !setResumeData) return;

    // Optimistic update
    const updatedData = { ...resumeData, templateId };
    setResumeData(updatedData);

    // Save to database
    if (resumeData.id) {
      try {
        await DatabaseService.updateResume(String(resumeData.id), {
          resume_data: updatedData
        });
      } catch (error) {
        console.error('Failed to update template:', error);
      }
    }
  };

  const renderTemplate = () => {
    if (!resumeData) return null;
    const templateId = resumeData.templateId || 'modern';

    switch (templateId) {
      case 'classic':
        return <ClassicTemplate data={resumeData} />;
      case 'minimal':
        return <MinimalTemplate data={resumeData} />;
      case 'modern':
      default:
        return <ModernTemplate data={resumeData} />;
    }
  };

  return (
    <div className="flex flex-col h-full bg-background-dark animate-in slide-in-from-right duration-300">
      <header className="absolute top-0 left-0 w-full z-30 flex items-center justify-between p-4 bg-gradient-to-b from-background-dark/90 to-transparent backdrop-blur-[2px]">
        <button
          onClick={goBack}
          className="flex size-10 items-center justify-center rounded-full bg-white/5 hover:bg-white/10 active:scale-95 transition-all text-white"
        >
          <span className="material-symbols-outlined text-[24px]">arrow_back</span>
        </button>
        <h2 className="text-white text-lg font-bold tracking-tight opacity-90">简历预览</h2>
        <button
          onClick={() => setCurrentView(View.EDITOR)}
          className="flex items-center gap-1.5 h-9 px-3 rounded-full bg-white/10 hover:bg-white/15 active:scale-95 transition-all text-white text-xs font-semibold"
        >
          <span className="material-symbols-outlined text-[18px]">edit</span>
          编辑
        </button>
      </header>

      <main className="flex-1 w-full relative overflow-y-auto no-scrollbar bg-background-dark pt-24 pb-32 flex flex-col items-center gap-8" id="preview-area">
        <div className="relative w-[85%] flex flex-col items-center group/doc-wrapper">
          <div className={`
                relative w-full aspect-[1/1.414] bg-white rounded-sm shadow-2xl transition-all duration-500 ease-out origin-top 
                ${currentTemplateId === 'modern' ? 'shadow-blue-900/20' : ''}
                ${currentTemplateId === 'classic' ? 'shadow-slate-900/20' : ''}
                ${currentTemplateId === 'minimal' ? 'shadow-black/20' : ''}
            `}>
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
          <div className="w-full bg-white/5 backdrop-blur-md rounded-xl p-2 border border-white/5 shadow-inner mb-2">
            <p className="text-xs text-slate-400 mb-2 px-1">简历模板</p>
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              {TEMPLATE_OPTIONS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleTemplateChange(t.id)}
                  className={`
                  relative px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 flex-1 flex items-center justify-center gap-2 whitespace-nowrap
                  ${currentTemplateId === t.id
                      ? 'bg-primary text-white shadow-lg'
                      : 'bg-white/5 text-slate-300 hover:text-white hover:bg-white/10'
                    }
              `}
                >
                  <span
                    className="w-2 h-2 rounded-full shadow-sm"
                    style={{ backgroundColor: t.color }}
                  ></span>
                  {t.name}
                </button>
              ))}
            </div>
          </div>
          {isOptimized && (
            <button
              onClick={() => {
                if (resumeData?.id) {
                  localStorage.setItem('ai_interview_open', '1');
                  localStorage.setItem('ai_interview_resume_id', String(resumeData.id));
                }
                setCurrentView(View.AI_ANALYSIS);
              }}
              className="w-full flex items-center justify-between px-5 py-3 bg-gradient-to-r from-primary to-blue-600 text-white rounded-xl shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="relative size-10 rounded-full overflow-hidden border-2 border-white/30 bg-white">
                  <img src="https://api.dicebear.com/9.x/avataaars/svg?seed=Felix" alt="AI Interviewer" className="w-full h-full object-cover" />
                  <span className="absolute bottom-0 right-0 size-2.5 bg-green-500 rounded-full border-2 border-white"></span>
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold">AI 模拟面试官</p>
                  <p className="text-xs text-blue-100">继续上次面试对话</p>
                </div>
              </div>
              <div className="size-9 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition-colors">
                <span className="material-symbols-outlined text-xl">arrow_forward</span>
              </div>
            </button>
          )}
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
          <p className="text-center text-xs text-white/30 mt-2">
            注意：PDF导出样式取决于后端生成配置，可能与预览略有差异。
          </p>
        </div>
      </main>
    </div>
  );
};

export default Preview;
