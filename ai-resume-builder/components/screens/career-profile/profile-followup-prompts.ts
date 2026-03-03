import type { ResumeData } from '../../../types';

type ImportedResume = Omit<ResumeData, 'id'>;

export type PromptCategory = 'experience' | 'skills_education' | 'personality' | 'others';

export interface FollowupPrompt {
  id: string;
  category: PromptCategory;
  text: string;
}

const nonEmpty = (value: unknown): string =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeItems = (value: unknown): any[] => (Array.isArray(value) ? value : []);

const hasQuantifiedSignals = (text: string): boolean => {
  const content = nonEmpty(text);
  if (!content) return false;
  return /(\d+[%万千百]?|提升|增长|下降|节省|转化率|roi|gmv|留存|营收)/i.test(content);
};

const hasLeadershipSignals = (text: string): boolean => {
  const content = nonEmpty(text);
  if (!content) return false;
  return /(带领|管理|协作|跨部门|推进|owner|负责人|主导)/i.test(content);
};

export const buildCareerProfileFollowupPrompts = (
  importedResume: ImportedResume | null | undefined
): FollowupPrompt[] => {
  const prompts: FollowupPrompt[] = [];

  const resume = importedResume || ({} as ImportedResume);
  const workExps = normalizeItems((resume as any).workExps);
  const projects = normalizeItems((resume as any).projects);
  const educations = normalizeItems((resume as any).educations);
  const skills = normalizeItems((resume as any).skills)
    .map((item) => nonEmpty(item))
    .filter(Boolean);

  const workText = workExps
    .map((item) => [item?.title, item?.subtitle, item?.description, item?.results].map(nonEmpty).join(' '))
    .join(' ');
  const projectText = projects
    .map((item) => [item?.title, item?.subtitle, item?.description].map(nonEmpty).join(' '))
    .join(' ');
  const summaryText = [resume?.summary, (resume as any)?.personalInfo?.summary].map(nonEmpty).join(' ');
  const fullText = [workText, projectText, summaryText].join(' ');

  // Category 1: Experience & Results
  if (!workExps.length) {
    prompts.push({ id: 'work_exp', category: 'experience', text: '你最近 2-3 段核心工作经历分别是什么？每段请补充职责、动作和结果。' });
  }
  if (!hasQuantifiedSignals(fullText)) {
    prompts.push({ id: 'quantify', category: 'experience', text: '请补充可量化成果：比如增长率、效率提升、成本下降、收入贡献或影响范围。' });
  }
  if (!hasLeadershipSignals(fullText)) {
    prompts.push({ id: 'leadership', category: 'experience', text: '你是否有带团队、跨部门协作或推动关键项目落地的经历？请补充场景和结果。' });
  }
  if (!projects.length) {
    prompts.push({ id: 'projects', category: 'experience', text: '简历里未体现项目闭环，请补充 1-2 个代表性项目（目标、动作、结果、复盘）。' });
  }

  // Category 2: Skills & Education
  if (!skills.length) {
    prompts.push({ id: 'skills', category: 'skills_education', text: '请补充你的核心技能栈和熟练度，并说明哪些技能最能支持目标岗位。' });
  }
  if (!educations.length) {
    prompts.push({ id: 'education', category: 'skills_education', text: '请补充教育背景、证书或训练经历，尤其是与你目标岗位强相关的部分。' });
  }

  // Category 3: Personality & Work Style
  prompts.push({ id: 'mbti', category: 'personality', text: '你的 MBTI 或性格倾向是什么？这些特质如何体现在真实工作中？' });
  prompts.push({ id: 'work_style', category: 'personality', text: '你更偏好的工作方式和团队文化是什么？哪些场景能让你发挥最佳状态？' });

  // Category 4: Others & Goals
  prompts.push({ id: 'career_goal', category: 'others', text: '你未来 1-2 年的职业目标是什么？希望补强哪些能力或赛道经验？' });
  prompts.push({ id: 'job_target', category: 'others', text: '请补充你的目标岗位/求职方向和目标薪资区间（可写预期范围）。' });
  prompts.push({ id: 'missing_facts', category: 'others', text: '还有哪些“简历没写但很重要”的经历、作品、失败复盘或个人优势？' });

  // Deduplicate by text
  const deduped: FollowupPrompt[] = [];
  const seenText = new Set<string>();

  for (const prompt of prompts) {
    const text = nonEmpty(prompt.text);
    if (!text) continue;
    if (seenText.has(text)) continue;
    seenText.add(text);
    deduped.push({ ...prompt, text });
  }

  return deduped.slice(0, 12);
};
