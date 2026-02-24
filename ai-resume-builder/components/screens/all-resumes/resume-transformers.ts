export const hasValidResumeData = (resumeData: any) => {
  if (!resumeData) return false;
  if (typeof resumeData !== 'object') return false;
  return Object.keys(resumeData).length > 0;
};

const defaultData = {
  personalInfo: { name: '', title: '', email: '', phone: '', age: '' },
  workExps: [],
  educations: [],
  projects: [],
  skills: [],
  gender: '',
};

export const buildEditorResumeData = (resume: any) => ({
  ...defaultData,
  ...resume.resume_data,
  id: resume.id,
  resumeTitle: resume.title,
  personalInfo: {
    ...defaultData.personalInfo,
    ...(resume.resume_data?.personalInfo || {}),
  },
});

export const buildPreviewResumeData = (resume: any) => ({
  id: resume.id,
  ...resume.resume_data,
  resumeTitle: resume.title,
});
