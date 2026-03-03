import type { ResumeData } from '../../../types';

type ImportedResume = Omit<ResumeData, 'id'>;

const cleanText = (value: any, maxLen = 220): string =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);

const formatDate = (value: any, startDate?: any, endDate?: any): string => {
  const date = cleanText(value, 80);
  const start = cleanText(startDate, 40);
  const end = cleanText(endDate, 40);
  if (date) return date;
  if (start && end) return `${start} - ${end}`;
  return start || end || '';
};

const summarizeCollection = (
  title: string,
  rows: string[],
  maxItems = 4
): string[] => {
  const items = rows.filter(Boolean).slice(0, maxItems);
  if (!items.length) return [];
  return [title, ...items.map((row, idx) => `${idx + 1}. ${row}`)];
};

export const buildCareerProfileSeedFromImportedResume = (
  importedResume: ImportedResume
): string => {
  if (!importedResume || typeof importedResume !== 'object') return '';

  const out: string[] = [];
  const personalInfo = importedResume.personalInfo || ({} as any);

  const baseInfo = [
    cleanText(personalInfo.name, 60),
    cleanText(personalInfo.title, 80),
    cleanText(personalInfo.location, 80),
  ].filter(Boolean);
  if (baseInfo.length) {
    out.push(`候选人基础信息：${baseInfo.join(' / ')}`);
  }

  const summary = cleanText(importedResume.summary || personalInfo.summary, 500);
  if (summary) {
    out.push(`简历自述：${summary}`);
  }

  const workRows = Array.isArray(importedResume.workExps)
    ? importedResume.workExps.map((item: any) => {
        const company = cleanText(item.company || item.title, 120);
        const role = cleanText(item.subtitle || item.position || item.title, 120);
        const date = formatDate(item.date, item.startDate, item.endDate);
        const description = cleanText(item.description, 360);
        const head = [company, role].filter(Boolean).join(' - ');
        const withDate = [head, date ? `(${date})` : ''].filter(Boolean).join(' ');
        if (!withDate && !description) return '';
        if (!description) return withDate;
        return `${withDate}。主要内容：${description}`.trim();
      })
    : [];
  out.push(...summarizeCollection('工作经历：', workRows, 5));

  const educationRows = Array.isArray(importedResume.educations)
    ? importedResume.educations.map((item: any) => {
        const school = cleanText(item.school || item.title, 120);
        const major = cleanText(item.major || item.subtitle, 120);
        const degree = cleanText(item.degree, 80);
        const date = formatDate(item.date, item.startDate, item.endDate);
        return [school, major, degree, date ? `(${date})` : ''].filter(Boolean).join(' / ');
      })
    : [];
  out.push(...summarizeCollection('教育经历：', educationRows, 3));

  const projectRows = Array.isArray(importedResume.projects)
    ? importedResume.projects.map((item: any) => {
        const name = cleanText(item.title, 120);
        const role = cleanText(item.subtitle || item.role, 120);
        const date = formatDate(item.date, item.startDate, item.endDate);
        const description = cleanText(item.description, 280);
        const head = [name, role, date ? `(${date})` : ''].filter(Boolean).join(' / ');
        if (!head && !description) return '';
        if (!description) return head;
        return `${head}：${description}`.trim();
      })
    : [];
  out.push(...summarizeCollection('项目经历：', projectRows, 4));

  const skills = Array.isArray(importedResume.skills)
    ? importedResume.skills
        .map((item) => cleanText(item, 50))
        .filter(Boolean)
        .slice(0, 18)
    : [];
  if (skills.length) {
    out.push(`技能关键词：${skills.join('、')}`);
  }

  if (!out.length) return '';
  return `${out.join('\n')}\n\n请基于以上简历信息继续追问我未写清楚的经历细节，并整理成职业画像。`.slice(
    0,
    5000
  );
};

