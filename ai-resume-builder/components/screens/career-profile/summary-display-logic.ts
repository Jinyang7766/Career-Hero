import type { ResumeData, WorkExperience, Project, Education } from '../../../types';

export type ProfileExtrasDraft = {
  targetRole?: string;
  mbti?: string;
  personality?: string;
  workStyle?: string;
  careerGoal?: string;
  jobDirection?: string;
  targetSalary?: string;
  careerHighlights?: string[];
  constraints?: string[];
};

export type SummaryInfoRow = {
  label: string;
  value: string;
};

export type CareerProfileSummaryDisplayModel = {
  basicInfoRows: SummaryInfoRow[];
  summary: string;
  preferenceRows: SummaryInfoRow[];
  highlights: string[];
  constraints: string[];
  skills: string[];
  workExps: WorkExperience[];
  projects: Project[];
  educations: Education[];
};

const toText = (value: unknown): string => String(value || '').trim();

const isUnknownLike = (value: string): boolean =>
  /^(?:unknown|n\/?a|none|null|nil|未(?:知|填写)|无|暂无|不详|-+)$/i.test(String(value || '').trim());

const hasCjk = (value: string): boolean => /[\u3400-\u9fff]/.test(value);

const normalizeTextKey = (value: unknown): string =>
  toText(value)
    .toLowerCase()
    .replace(/[，,。.!！？?;；:：、"'`~@#$%^&*+=<>《》()（）[\]{}【】|\\/\-_]/g, '')
    .replace(/\s+/g, '');

const normalizeConceptKey = (value: unknown): string =>
  normalizeTextKey(value)
    .replace(/^\d+(年|月|天|个?月|k|w|万|元)?/g, '')
    .replace(/(经验|背景|业务|能力|方向|岗位|工作|经历|管理|特征|偏好|目标|领域|转型|模块|相关|方面)/g, '');

const containsByMinLength = (candidate: string, carrier: string): boolean => {
  const minLen = hasCjk(candidate) ? 2 : 4;
  if (!candidate || candidate.length < minLen) return false;
  return carrier.includes(candidate);
};

const hasSemanticOverlap = (left: unknown, right: unknown): boolean => {
  const leftRaw = normalizeTextKey(left);
  const rightRaw = normalizeTextKey(right);
  if (!leftRaw || !rightRaw) return false;
  if (leftRaw === rightRaw) return true;
  if (containsByMinLength(leftRaw, rightRaw) || containsByMinLength(rightRaw, leftRaw)) {
    return true;
  }

  const leftConcept = normalizeConceptKey(left);
  const rightConcept = normalizeConceptKey(right);
  if (!leftConcept || !rightConcept) return false;
  if (leftConcept === rightConcept) return true;
  return containsByMinLength(leftConcept, rightConcept) || containsByMinLength(rightConcept, leftConcept);
};

const hasDirectOverlap = (left: unknown, right: unknown): boolean => {
  const leftRaw = normalizeTextKey(left);
  const rightRaw = normalizeTextKey(right);
  if (!leftRaw || !rightRaw) return false;
  if (leftRaw === rightRaw) return true;
  return containsByMinLength(leftRaw, rightRaw) || containsByMinLength(rightRaw, leftRaw);
};

const dedupeStringList = (items: unknown[]): string[] => {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const text = toText(item);
    if (!text) continue;
    const key = normalizeTextKey(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
};

const isCoveredBySummary = (text: string, summaryKey: string): boolean => {
  if (!summaryKey) return false;
  return hasSemanticOverlap(text, summaryKey);
};

const dedupeBySignature = <T>(
  items: T[],
  buildParts: (item: T) => unknown[],
  crossSeen?: Set<string>
): T[] => {
  const output: T[] = [];
  const localSeen = new Set<string>();
  for (const item of items) {
    const signature = normalizeTextKey(buildParts(item).join('|'));
    if (!signature) continue;
    if (localSeen.has(signature)) continue;
    if (crossSeen?.has(signature)) continue;
    localSeen.add(signature);
    crossSeen?.add(signature);
    output.push(item);
  }
  return output;
};

const toGenderLabel = (value: string | undefined): string => {
  const raw = toText(value).toLowerCase();
  if (raw === 'male') return '男';
  if (raw === 'female') return '女';
  return '';
};

const appendRow = (
  rows: SummaryInfoRow[],
  seenValues: Set<string>,
  label: string,
  value: unknown
) => {
  const text = toText(value);
  if (!text || isUnknownLike(text)) return;
  const key = normalizeTextKey(text);
  if (!key || seenValues.has(key)) return;
  seenValues.add(key);
  rows.push({ label, value: text });
};

export const buildCareerProfileSummaryDisplayModel = (
  resumeData: ResumeData,
  extras: ProfileExtrasDraft
): CareerProfileSummaryDisplayModel => {
  const summary = toText(resumeData.summary);
  const summaryKey = summary;
  const careerIntent = toText(extras.targetRole || extras.jobDirection || resumeData.personalInfo.title);

  const basicInfoRows: SummaryInfoRow[] = [];
  const basicInfoSeen = new Set<string>();
  appendRow(basicInfoRows, basicInfoSeen, '姓名', resumeData.personalInfo.name);
  appendRow(basicInfoRows, basicInfoSeen, '求职意向', careerIntent);
  appendRow(basicInfoRows, basicInfoSeen, '目标薪资', extras.targetSalary);
  appendRow(basicInfoRows, basicInfoSeen, '性别', toGenderLabel(resumeData.gender));
  appendRow(basicInfoRows, basicInfoSeen, '年龄', resumeData.personalInfo.age);
  appendRow(basicInfoRows, basicInfoSeen, '所在城市', resumeData.personalInfo.location);
  appendRow(basicInfoRows, basicInfoSeen, '邮箱', resumeData.personalInfo.email);
  appendRow(basicInfoRows, basicInfoSeen, '电话', resumeData.personalInfo.phone);
  appendRow(basicInfoRows, basicInfoSeen, 'LinkedIn', resumeData.personalInfo.linkedin);
  appendRow(basicInfoRows, basicInfoSeen, '个人网址', resumeData.personalInfo.website);

  const preferenceRows: SummaryInfoRow[] = [];
  const preferenceSeen = new Set<string>();
  const careerGoal = toText(extras.careerGoal);
  const personality = toText(extras.personality);
  const workStyle = toText(extras.workStyle);
  const mbti = toText(extras.mbti);
  if (careerGoal && !isCoveredBySummary(careerGoal, summaryKey)) {
    appendRow(preferenceRows, preferenceSeen, '职业目标', careerGoal);
  }
  if (mbti) {
    appendRow(preferenceRows, preferenceSeen, 'MBTI', mbti);
  }
  if (personality && !isCoveredBySummary(personality, summaryKey)) {
    appendRow(preferenceRows, preferenceSeen, '性格特征', personality);
  }
  if (workStyle && !isCoveredBySummary(workStyle, summaryKey)) {
    appendRow(preferenceRows, preferenceSeen, '工作方式偏好', workStyle);
  }

  const highlights = dedupeStringList(Array.isArray(extras.careerHighlights) ? extras.careerHighlights : []).filter(
    (item) => !isCoveredBySummary(item, summaryKey)
  );
  const constraints = dedupeStringList(Array.isArray(extras.constraints) ? extras.constraints : []).filter(
    (item) => !isCoveredBySummary(item, summaryKey)
  );
  const skills = dedupeStringList(Array.isArray(resumeData.skills) ? resumeData.skills : []).filter((skill) => {
    if (isCoveredBySummary(skill, summaryKey)) return false;
    return !highlights.some((item) => hasDirectOverlap(skill, item));
  });

  const workExps = dedupeBySignature(
    Array.isArray(resumeData.workExps) ? resumeData.workExps : [],
    (item) => [item.title, item.subtitle, item.date, item.description]
  );

  const crossSeen = new Set<string>();
  for (const item of workExps) {
    const signature = normalizeTextKey([item.title, item.subtitle, item.date, item.description].join('|'));
    if (signature) crossSeen.add(signature);
  }

  const projects = dedupeBySignature(
    Array.isArray(resumeData.projects) ? resumeData.projects : [],
    (item) => [item.title, item.subtitle, item.date, item.description],
    crossSeen
  );

  const educations = dedupeBySignature(
    Array.isArray(resumeData.educations) ? resumeData.educations : [],
    (item) => [item.title, item.school, item.subtitle, item.degree, item.major, item.date, item.description]
  );

  return {
    basicInfoRows,
    summary,
    preferenceRows,
    highlights,
    constraints,
    skills,
    workExps,
    projects,
    educations,
  };
};
