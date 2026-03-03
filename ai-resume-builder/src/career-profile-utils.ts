import {
  buildCareerProfileAtomicTags,
  reconcileCareerProfileFactSections,
  type CareerProfileAtomicTag,
  type CareerProfileFactItem,
} from './career-profile-facts';

export type CareerProfileExperience = {
  title: string;
  period: string;
  organization: string;
  actions: string;
  results: string;
  skills: string[];
  inResume: 'yes' | 'no' | 'unknown';
  confidence: 'high' | 'medium' | 'low';
  evidence: string;
};

export type CareerProfile = {
  id: string;
  createdAt: string;
  source: string;
  summary: string;
  careerHighlights: string[];
  coreSkills: string[];
  constraints: string[];
  factItems?: CareerProfileFactItem[];
  atomicTags?: CareerProfileAtomicTag[];
  atomicTagsManualOverride?: boolean;
  mbti?: string;
  personality?: string;
  workStyle?: string;
  careerGoal?: string;
  targetRole?: string;
  jobDirection?: string;
  targetSalary?: string;
  experiences: CareerProfileExperience[];
  educations?: any[];
  projects?: any[];
  personalInfo?: {
    name?: string;
    title?: string;
    email?: string;
    phone?: string;
    location?: string;
    linkedin?: string;
    website?: string;
  };
  rawInput?: string;
};

const isUnknownLike = (value: string): boolean =>
  /^(?:unknown|n\/?a|none|null|nil|未(?:知|填写)|无|暂无|不详|-+)$/i.test(String(value || '').trim());

const compactText = (value: unknown, maxLen = 300) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text || isUnknownLike(text)) return '';
  return text.slice(0, maxLen);
};

const ATOMIC_TAG_CATEGORIES: CareerProfileAtomicTag['category'][] = [
  'identity',
  'intent',
  'preference',
  'summary',
  'fact_skill',
  'fact_highlight',
  'fact_constraint',
  'experience',
  'project',
  'education',
];

const ATOMIC_TAG_CATEGORY_SET = new Set<CareerProfileAtomicTag['category']>(ATOMIC_TAG_CATEGORIES);

const normalizeAtomicTagKey = (value: unknown): string =>
  compactText(value, 260)
    .toLowerCase()
    .replace(/[，,。.!！？?;；:：、"'`~@#$%^&*+=<>《》()（）[\]{}【】|\\/\-_]/g, '')
    .replace(/\s+/g, '');

const isAtomicTagCategory = (value: unknown): value is CareerProfileAtomicTag['category'] =>
  ATOMIC_TAG_CATEGORY_SET.has(String(value || '').trim() as CareerProfileAtomicTag['category']);

const normalizeAtomicTags = (value: unknown): CareerProfileAtomicTag[] => {
  if (!Array.isArray(value)) return [];
  const out: CareerProfileAtomicTag[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const rawCategory = String((item as any).category || '').trim();
    if (!isAtomicTagCategory(rawCategory)) continue;
    const category = rawCategory as CareerProfileAtomicTag['category'];
    const text = compactText((item as any).text, 260);
    if (!text) continue;
    const key = normalizeAtomicTagKey((item as any).key || text);
    if (!key) continue;
    const dedupeKey = `${category}:${key}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const aliasSet = new Set<CareerProfileAtomicTag['category']>();
    if (Array.isArray((item as any).aliases)) {
      for (const alias of (item as any).aliases) {
        const aliasText = String(alias || '').trim();
        if (!isAtomicTagCategory(aliasText)) continue;
        if (aliasText === category) continue;
        aliasSet.add(aliasText as CareerProfileAtomicTag['category']);
      }
    }

    const sourcePathSet = new Set<string>();
    if (Array.isArray((item as any).sourcePaths)) {
      for (const sourcePath of (item as any).sourcePaths) {
        const path = compactText(sourcePath, 160);
        if (!path) continue;
        sourcePathSet.add(path);
      }
    }

    out.push({
      id: compactText((item as any).id || `atomic_${out.length + 1}_${key}`, 100),
      category,
      text,
      key,
      label: compactText((item as any).label, 80),
      sourcePaths: Array.from(sourcePathSet),
      aliases: Array.from(aliasSet),
    });
    if (out.length >= 400) break;
  }
  return out;
};

const mergeAtomicTagsPreferManual = (
  manual: CareerProfileAtomicTag[],
  generated: CareerProfileAtomicTag[]
): CareerProfileAtomicTag[] => {
  const out: CareerProfileAtomicTag[] = [];
  const seen = new Set<string>();
  for (const item of [...manual, ...generated]) {
    const category = item.category;
    if (!isAtomicTagCategory(category)) continue;
    const text = compactText(item.text, 260);
    const key = normalizeAtomicTagKey(item.key || text);
    if (!text || !key) continue;
    const dedupeKey = `${category}:${key}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push({
      ...item,
      category,
      text,
      key,
      id: compactText(item.id || `atomic_${out.length + 1}_${key}`, 100),
      label: compactText(item.label, 80),
      sourcePaths: Array.isArray(item.sourcePaths)
        ? item.sourcePaths.map((entry) => compactText(entry, 160)).filter(Boolean)
        : [],
      aliases: Array.isArray(item.aliases)
        ? item.aliases
            .map((entry) => String(entry || '').trim())
            .filter((entry): entry is CareerProfileAtomicTag['category'] => isAtomicTagCategory(entry) && entry !== category)
        : [],
    });
    if (out.length >= 400) break;
  }
  return out;
};

export const resolveCareerProfileTargetRole = (
  profileLike: Partial<CareerProfile> | Record<string, any> | null | undefined
): string => {
  if (!profileLike || typeof profileLike !== 'object') return '';
  const raw = profileLike as any;
  const nested = raw.personalInfo && typeof raw.personalInfo === 'object' ? raw.personalInfo : {};
  return compactText(
    raw.targetRole ||
    raw.jobDirection ||
    raw.jobTarget ||
    nested.targetRole ||
    nested.title ||
    raw.title,
    120
  );
};

const normalizeStringList = (value: unknown, maxItems = 20, maxLen = 80): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const text = compactText(item, maxLen);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= maxItems) break;
  }
  return out;
};

const normalizeExperience = (item: any, fallbackIndex: number): CareerProfileExperience | null => {
  if (!item || typeof item !== 'object') return null;
  const title = compactText(item.title || item.name || `经历${fallbackIndex}`, 80);
  if (!title) return null;
  const inResumeRaw = String(item.inResume || item.isInResume || '').trim().toLowerCase();
  const confidenceRaw = String(item.confidence || '').trim().toLowerCase();
  const inResume: CareerProfileExperience['inResume'] =
    inResumeRaw === 'yes' || inResumeRaw === 'no' || inResumeRaw === 'unknown'
      ? (inResumeRaw as CareerProfileExperience['inResume'])
      : 'unknown';
  const confidence: CareerProfileExperience['confidence'] =
    confidenceRaw === 'high' || confidenceRaw === 'medium' || confidenceRaw === 'low'
      ? (confidenceRaw as CareerProfileExperience['confidence'])
      : 'medium';

  return {
    title,
    period: compactText(item.period, 80),
    organization: compactText(item.organization || item.company, 100),
    actions: compactText(item.actions || item.action, 400),
    results: compactText(item.results || item.result, 400),
    skills: normalizeStringList(item.skills, 12, 40),
    inResume,
    confidence,
    evidence: compactText(item.evidence || '来自用户自述', 120),
  };
};

const pickPersonalText = (maxLen: number, ...candidates: unknown[]): string => {
  for (const item of candidates) {
    const text = compactText(item, maxLen);
    if (text) return text;
  }
  return '';
};

const normalizePersonalInfo = (raw: any): CareerProfile['personalInfo'] | undefined => {
  if (!raw || typeof raw !== 'object') return undefined;
  const nested = raw.personalInfo && typeof raw.personalInfo === 'object' ? raw.personalInfo : {};

  const personalInfo: CareerProfile['personalInfo'] = {
    name: pickPersonalText(100, nested.name, raw.name, raw.userName, raw.user_name, raw.candidateName, raw.candidate_name, raw.fullName, raw.full_name),
    title: pickPersonalText(100, nested.title, raw.title, raw.targetRole, raw.jobTarget, raw.jobDirection, raw.position, raw.role),
    email: pickPersonalText(100, nested.email, raw.email, raw.contactEmail, raw.contact_email),
    phone: pickPersonalText(100, nested.phone, raw.phone, raw.mobile, raw.tel),
    location: pickPersonalText(100, nested.location, raw.location, raw.city),
    linkedin: pickPersonalText(160, nested.linkedin, raw.linkedin),
    website: pickPersonalText(200, nested.website, raw.website, raw.portfolio, raw.portfolioUrl),
  };

  if (!Object.values(personalInfo).some(Boolean)) return undefined;
  return personalInfo;
};

export const normalizeCareerProfile = (raw: any): CareerProfile | null => {
  if (!raw || typeof raw !== 'object') return null;
  const experiencesRaw = Array.isArray(raw.experiences) ? raw.experiences : (Array.isArray(raw.careerFacts) ? raw.careerFacts : []);
  const experiences: CareerProfileExperience[] = [];
  experiencesRaw.forEach((item, index) => {
    const normalized = normalizeExperience(item, index + 1);
    if (normalized) experiences.push(normalized);
  });

  const educationsRaw = Array.isArray(raw.educations) ? raw.educations : [];
  const educations = educationsRaw.slice(0, 5).map((e, idx) => ({
    id: e.id || idx + 1,
    school: compactText(e.school || e.university, 100),
    degree: compactText(e.degree, 100),
    major: compactText(e.major, 100),
    period: compactText(e.period || e.date, 80),
    description: compactText(e.description, 400),
  })).filter(e => e.school);

  const projectsRaw = Array.isArray(raw.projects) ? raw.projects : [];
  const projects = projectsRaw.slice(0, 10).map((p, idx) => ({
    id: p.id || idx + 1,
    title: compactText(p.title || p.name, 100),
    subtitle: compactText(p.subtitle || p.role, 100),
    period: compactText(p.period || p.date, 80),
    description: compactText(p.description, 1000),
    link: compactText(p.link, 200),
  })).filter(p => p.title);

  const summary = compactText(raw.summary || raw.profileSummary || raw.careerSummary, 260);
  if (!summary && !experiences.length) return null;
  const targetRole = resolveCareerProfileTargetRole(raw);
  const jobDirection = compactText(raw.jobDirection || raw.targetRole || raw.jobTarget, 120) || targetRole;
  const factItemsRaw = Array.isArray(raw.factItems) ? raw.factItems : [];
  const fallbackFactSkills = factItemsRaw
    .filter((item: any) => String(item?.kind || '').trim() === 'skill')
    .map((item: any) => item?.text);
  const fallbackFactHighlights = factItemsRaw
    .filter((item: any) => String(item?.kind || '').trim() === 'highlight')
    .map((item: any) => item?.text);
  const fallbackFactConstraints = factItemsRaw
    .filter((item: any) => String(item?.kind || '').trim() === 'constraint')
    .map((item: any) => item?.text);
  const factSections = reconcileCareerProfileFactSections({
    careerHighlights:
      raw.careerHighlights || raw.highlights || (fallbackFactHighlights.length > 0 ? fallbackFactHighlights : []),
    coreSkills:
      raw.coreSkills || raw.skills || (fallbackFactSkills.length > 0 ? fallbackFactSkills : []),
    constraints:
      raw.constraints || raw.hardConstraints || (fallbackFactConstraints.length > 0 ? fallbackFactConstraints : []),
  });

  const mbti = compactText(raw.mbti || raw.personalityProfile?.mbti, 40);
  const personality = compactText(raw.personality || raw.personalityProfile?.traits, 400);
  const workStyle = compactText(raw.workStyle || raw.personalityProfile?.workStyle, 400);
  const careerGoal = compactText(raw.careerGoal || raw.goal || raw.careerDirection, 220);
  const targetSalary = compactText(raw.targetSalary || raw.salaryExpectation || raw.expectedSalary, 120);
  const personalInfo = normalizePersonalInfo(raw);
  const normalizedExperiences = experiences.slice(0, 12);
  const generatedAtomicTags = buildCareerProfileAtomicTags({
    summary,
    coreSkills: factSections.coreSkills,
    careerHighlights: factSections.careerHighlights,
    constraints: factSections.constraints,
    factItems: factSections.factItems,
    mbti,
    personality,
    workStyle,
    careerGoal,
    targetRole,
    jobDirection,
    targetSalary,
    personalInfo,
    gender: raw.gender || raw?.personalInfo?.gender,
    experiences: normalizedExperiences,
    educations,
    projects,
  });
  const manualAtomicTags = normalizeAtomicTags(raw.atomicTags);
  const shouldUseManualAtomicTags =
    Boolean((raw as any)?.atomicTagsManualOverride) &&
    manualAtomicTags.length > 0;
  const atomicTags = shouldUseManualAtomicTags
    ? manualAtomicTags
    : mergeAtomicTagsPreferManual(manualAtomicTags, generatedAtomicTags);

  return {
    id: compactText(raw.id || `career_profile_${Date.now()}`, 80),
    createdAt: compactText(raw.createdAt || new Date().toISOString(), 80),
    source: compactText(raw.source || 'manual_self_report', 60),
    summary,
    careerHighlights: factSections.careerHighlights,
    coreSkills: factSections.coreSkills,
    constraints: factSections.constraints,
    factItems: factSections.factItems,
    atomicTags,
    atomicTagsManualOverride: shouldUseManualAtomicTags,
    mbti,
    personality,
    workStyle,
    careerGoal,
    targetRole,
    jobDirection,
    targetSalary,
    experiences: normalizedExperiences,
    educations,
    projects,
    personalInfo,
    rawInput: compactText(raw.rawInput, 2000),
  };
};

export const getLatestCareerProfile = (userProfile: any): CareerProfile | null => {
  return normalizeCareerProfile(userProfile?.career_profile_latest || null);
};

export const buildCareerProfileFingerprint = (profile: CareerProfile | null): string => {
  if (!profile) return 'no_profile';
  const targetRole = resolveCareerProfileTargetRole(profile);
  const source = JSON.stringify({
    summary: profile.summary,
    highlights: profile.careerHighlights,
    skills: profile.coreSkills,
    constraints: profile.constraints,
    factItems: profile.factItems || [],
    atomicTags: profile.atomicTags || [],
    mbti: profile.mbti || '',
    personality: profile.personality || '',
    workStyle: profile.workStyle || '',
    careerGoal: profile.careerGoal || '',
    targetRole,
    jobDirection: profile.jobDirection || '',
    targetSalary: profile.targetSalary || '',
    experiences: profile.experiences.map((x) => ({
      title: x.title,
      period: x.period,
      organization: x.organization,
      actions: x.actions,
      results: x.results,
      inResume: x.inResume,
      confidence: x.confidence,
    })),
    educations: profile.educations?.map(e => ({ school: e.school, degree: e.degree })),
    projects: profile.projects?.map(p => ({ title: p.title })),
    personalInfo: profile.personalInfo,
  });
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) {
    hash = (hash * 31 + source.charCodeAt(i)) >>> 0;
  }
  return `${source.length}_${hash.toString(16)}`;
};
