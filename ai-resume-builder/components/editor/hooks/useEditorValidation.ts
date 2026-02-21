import type { ResumeData } from '../../../types';

type WizardStep = 'import' | 'personal' | 'work' | 'education' | 'projects' | 'skills' | 'summary';

type Params = {
  resumeData: ResumeData;
  summary: string;
  hasTouchedProjects: boolean;
  hasImportedResume: boolean;
};

export const useEditorValidation = ({
  resumeData,
  summary,
  hasTouchedProjects,
  hasImportedResume,
}: Params) => {
  const validatePersonalFormats = (data: ResumeData) => {
    const errors: Record<string, string> = {};
    const name = (data.personalInfo.name || '').trim();
    const title = (data.personalInfo.title || '').trim();
    const email = (data.personalInfo.email || '').trim();
    const phone = (data.personalInfo.phone || '').trim();

    if (name && /^\d+$/.test(name)) {
      errors.name = '姓名格式不正确';
    }
    if (title && /^\d+$/.test(title)) {
      errors.title = '求职意向格式不正确';
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = '邮箱格式不正确';
    }
    if (phone && !/^\+?[\d\s\-()]{7,20}$/.test(phone)) {
      errors.phone = '电话号码格式不正确';
    }
    return errors;
  };

  const isPersonalInfoComplete = () => {
    const { personalInfo } = resumeData;
    return Boolean(personalInfo.name && personalInfo.title && personalInfo.email && personalInfo.phone && resumeData.gender);
  };

  const isOngoingValue = (value?: string) => (value || '').trim() === '至今';

  const hasValidDateRange = (item: { startDate?: string; endDate?: string; date?: string }) => {
    if (item?.date) return true;
    const start = (item?.startDate || '').trim();
    const end = (item?.endDate || '').trim();
    if (!start) return false;
    return Boolean(end) || isOngoingValue(end);
  };

  const isWorkExperienceComplete = () => {
    return resumeData.workExps.length > 0 && resumeData.workExps.some(exp =>
      Boolean(exp.title && exp.subtitle && hasValidDateRange(exp))
    );
  };

  const isEducationComplete = () => {
    return resumeData.educations.length > 0 && resumeData.educations.some(edu =>
      Boolean(edu.title && edu.subtitle && hasValidDateRange(edu))
    );
  };

  const isSkillsComplete = () => resumeData.skills.length > 0;

  const isProjectsComplete = () => {
    return resumeData.projects.length > 0 && resumeData.projects.some(proj =>
      Boolean(proj.title && proj.description && hasValidDateRange(proj))
    );
  };

  const isSummaryComplete = () => Boolean((summary || '').trim());

  const isStepComplete = (step: WizardStep) => {
    switch (step) {
      case 'import':
        return true;
      case 'personal':
        return isPersonalInfoComplete();
      case 'work':
        return isWorkExperienceComplete();
      case 'education':
        return isEducationComplete();
      case 'projects':
        return isProjectsComplete() || hasTouchedProjects;
      case 'skills':
        return isSkillsComplete();
      case 'summary':
        return isSummaryComplete();
      default:
        return false;
    }
  };

  const isStepRequired = (step: WizardStep) => step !== 'import' && step !== 'projects';

  const isStepMissing = (step: WizardStep) => {
    if (!hasImportedResume) return false;
    if (!isStepRequired(step)) return false;
    return !isStepComplete(step);
  };

  return {
    validatePersonalFormats,
    isPersonalInfoComplete,
    isWorkExperienceComplete,
    isEducationComplete,
    isSkillsComplete,
    isProjectsComplete,
    isSummaryComplete,
    isStepComplete,
    isStepRequired,
    isStepMissing,
  };
};
