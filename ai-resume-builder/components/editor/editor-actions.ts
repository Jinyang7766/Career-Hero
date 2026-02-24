import type { Education, Project, ResumeData, WorkExperience } from '../../types';
import {
  EDUCATION_FIELD_LIMITS,
  PERSONAL_FIELD_LIMITS,
  PROJECT_FIELD_LIMITS,
  WORK_FIELD_LIMITS,
  clampByLimit,
} from '../../src/editor-field-limits';
import { mergeSkills } from '../../src/skill-utils';

export type EditableSection = 'workExps' | 'educations' | 'projects';
type ItemBySection = { workExps: WorkExperience; educations: Education; projects: Project };

export const updateResumePersonalField = (
  resumeData: ResumeData,
  field: keyof ResumeData['personalInfo'] | 'gender',
  value: string
): ResumeData => {
  const personalLimit = field !== 'gender'
    ? (PERSONAL_FIELD_LIMITS as Record<string, number>)[field]
    : undefined;
  const nextValue = typeof personalLimit === 'number' ? clampByLimit(value, personalLimit) : value;
  if (field === 'gender') {
    return { ...resumeData, gender: nextValue };
  }
  return {
    ...resumeData,
    personalInfo: { ...resumeData.personalInfo, [field]: nextValue },
  };
};

export const addResumeSectionItem = (resumeData: ResumeData, section: EditableSection): ResumeData => ({
  ...resumeData,
  [section]: [
    ...resumeData[section],
    { id: Date.now(), title: '', subtitle: '', date: '', description: '' }
  ]
});

export const removeResumeSectionItem = (resumeData: ResumeData, section: EditableSection, id: number): ResumeData => ({
  ...resumeData,
  [section]: resumeData[section].filter((item: any) => item.id !== id)
});

export const updateResumeSectionItem = <S extends EditableSection>(
  resumeData: ResumeData,
  section: S,
  id: number,
  field: keyof ItemBySection[S],
  value: string
): ResumeData => {
  const limitMap =
    section === 'workExps'
      ? WORK_FIELD_LIMITS
      : section === 'educations'
        ? EDUCATION_FIELD_LIMITS
        : PROJECT_FIELD_LIMITS;
  const key = String(field);
  const fieldLimit = (limitMap as Record<string, number>)[key];
  const nextValue = typeof fieldLimit === 'number' ? clampByLimit(value, fieldLimit) : value;

  return {
    ...resumeData,
    [section]: (resumeData[section] as Array<ItemBySection[S]>).map(item => {
      if (item.id !== id) return item;
      const next: any = { ...item, [field]: nextValue };
      if (section === 'workExps') {
        next.company = next.company || next.title || '';
        next.position = next.position || next.subtitle || '';
      } else if (section === 'educations') {
        next.school = next.school || next.title || '';
        next.major = next.major || next.subtitle || '';
      } else if (section === 'projects') {
        next.role = next.role || next.subtitle || '';
      }
      return next;
    })
  };
};

export const addResumeSkills = (resumeData: ResumeData, tokens: string[]): ResumeData => ({
  ...resumeData,
  skills: mergeSkills(resumeData.skills, tokens)
});

export const removeResumeSkillByIndex = (resumeData: ResumeData, index: number): ResumeData => ({
  ...resumeData,
  skills: resumeData.skills.filter((_, i) => i !== index)
});

export const clearResumeCurrentStep = (
  resumeData: ResumeData,
  currentStep: 'import' | 'personal' | 'work' | 'education' | 'projects' | 'skills' | 'summary'
): ResumeData => {
  const next = { ...resumeData };
  switch (currentStep) {
    case 'personal':
      next.personalInfo = {
        name: '', title: '', email: '', phone: '', location: '', linkedin: '', website: '', avatar: '', age: '', summary: resumeData.personalInfo.summary
      };
      next.gender = '';
      break;
    case 'work':
      next.workExps = [];
      break;
    case 'education':
      next.educations = [];
      break;
    case 'projects':
      next.projects = [];
      break;
    case 'skills':
      next.skills = [];
      break;
    case 'summary':
      next.summary = '';
      break;
  }
  return next;
};

export const clearResumeAllData = (resumeData: ResumeData): ResumeData => ({
  id: resumeData.id,
  resumeTitle: resumeData.resumeTitle,
  personalInfo: { name: '', title: '', email: '', phone: '', location: '', linkedin: '', website: '' },
  workExps: [],
  educations: [],
  projects: [],
  skills: [],
  summary: '',
  gender: '',
});
