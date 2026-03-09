import type { ResumeData } from '../../../types';
import type { CareerProfile } from '../../../src/career-profile-utils';
import {
  buildCareerProfileFollowupPrompts,
  type FollowupPrompt,
} from './profile-followup-prompts';

type ImportedResume = Omit<ResumeData, 'id'>;

export interface DynamicFollowupContext {
  importedResume: ImportedResume | null;
  supplementText: string;
  existingProfile?: CareerProfile | null;
  isFirstBuild?: boolean;
}

type FollowupPresenceSignals = {
  workExp: boolean;
  projects: boolean;
  skills: boolean;
  education: boolean;
  quantified: boolean;
  leadership: boolean;
  mbti: boolean;
  workStyle: boolean;
  careerGoal: boolean;
  jobTarget: boolean;
  enoughNarrative: boolean;
};

const normalize = (value: unknown): string =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const normalizeText = (value: unknown): string =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

const hasAny = (value: unknown[] | undefined | null): boolean =>
  Array.isArray(value) && value.length > 0;

const hasPattern = (text: string, pattern: RegExp): boolean => pattern.test(text);

const MBTI_TOKEN_RE = /(?:^|[^A-Z])(I|E)(N|S)(T|F)(J|P)(?:$|[^A-Z])/i;

const extractMbtiToken = (value: unknown): string => {
  const text = normalizeText(value).toUpperCase();
  if (!text) return '';
  const match = text.match(MBTI_TOKEN_RE);
  if (!match) return '';
  return `${match[1]}${match[2]}${match[3]}${match[4]}`;
};

const getAtomicTags = (profile: CareerProfile): Array<Record<string, any>> =>
  Array.isArray(profile.atomicTags) ? (profile.atomicTags as Array<Record<string, any>>) : [];

const collectAtomicTagTexts = (profile: CareerProfile): string[] => {
  const tags = getAtomicTags(profile);
  const out: string[] = [];

  tags.forEach((tag) => {
    const text = normalizeText(tag?.text);
    const key = normalizeText(tag?.key);
    const label = normalizeText(tag?.label);
    if (text) out.push(text);
    if (key && key !== text) out.push(key);
    if (label && label !== text && label !== key) out.push(label);
  });

  return out;
};

const hasAtomicTagByCategory = (profile: CareerProfile, category: string): boolean => {
  const tags = getAtomicTags(profile);
  return tags.some((tag) => normalizeText(tag?.category).toLowerCase() === category.toLowerCase());
};

const hasAtomicTagBySourcePath = (profile: CareerProfile, pathPattern: RegExp): boolean => {
  const tags = getAtomicTags(profile);
  return tags.some((tag) => {
    const sourcePaths = Array.isArray(tag?.sourcePaths) ? tag.sourcePaths : [];
    return sourcePaths.some((entry: unknown) => pathPattern.test(normalizeText(entry)));
  });
};

const buildProfileSemanticBlob = (profile: CareerProfile): string => {
  const constraints = Array.isArray(profile.constraints) ? profile.constraints : [];
  const coreSkills = Array.isArray(profile.coreSkills) ? profile.coreSkills : [];

  return normalize([
    profile.summary,
    profile.personality,
    profile.workStyle,
    profile.careerGoal,
    profile.targetRole,
    (profile as any).jobDirection,
    profile.personalInfo?.title,
    ...constraints,
    ...coreSkills,
    ...collectAtomicTagTexts(profile),
  ].join(' '));
};

const hasMbtiInAtomicTags = (profile: CareerProfile): boolean => {
  const tags = getAtomicTags(profile);
  return tags.some((tag) => {
    if (extractMbtiToken(tag?.text)) return true;
    if (extractMbtiToken(tag?.key)) return true;
    if (extractMbtiToken(tag?.label)) return true;

    const sourcePaths = Array.isArray(tag?.sourcePaths)
      ? tag.sourcePaths.map((entry: unknown) => normalizeText(entry).toLowerCase())
      : [];
    const fromMbtiPath = sourcePaths.some((path: string) => /(^|\.|\[)mbti(\.|\[|$)/i.test(path));
    if (!fromMbtiPath) return false;

    return Boolean(normalizeText(tag?.text) || normalizeText(tag?.key));
  });
};

const hasMbtiProfileSignal = (profile: CareerProfile): boolean => {
  if (normalizeText(profile.mbti)) return true;

  const semanticSources: unknown[] = [
    profile.personality,
    profile.summary,
    ...(Array.isArray(profile.constraints) ? profile.constraints : []),
  ];

  if (semanticSources.some((source) => Boolean(extractMbtiToken(source)))) {
    return true;
  }

  return hasMbtiInAtomicTags(profile);
};

const hasCoreSkillsProfileSignal = (profile: CareerProfile): boolean => {
  if (hasAny(profile.coreSkills)) return true;
  if (hasAtomicTagByCategory(profile, 'fact_skill')) return true;
  if (hasAtomicTagBySourcePath(profile, /(^|\.|\[)coreSkills(\.|\[|$)/i)) return true;

  const blob = buildProfileSemanticBlob(profile);
  return /(技能|技术栈|skill|擅长|熟练|精通|掌握|sql|python|java(script)?|typescript|react|vue|node)/i.test(blob);
};

const hasWorkStyleProfileSignal = (profile: CareerProfile): boolean => {
  if (Boolean(normalizeText(profile.workStyle))) return true;
  if (hasAtomicTagBySourcePath(profile, /(^|\.|\[)workStyle(\.|\[|$)/i)) return true;

  const blob = buildProfileSemanticBlob(profile);
  return /(工作方式|团队文化|协作方式|沟通(?:风格|方式)?|工作节奏|远程|弹性办公|独立负责|高协作|work\s*style|协作偏好)/i.test(blob);
};

const hasCareerGoalProfileSignal = (profile: CareerProfile): boolean => {
  if (Boolean(normalizeText(profile.careerGoal))) return true;
  if (hasAtomicTagBySourcePath(profile, /(^|\.|\[)careerGoal(\.|\[|$)/i)) return true;

  const blob = buildProfileSemanticBlob(profile);
  return /(职业目标|发展方向|求职方向|长期目标|短期目标|职业规划|赛道|career\s*goal)/i.test(blob);
};

const hasJobTargetProfileSignal = (profile: CareerProfile): boolean => {
  if (Boolean(normalizeText(profile.targetRole))) return true;
  if (Boolean(normalizeText((profile as any).jobDirection))) return true;
  if (Boolean(normalizeText(profile.personalInfo?.title))) return true;
  if (hasAtomicTagByCategory(profile, 'intent')) return true;
  if (hasAtomicTagBySourcePath(profile, /(^|\.|\[)(targetRole|jobDirection|personalInfo\.title)(\.|\[|$)/i)) return true;

  const blob = buildProfileSemanticBlob(profile);
  return /(目标岗位|求职方向|应聘岗位|岗位方向|target\s*role|job\s*target)/i.test(blob);
};

const buildFirstBuildSignals = (
  resume: ImportedResume | null,
  supplementText: string,
  blob: string
): FollowupPresenceSignals => {
  const hasCareerGoalSignals = hasPattern(
    blob,
    /(职业目标|发展方向|求职方向|目标岗位|目标薪资|薪资)/i
  );

  return {
    workExp:
      hasAny((resume as any)?.workExps) ||
      hasPattern(blob, /(工作|任职|公司|职责|经验|岗位|实习)/i),
    projects:
      hasAny((resume as any)?.projects) ||
      hasPattern(blob, /(项目|落地|上线|需求|迭代)/i),
    skills:
      hasAny((resume as any)?.skills) ||
      hasPattern(blob, /(技能|技术栈|语言|框架|工具)/i),
    education:
      hasAny((resume as any)?.educations) ||
      hasPattern(blob, /(学历|学校|专业|教育|证书)/i),
    quantified: hasPattern(
      blob,
      /(\d+[%万千百]?|提升|增长|下降|节省|转化率|roi|gmv|留存|营收|效率)/i
    ),
    leadership: hasPattern(
      blob,
      /(带领|管理|协作|跨部门|推进|owner|负责人|主导|协调)/i
    ),
    mbti: hasPattern(blob, /\b[ei][ns][ft][jp]\b/i),
    workStyle: hasPattern(blob, /(工作方式|团队|协作|沟通|节奏|管理风格|独立负责)/i),
    careerGoal: hasCareerGoalSignals,
    jobTarget: hasCareerGoalSignals,
    enoughNarrative: normalize(supplementText).length >= 180,
  };
};

const buildSubsequentSignals = (profile: CareerProfile): FollowupPresenceSignals => {
  const fullExperienceText = (profile.experiences || [])
    .map((e) => `${e.actions} ${e.results}`)
    .join(' ');

  return {
    workExp: hasAny(profile.experiences),
    projects: hasAny(profile.projects),
    skills: hasCoreSkillsProfileSignal(profile),
    education: hasAny(profile.educations),
    quantified: /(\d+[%万千百]?|提升|增长|下降|节省|转化率|roi|gmv|留存|营收|效率)/i.test(fullExperienceText),
    leadership: /(带领|管理|协作|跨部门|推进|owner|负责人|主导|协调)/i.test(fullExperienceText),
    mbti: hasMbtiProfileSignal(profile),
    workStyle: hasWorkStyleProfileSignal(profile),
    careerGoal: hasCareerGoalProfileSignal(profile),
    jobTarget: hasJobTargetProfileSignal(profile),
    enoughNarrative: (profile.summary || '').length >= 180,
  };
};

const isPromptMissingBySignals = (promptId: string, signals: FollowupPresenceSignals): boolean => {
  switch (promptId) {
    case 'work_exp':
      return !signals.workExp;
    case 'projects':
      return !signals.projects;
    case 'skills':
      return !signals.skills;
    case 'education':
      return !signals.education;
    case 'quantify':
      return !signals.quantified;
    case 'leadership':
      return !signals.leadership;
    case 'mbti':
      return !signals.mbti;
    case 'work_style':
      return !signals.workStyle;
    case 'career_goal':
      return !signals.careerGoal;
    case 'job_target':
      return !signals.jobTarget;
    case 'missing_facts':
      return !signals.enoughNarrative;
    default:
      return true;
  }
};

export const buildDynamicFollowupPrompts = (
  context: DynamicFollowupContext
): FollowupPrompt[] => {
  const resume = context.importedResume || null;
  const basePrompts = buildCareerProfileFollowupPrompts(resume);
  const profile = context.existingProfile || null;
  const isFirstBuild = context.isFirstBuild ?? !profile;

  const blob = normalize(context.supplementText);

  if (isFirstBuild) {
    const signals = buildFirstBuildSignals(resume, context.supplementText, blob);
    return basePrompts.filter((prompt) => isPromptMissingBySignals(prompt.id, signals));
  }

  if (!profile) return basePrompts;

  const signals = buildSubsequentSignals(profile);
  return basePrompts.filter((prompt) => isPromptMissingBySignals(prompt.id, signals));
};
