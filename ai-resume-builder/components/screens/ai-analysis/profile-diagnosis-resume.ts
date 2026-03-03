import type { ResumeData } from '../../../types';
import type { CareerProfile } from '../../../src/career-profile-utils';

const cleanText = (value: unknown, maxLen = 600): string =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);

const splitPeriod = (period: string) => {
  const source = cleanText(period, 80);
  if (!source) return { startDate: '', endDate: '' };
  const parts = source
    .split(/[-–—~至]/)
    .map((item) => cleanText(item, 40))
    .filter(Boolean);
  return {
    startDate: parts[0] || source,
    endDate: parts[1] || '',
  };
};

const uniq = (items: unknown[], maxItems = 40) => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const text = cleanText(item, 80);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= maxItems) break;
  }
  return out;
};

export const hasCareerProfileForDiagnosis = (profile: CareerProfile | null): boolean => {
  if (!profile) return false;
  const summary = cleanText(profile.summary, 400);
  const targetRole = cleanText(
    profile.targetRole ||
      profile.jobDirection ||
      profile.personalInfo?.title,
    120
  );
  const expCount = Array.isArray(profile.experiences) ? profile.experiences.length : 0;
  const skillCount = Array.isArray(profile.coreSkills) ? profile.coreSkills.length : 0;
  const highlightCount = Array.isArray(profile.careerHighlights) ? profile.careerHighlights.length : 0;
  const atomicCount = Array.isArray(profile.atomicTags) ? profile.atomicTags.length : 0;
  return Boolean(summary || targetRole || expCount || skillCount || highlightCount || atomicCount);
};

export const buildDiagnosisResumeFromProfile = ({
  profile,
  targetRole,
}: {
  profile: CareerProfile;
  targetRole?: string;
}): ResumeData => {
  const role = cleanText(
    targetRole ||
      profile.targetRole ||
      profile.jobDirection ||
      profile.personalInfo?.title,
    120
  );

  const workExps = (Array.isArray(profile.experiences) ? profile.experiences : [])
    .map((exp, index) => {
      const period = cleanText(exp.period, 80);
      const { startDate, endDate } = splitPeriod(period);
      const actions = cleanText(exp.actions, 1200);
      const results = cleanText(exp.results, 1200);
      const description = [actions, results ? `结果：${results}` : '']
        .filter(Boolean)
        .join('\n');
      return {
        id: index + 1,
        title: cleanText(exp.organization, 100),
        subtitle: cleanText(exp.title, 100),
        company: cleanText(exp.organization, 100),
        date: period,
        startDate,
        endDate,
        description,
      };
    })
    .filter((item) => item.title || item.subtitle || item.description);

  const projects = (Array.isArray(profile.projects) ? profile.projects : [])
    .map((project: any, index: number) => ({
      id: Number.isFinite(Number(project?.id)) ? Number(project.id) : index + 1,
      title: cleanText(project?.title, 100),
      subtitle: cleanText(project?.subtitle || project?.role, 100),
      date: cleanText(project?.period || project?.date, 80),
      description: cleanText(project?.description, 1500),
      link: cleanText(project?.link, 220),
    }))
    .filter((item) => item.title || item.description);

  const educations = (Array.isArray(profile.educations) ? profile.educations : [])
    .map((education: any, index: number) => ({
      id: Number.isFinite(Number(education?.id)) ? Number(education.id) : index + 1,
      title: cleanText(education?.school || education?.title, 120),
      school: cleanText(education?.school || education?.title, 120),
      subtitle: cleanText(education?.major || education?.subtitle, 100),
      degree: cleanText(education?.degree, 80),
      major: cleanText(education?.major || education?.subtitle, 100),
      date: cleanText(education?.period || education?.date, 80),
      description: cleanText(education?.description, 1000),
    }))
    .filter((item) => item.school || item.degree || item.major);

  const skillFromExperiences = (Array.isArray(profile.experiences) ? profile.experiences : [])
    .flatMap((item) => (Array.isArray(item.skills) ? item.skills : []));
  const skillFromAtomicTags = (Array.isArray(profile.atomicTags) ? profile.atomicTags : [])
    .filter((item) => String(item?.category || '').trim() === 'fact_skill')
    .map((item) => item?.text);
  const skills = uniq(
    [
      ...(Array.isArray(profile.coreSkills) ? profile.coreSkills : []),
      ...skillFromExperiences,
      ...skillFromAtomicTags,
    ],
    40
  );

  const summary = cleanText(profile.summary, 2000);
  return {
    personalInfo: {
      name: cleanText(profile.personalInfo?.name, 100),
      title: role,
      email: cleanText(profile.personalInfo?.email, 120),
      phone: cleanText(profile.personalInfo?.phone, 60),
      location: cleanText(profile.personalInfo?.location, 120),
      linkedin: cleanText(profile.personalInfo?.linkedin, 220),
      website: cleanText(profile.personalInfo?.website, 220),
    },
    workExps,
    educations,
    projects,
    skills,
    summary,
    targetRole: role,
  };
};
