import { useEffect, useRef } from 'react';
import type { ResumeData } from '../../../types';
import { toSkillListForImport } from '../../../src/skill-utils';

export const useEditorDataNormalization = ({
  resumeData,
  setResumeData,
}: {
  resumeData: ResumeData;
  setResumeData?: (updater: (prev: ResumeData) => ResumeData) => void;
}) => {
  const lastNormalizedResumeIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!resumeData?.id || !setResumeData) return;
    if (lastNormalizedResumeIdRef.current === resumeData.id) return;

    const normalizeDateRange = (start?: string, end?: string) => {
      const s = (start || '').trim();
      const e = (end || '').trim();
      if (s && e) return `${s} - ${e}`;
      return s || e || '';
    };

    const parseDateRange = (date?: string) => {
      const raw = (date || '').trim();
      if (!raw) return { startDate: '', endDate: '' };
      const parts = raw.split(/\s*[-–—]\s*/);
      if (parts.length >= 2) {
        return { startDate: parts[0], endDate: parts.slice(1).join(' - ') };
      }
      return { startDate: raw, endDate: '' };
    };

    const mergeDateFields = (item: any) => {
      const existingStart = (item?.startDate || '').trim();
      const existingEnd = (item?.endDate || '').trim();
      const parsed = parseDateRange(item?.date);
      return {
        startDate: existingStart || parsed.startDate,
        endDate: existingEnd || parsed.endDate,
      };
    };

    const normalizeWork = (exp: any) => ({
      ...exp,
      ...mergeDateFields(exp),
      title: exp?.title || exp?.company || '',
      subtitle: exp?.subtitle || exp?.position || '',
      date: exp?.date || normalizeDateRange(exp?.startDate, exp?.endDate),
      company: exp?.company || exp?.title || '',
      position: exp?.position || exp?.subtitle || '',
    });

    const normalizeEdu = (edu: any) => ({
      ...edu,
      ...mergeDateFields(edu),
      title: edu?.title || edu?.school || '',
      subtitle: edu?.subtitle || edu?.major || '',
      date: edu?.date || normalizeDateRange(edu?.startDate, edu?.endDate),
      school: edu?.school || edu?.title || '',
      degree: edu?.degree || '',
      major: edu?.major || edu?.subtitle || '',
    });

    const normalizeProjects = (proj: any) => ({
      ...proj,
      ...mergeDateFields(proj),
      title: proj?.title || '',
      subtitle: proj?.subtitle || proj?.role || '',
      date: proj?.date || normalizeDateRange(proj?.startDate, proj?.endDate),
      role: proj?.role || proj?.subtitle || '',
    });

    setResumeData((prev) => ({
      ...prev,
      workExps: (prev.workExps || []).map(normalizeWork),
      educations: (prev.educations || []).map(normalizeEdu),
      projects: (prev.projects || []).map(normalizeProjects),
      skills: toSkillListForImport(prev.skills),
    }));

    lastNormalizedResumeIdRef.current = resumeData.id;
  }, [resumeData?.id, setResumeData]);
};
