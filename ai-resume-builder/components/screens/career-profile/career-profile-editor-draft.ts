import {
  projectCareerProfileFactDraftSections,
  type CareerProfileFactDraftSections,
} from '../../../src/career-profile-facts';
import type { CareerProfile } from '../../../src/career-profile-utils';
import type { Education, Project, ResumeData, WorkExperience } from '../../../types';
import {
  buildCareerProfileExperiencesFromWorkExps,
  composeExperienceDescription,
} from './profile-experience-mapper';
import type { ProfileExtrasDraft } from './summary-display-logic';

type EditorUserLike = {
  name?: string;
  email?: string;
  phone?: string;
} | null | undefined;

export type CareerProfileEditorProjection = {
  resumeData: ResumeData;
  extras: ProfileExtrasDraft;
};

const stripUnknown = (val: string | undefined | null) => {
  const str = String(val || '').trim();
  return str.toLowerCase() === 'unknown' ? '' : str;
};

const MBTI_TOKEN_RE = /(?:^|[^A-Z])(I|E)(N|S)(T|F)(J|P)(?:$|[^A-Z])/i;

const normalizeMbtiToken = (value: unknown): string => {
  const text = stripUnknown(String(value || '')).toUpperCase();
  if (!text) return '';
  const match = text.match(MBTI_TOKEN_RE);
  if (!match) return '';
  return `${match[1]}${match[2]}${match[3]}${match[4]}`;
};

const looksLikeMbtiOnlyText = (value: unknown): boolean => {
  const text = stripUnknown(String(value || ''));
  if (!text) return false;
  const compact = text.replace(/\s+/g, '').toUpperCase();
  if (/^(MBTI|人格|性格)[:：-]?[IESNTFJP]{4}$/.test(compact)) return true;
  if (/^[IESNTFJP]{4}$/.test(compact)) return true;
  return false;
};

const inferMbti = (...sources: unknown[]): string => {
  for (const source of sources) {
    if (Array.isArray(source)) {
      const nested = inferMbti(...source);
      if (nested) return nested;
      continue;
    }
    const normalized = normalizeMbtiToken(source);
    if (normalized) return normalized;
  }
  return '';
};

const listFromAtomicTags = (
  tags: unknown,
  category: string,
  maxItems = 30
): string[] => {
  if (!Array.isArray(tags)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of tags) {
    if (!item || typeof item !== 'object') continue;
    const cat = String((item as any).category || '').trim();
    if (cat !== category) continue;
    const text = stripUnknown((item as any).text);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= maxItems) break;
  }
  return out;
};

const firstFromAtomicTags = (tags: unknown, category: string): string =>
  listFromAtomicTags(tags, category, 1)[0] || '';

const hasManualAtomicEditsForCategory = (tags: unknown, category: string): boolean => {
  if (!Array.isArray(tags)) return false;
  return tags.some((item) => {
    if (!item || typeof item !== 'object') return false;
    const cat = String((item as any).category || '').trim();
    if (cat !== category) return false;
    const sourcePaths = Array.isArray((item as any).sourcePaths) ? (item as any).sourcePaths : [];
    return sourcePaths.some((entry: unknown) => String(entry || '').trim() === `atomicTags.${category}`);
  });
};

const IDENTITY_FIELD_PREFIX_RE =
  /^(姓名|name|邮箱|email|电话|phone|手机|mobile|城市|所在地|location|linkedin|网站|网址|website)\s*[:：-]\s*/i;

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const URL_RE = /(?:https?:\/\/[^\s]+)|(?:www\.[^\s]+)/i;
const PHONE_RE = /\+?\d[\d\s\-()]{6,}\d/;

const normalizeUrl = (value: string): string => {
  const text = stripUnknown(value);
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) return text;
  if (/^www\./i.test(text)) return `https://${text}`;
  return text;
};

const cleanIdentityEntry = (value: string): string =>
  stripUnknown(value).replace(IDENTITY_FIELD_PREFIX_RE, '').trim();

const looksLikeLocationText = (value: string): boolean =>
  /(省|市|区|县|州|自治区|特别行政区|city|province|district|county)/i.test(value);

const resolveIdentityFromAtomicTags = (items: string[]) => {
  let name = '';
  let email = '';
  let phone = '';
  let location = '';
  let linkedin = '';
  let website = '';
  const candidates: string[] = [];

  for (const raw of items) {
    const text = cleanIdentityEntry(raw);
    if (!text) continue;

    const emailMatch = text.match(EMAIL_RE);
    if (!email && emailMatch?.[0]) {
      email = stripUnknown(emailMatch[0]).toLowerCase();
      continue;
    }

    const urlMatch = text.match(URL_RE);
    if (urlMatch?.[0]) {
      const url = normalizeUrl(urlMatch[0]);
      if (!url) continue;
      if (!linkedin && /linkedin\.com/i.test(url)) {
        linkedin = url;
      } else if (!website) {
        website = url;
      }
      continue;
    }

    const phoneMatch = text.match(PHONE_RE);
    if (!phone && phoneMatch?.[0]) {
      const compact = phoneMatch[0].replace(/[^\d+]/g, '');
      if (compact.length >= 7) {
        phone = compact;
        continue;
      }
    }

    if (!location && looksLikeLocationText(text) && text.length <= 40) {
      location = text;
      continue;
    }

    candidates.push(text);
  }

  if (!name) {
    const hit = candidates.find((entry) => {
      if (!entry) return false;
      if (entry.length > 40) return false;
      if (entry.includes('@')) return false;
      if (/[\\/@]/.test(entry)) return false;
      if (/[0-9]{5,}/.test(entry)) return false;
      return true;
    });
    if (hit) name = hit;
  }

  return {
    name: stripUnknown(name),
    email: stripUnknown(email),
    phone: stripUnknown(phone),
    location: stripUnknown(location),
    linkedin: stripUnknown(linkedin),
    website: stripUnknown(website),
  };
};

const toNumericId = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const mapExperiencesToWorkExps = (profile: CareerProfile): WorkExperience[] =>
  (profile.experiences || []).map((exp, idx) => ({
    id: idx + 1,
    title: stripUnknown(exp.organization),
    subtitle: stripUnknown(exp.title),
    date: stripUnknown(exp.period),
    startDate: stripUnknown(exp.period?.split('-')[0]) || stripUnknown(exp.period),
    endDate: stripUnknown(exp.period?.split('-')[1]),
    description: composeExperienceDescription(stripUnknown(exp.actions), stripUnknown(exp.results)),
    company: stripUnknown(exp.organization),
  }));

const mapProjectsToEditor = (projects: unknown): Project[] =>
  (Array.isArray(projects) ? projects : []).map((item: any, idx) => ({
    id: toNumericId(item?.id, idx + 1),
    title: stripUnknown(item?.title),
    subtitle: stripUnknown(item?.subtitle),
    date: stripUnknown(item?.period || item?.date),
    description: stripUnknown(item?.description),
    link: stripUnknown(item?.link),
  }));

const mapEducationsToEditor = (educations: unknown): Education[] =>
  (Array.isArray(educations) ? educations : []).map((item: any, idx) => ({
    id: toNumericId(item?.id, idx + 1),
    title: stripUnknown(item?.title || item?.school),
    school: stripUnknown(item?.school),
    degree: stripUnknown(item?.degree),
    major: stripUnknown(item?.major),
    subtitle: stripUnknown(item?.subtitle || item?.major),
    date: stripUnknown(item?.period || item?.date),
    period: stripUnknown(item?.period || item?.date),
    description: stripUnknown(item?.description),
  }));

const cloneExperience = (item: any) => ({
  title: stripUnknown(item?.title),
  period: stripUnknown(item?.period),
  organization: stripUnknown(item?.organization),
  actions: stripUnknown(item?.actions),
  results: stripUnknown(item?.results),
  skills: Array.isArray(item?.skills) ? [...item.skills] : [],
  inResume: item?.inResume || 'unknown',
  confidence: item?.confidence || 'medium',
  evidence: stripUnknown(item?.evidence),
});

const cloneEducation = (item: any, idx: number) => ({
  ...item,
  id: toNumericId(item?.id, idx + 1),
  school: stripUnknown(item?.school),
  degree: stripUnknown(item?.degree),
  major: stripUnknown(item?.major),
  period: stripUnknown(item?.period),
  description: stripUnknown(item?.description),
  title: stripUnknown(item?.title || item?.school),
});

const cloneProject = (item: any, idx: number) => ({
  ...item,
  id: toNumericId(item?.id, idx + 1),
  title: stripUnknown(item?.title),
  subtitle: stripUnknown(item?.subtitle),
  period: stripUnknown(item?.period),
  description: stripUnknown(item?.description),
  link: stripUnknown(item?.link),
});

const mapAtomicExperienceFactsToExperiences = (items: string[]) =>
  items.map((text) => ({
    title: '',
    period: '',
    organization: stripUnknown(text),
    actions: '',
    results: '',
    skills: [],
    inResume: 'unknown' as const,
    confidence: 'medium' as const,
    evidence: '来自用户编辑的核心事实标签',
  }));

const mapAtomicProjectFactsToProjects = (items: string[]) =>
  items.map((text, idx) => ({
    id: idx + 1,
    title: stripUnknown(text),
    subtitle: '',
    period: '',
    description: '',
    link: '',
  }));

const mapAtomicEducationFactsToEducations = (items: string[]) =>
  items.map((text, idx) => ({
    id: idx + 1,
    title: stripUnknown(text),
    school: stripUnknown(text),
    degree: '',
    major: '',
    period: '',
    description: '',
  }));

export const createCareerProfileEditorDraft = (
  profile: CareerProfile | null,
  user: EditorUserLike
): CareerProfile | null => {
  if (!profile) return null;
  const atomicTags = Array.isArray(profile.atomicTags) ? profile.atomicTags : [];
  const useAtomicManualSource = Boolean((profile as any).atomicTagsManualOverride) && atomicTags.length > 0;
  const atomicSummary = useAtomicManualSource ? firstFromAtomicTags(atomicTags, 'summary') : '';
  const atomicIntent = useAtomicManualSource ? firstFromAtomicTags(atomicTags, 'intent') : '';
  const atomicIdentity = useAtomicManualSource ? listFromAtomicTags(atomicTags, 'identity', 20) : [];
  const atomicIdentityResolved = useAtomicManualSource
    ? resolveIdentityFromAtomicTags(atomicIdentity)
    : {
        name: '',
        email: '',
        phone: '',
        location: '',
        linkedin: '',
        website: '',
      };
  const atomicCoreSkills = useAtomicManualSource ? listFromAtomicTags(atomicTags, 'fact_skill', 30) : [];
  const atomicHighlights = useAtomicManualSource ? listFromAtomicTags(atomicTags, 'fact_highlight', 20) : [];
  const atomicConstraints = useAtomicManualSource ? listFromAtomicTags(atomicTags, 'fact_constraint', 20) : [];
  const atomicExperienceFacts = useAtomicManualSource ? listFromAtomicTags(atomicTags, 'experience', 30) : [];
  const fallbackConstraints = Array.isArray(profile.constraints) ? profile.constraints : [];
  const resolvedMbti =
    stripUnknown(profile.mbti) ||
    inferMbti(
      profile.mbti,
      profile.summary,
      profile.personality,
      profile.workStyle,
      profile.careerGoal,
      atomicConstraints,
      fallbackConstraints
    );
  const atomicProjectFacts = useAtomicManualSource ? listFromAtomicTags(atomicTags, 'project', 20) : [];
  const atomicEducationFacts = useAtomicManualSource ? listFromAtomicTags(atomicTags, 'education', 20) : [];
  const shouldUseAtomicExperienceFacts =
    useAtomicManualSource &&
    atomicExperienceFacts.length > 0 &&
    hasManualAtomicEditsForCategory(atomicTags, 'experience');
  const shouldUseAtomicProjectFacts =
    useAtomicManualSource &&
    atomicProjectFacts.length > 0 &&
    hasManualAtomicEditsForCategory(atomicTags, 'project');
  const shouldUseAtomicEducationFacts =
    useAtomicManualSource &&
    atomicEducationFacts.length > 0 &&
    hasManualAtomicEditsForCategory(atomicTags, 'education');
  const fallbackName = stripUnknown(String(user?.name || user?.email || '').split('@')[0]);
  const existingEmail = stripUnknown(profile.personalInfo?.email) || stripUnknown(user?.email);
  const existingName = stripUnknown(profile.personalInfo?.name);
  const emailPrefix = stripUnknown(existingEmail.split('@')[0]).toLowerCase();
  const existingLooksLikeEmailPrefix =
    Boolean(existingName) &&
    Boolean(emailPrefix) &&
    existingName.toLowerCase() === emailPrefix;
  const personalInfo = {
    ...(profile.personalInfo || {}),
    name:
      stripUnknown(atomicIdentityResolved.name) ||
      (existingLooksLikeEmailPrefix ? '' : existingName) ||
      fallbackName,
    email: stripUnknown(atomicIdentityResolved.email) || existingEmail,
    phone:
      stripUnknown(atomicIdentityResolved.phone) ||
      stripUnknown(profile.personalInfo?.phone) ||
      stripUnknown(user?.phone),
    title:
      stripUnknown(atomicIntent) ||
      stripUnknown(profile.personalInfo?.title) ||
      stripUnknown(profile.targetRole) ||
      stripUnknown(profile.jobDirection),
    location: stripUnknown(atomicIdentityResolved.location) || stripUnknown(profile.personalInfo?.location),
    linkedin: stripUnknown(atomicIdentityResolved.linkedin) || stripUnknown(profile.personalInfo?.linkedin),
    website: stripUnknown(atomicIdentityResolved.website) || stripUnknown(profile.personalInfo?.website),
  };
  return {
    ...profile,
    summary: stripUnknown(atomicSummary) || stripUnknown(profile.summary),
    personalInfo,
    experiences: shouldUseAtomicExperienceFacts
      ? mapAtomicExperienceFactsToExperiences(atomicExperienceFacts)
      : (profile.experiences || []).map(cloneExperience),
    educations: shouldUseAtomicEducationFacts
      ? mapAtomicEducationFactsToEducations(atomicEducationFacts)
      : (profile.educations || []).map(cloneEducation),
    projects: shouldUseAtomicProjectFacts
      ? mapAtomicProjectFactsToProjects(atomicProjectFacts)
      : (profile.projects || []).map(cloneProject),
    coreSkills:
      useAtomicManualSource && atomicCoreSkills.length > 0
        ? atomicCoreSkills
        : Array.isArray(profile.coreSkills)
          ? [...profile.coreSkills]
          : [],
    careerHighlights:
      useAtomicManualSource && atomicHighlights.length > 0
        ? atomicHighlights
        : Array.isArray(profile.careerHighlights)
          ? [...profile.careerHighlights]
          : [],
    mbti: resolvedMbti,
    constraints:
      (useAtomicManualSource && atomicConstraints.length > 0
        ? atomicConstraints
        : Array.isArray(profile.constraints)
          ? [...profile.constraints]
          : [])
        .map((item) => stripUnknown(item))
        .filter(Boolean)
        .filter((item) => !looksLikeMbtiOnlyText(item)),
    targetRole: stripUnknown(atomicIntent) || stripUnknown(profile.targetRole) || stripUnknown(profile.jobDirection),
    jobDirection: stripUnknown(atomicIntent) || stripUnknown(profile.jobDirection) || stripUnknown(profile.targetRole),
    factItems: Array.isArray(profile.factItems) ? profile.factItems.map((item) => ({ ...item })) : [],
    atomicTags: atomicTags.map((item) => ({ ...item })),
  };
};

export const projectCareerProfileEditorData = (
  draft: CareerProfile | null,
  factDraft: CareerProfileFactDraftSections
): CareerProfileEditorProjection => {
  if (!draft) {
    return {
      resumeData: {
        personalInfo: { name: '', title: '', email: '', phone: '' },
        workExps: [],
        educations: [],
        projects: [],
        skills: [],
        summary: '',
      },
      extras: {},
    };
  }
  const factSections = projectCareerProfileFactDraftSections(factDraft);
  return {
    resumeData: {
      personalInfo: {
        name: stripUnknown(draft.personalInfo?.name),
        title:
          stripUnknown(draft.personalInfo?.title) ||
          stripUnknown(draft.targetRole) ||
          stripUnknown(draft.jobDirection),
        email: stripUnknown(draft.personalInfo?.email),
        phone: stripUnknown(draft.personalInfo?.phone),
        location: stripUnknown(draft.personalInfo?.location),
        linkedin: stripUnknown(draft.personalInfo?.linkedin),
        website: stripUnknown(draft.personalInfo?.website),
        age: stripUnknown((draft.personalInfo as any)?.age),
      },
      gender: stripUnknown((draft as any)?.gender || (draft.personalInfo as any)?.gender),
      workExps: mapExperiencesToWorkExps(draft),
      educations: mapEducationsToEditor(draft.educations),
      projects: mapProjectsToEditor(draft.projects),
      skills: factSections.coreSkills,
      summary: stripUnknown(draft.summary),
    },
    extras: {
      mbti: stripUnknown(draft.mbti),
      personality: stripUnknown(draft.personality),
      workStyle: stripUnknown(draft.workStyle),
      careerGoal: stripUnknown(draft.careerGoal),
      targetRole: stripUnknown(draft.targetRole || draft.jobDirection),
      jobDirection: stripUnknown(draft.targetRole || draft.jobDirection),
      targetSalary: stripUnknown(draft.targetSalary),
      careerHighlights: factSections.careerHighlights,
      constraints: factSections.constraints,
    },
  };
};

export const patchDraftWorkExps = (
  draft: CareerProfile,
  patcher: (items: WorkExperience[]) => WorkExperience[]
): CareerProfile => {
  const current = mapExperiencesToWorkExps(draft);
  const nextWorkExps = patcher(current);
  const nextExperiences = buildCareerProfileExperiencesFromWorkExps(nextWorkExps, draft.experiences || []);
  return {
    ...draft,
    experiences: nextExperiences,
  };
};

export const patchDraftProjects = (
  draft: CareerProfile,
  patcher: (items: Project[]) => Project[]
): CareerProfile => {
  const current = mapProjectsToEditor(draft.projects);
  const next = patcher(current);
  const fallbackById = new Map<number, any>();
  (Array.isArray(draft.projects) ? draft.projects : []).forEach((item: any, idx) => {
    fallbackById.set(toNumericId(item?.id, idx + 1), item);
  });
  return {
    ...draft,
    projects: next.map((item, idx) => {
      const id = toNumericId(item.id, idx + 1);
      const fallback = fallbackById.get(id) || {};
      return {
        ...fallback,
        id,
        title: stripUnknown(item.title),
        subtitle: stripUnknown(item.subtitle),
        period: stripUnknown(item.date),
        description: stripUnknown(item.description),
        link: stripUnknown(item.link),
      };
    }),
  };
};

export const patchDraftEducations = (
  draft: CareerProfile,
  patcher: (items: Education[]) => Education[]
): CareerProfile => {
  const current = mapEducationsToEditor(draft.educations);
  const next = patcher(current);
  const fallbackById = new Map<number, any>();
  (Array.isArray(draft.educations) ? draft.educations : []).forEach((item: any, idx) => {
    fallbackById.set(toNumericId(item?.id, idx + 1), item);
  });
  return {
    ...draft,
    educations: next.map((item, idx) => {
      const id = toNumericId(item.id, idx + 1);
      const fallback = fallbackById.get(id) || {};
      return {
        ...fallback,
        id,
        title: stripUnknown(item.title || item.school),
        school: stripUnknown(item.title || item.school),
        degree: stripUnknown(item.degree),
        major: stripUnknown(item.major || item.subtitle),
        period: stripUnknown(item.date),
        description: stripUnknown(item.description),
      };
    }),
  };
};
