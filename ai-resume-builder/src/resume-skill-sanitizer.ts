import { toSkillListForImport } from './skill-utils';

export const DEFAULT_SKILL_LIMIT = 10;
const MIN_SKILL_LIMIT = 8;
const MAX_SKILL_LIMIT = 12;

const NOISE_SKILLS = new Set([
  '技能', '专业技能', '核心技能', '能力', '经验', '项目', '流程',
  '策略', '方案', '协同', '沟通', '管理', '运营', '分析', '执行',
]);

const TECH_HINT_RE = /(sql|python|java|javascript|typescript|excel|power\s*bi|tableau|ga4|seo|sem|a\/?b\s*test|ab\s*test|llm|rag|agent|docker|k8s|linux|redis|mysql|postgres|spark|hive|erp|crm|wms|sap|etl|spss|sas|vba|figma|chatgpt|gemini|claude|deepseek|qwen|证书|认证|资格证)/i;

const normalizeKey = (value: string) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s，,。.;；:：\-—_()（）\[\]【】'"`]/g, '');

const toTokenSet = (value: string) =>
  new Set(
    String(value || '')
      .toLowerCase()
      .match(/[a-z0-9+#]+/g) || []
  );

const isApproxDuplicate = (left: string, right: string) => {
  const leftKey = normalizeKey(left);
  const rightKey = normalizeKey(right);
  if (!leftKey || !rightKey) return false;
  if (leftKey === rightKey) return true;

  if (Math.min(leftKey.length, rightKey.length) >= 4 && (leftKey.includes(rightKey) || rightKey.includes(leftKey))) {
    return true;
  }

  const leftTokens = toTokenSet(left);
  const rightTokens = toTokenSet(right);
  if (leftTokens.size > 0 && rightTokens.size > 0) {
    const leftInRight = [...leftTokens].every((token) => rightTokens.has(token));
    const rightInLeft = [...rightTokens].every((token) => leftTokens.has(token));
    if (leftInRight || rightInLeft) return true;
  }

  return false;
};

const isValidSkill = (value: string) => {
  const text = String(value || '').trim();
  if (!text) return false;
  if (text.length < 2 || text.length > 36) return false;
  if (NOISE_SKILLS.has(text)) return false;
  if (!TECH_HINT_RE.test(text) && /^[\u4e00-\u9fa5]{2,8}$/.test(text) && /(能力|经验|运营|管理|流程|协同)$/.test(text)) {
    return false;
  }
  return true;
};

const coerceLimit = (limit?: number) => {
  if (!Number.isFinite(limit as number)) return DEFAULT_SKILL_LIMIT;
  return Math.max(MIN_SKILL_LIMIT, Math.min(MAX_SKILL_LIMIT, Math.round(limit as number)));
};

export const sanitizeSkillList = (value: any, options?: { limit?: number }) => {
  const limit = coerceLimit(options?.limit);
  const normalized = toSkillListForImport(value).filter(isValidSkill);

  const deduped: string[] = [];
  for (const skill of normalized) {
    if (deduped.some((existing) => isApproxDuplicate(existing, skill))) continue;
    deduped.push(skill);
    if (deduped.length >= limit) break;
  }

  return deduped;
};

export const sanitizeResumeSkills = <T extends Record<string, any>>(resumeData: T, options?: { limit?: number }): T => {
  if (!resumeData || typeof resumeData !== 'object') return resumeData;
  return {
    ...resumeData,
    skills: sanitizeSkillList((resumeData as any).skills || [], options),
  } as T;
};
