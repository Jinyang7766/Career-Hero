import type { ResumeData } from '../../../types';
import {
  buildCareerProfileFollowupPrompts,
  type FollowupPrompt,
} from './profile-followup-prompts';

type ImportedResume = Omit<ResumeData, 'id'>;

export interface DynamicFollowupContext {
  importedResume: ImportedResume | null;
  supplementText: string;
}

const normalize = (value: unknown): string =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const hasAny = (value: unknown[] | undefined | null): boolean =>
  Array.isArray(value) && value.length > 0;

const hasPattern = (text: string, pattern: RegExp): boolean => pattern.test(text);

export const buildDynamicFollowupPrompts = (
  context: DynamicFollowupContext
): FollowupPrompt[] => {
  const resume = context.importedResume || null;
  const basePrompts = buildCareerProfileFollowupPrompts(resume);

  const blob = normalize(context.supplementText);

  const hasWorkSignals =
    hasAny((resume as any)?.workExps) ||
    hasPattern(blob, /(工作|任职|公司|职责|经验|岗位|实习)/i);
  const hasProjectSignals =
    hasAny((resume as any)?.projects) || hasPattern(blob, /(项目|落地|上线|需求|迭代)/i);
  const hasSkillSignals =
    hasAny((resume as any)?.skills) || hasPattern(blob, /(技能|技术栈|语言|框架|工具)/i);
  const hasEducationSignals =
    hasAny((resume as any)?.educations) || hasPattern(blob, /(学历|学校|专业|教育|证书)/i);
  const hasQuantifiedSignals = hasPattern(
    blob,
    /(\d+[%万千百]?|提升|增长|下降|节省|转化率|roi|gmv|留存|营收|效率)/i
  );
  const hasLeadershipSignals = hasPattern(
    blob,
    /(带领|管理|协作|跨部门|推进|owner|负责人|主导|协调)/i
  );
  const hasMbtiSignals = hasPattern(blob, /\b[ei][ns][ft][jp]\b/i);
  const hasWorkStyleSignals =
    hasPattern(blob, /(工作方式|团队|协作|沟通|节奏|管理风格|独立负责)/i);
  const hasCareerGoalSignals =
    hasPattern(blob, /(职业目标|发展方向|求职方向|目标岗位|目标薪资|薪资)/i);
  const hasEnoughNarrative = normalize(context.supplementText).length >= 180;

  return basePrompts.filter((prompt) => {
    switch (prompt.id) {
      case 'work_exp':
        return !hasWorkSignals;
      case 'projects':
        return !hasProjectSignals;
      case 'skills':
        return !hasSkillSignals;
      case 'education':
        return !hasEducationSignals;
      case 'quantify':
        return !hasQuantifiedSignals;
      case 'leadership':
        return !hasLeadershipSignals;
      case 'mbti':
        return !hasMbtiSignals;
      case 'work_style':
        return !hasWorkStyleSignals;
      case 'career_goal':
        return !hasCareerGoalSignals;
      case 'job_target':
        return !hasCareerGoalSignals;
      case 'missing_facts':
        return !hasEnoughNarrative;
      default:
        return true;
    }
  });
};
