import type { ResumeData } from '../../../types';
import type { Suggestion } from './types';

export const inferTargetSection = (raw: any): Suggestion['targetSection'] => {
  const field = (raw?.targetField || '').toString().toLowerCase();
  if (['email', 'phone', 'name', 'title', 'jobtitle', 'job_title', 'position', 'gender', 'location', 'age'].includes(field)) {
    return 'personalInfo';
  }
  if (['company', 'employer', 'organization', 'org', 'subtitle', 'role', 'description', 'startdate', 'enddate'].includes(field)) {
    return 'workExps';
  }
  if (['project', 'projects', 'link'].includes(field)) {
    return 'projects';
  }
  if (['degree', 'major', 'school', 'education', 'educations'].includes(field)) {
    return 'educations' as any;
  }
  if (['skills', 'skill'].includes(field)) {
    return 'skills';
  }
  if (['summary', 'profile'].includes(field)) {
    return 'summary';
  }
  return 'workExps';
};

export const normalizeTargetSection = (section: any): Suggestion['targetSection'] | '' => {
  const value = String(section || '').trim().toLowerCase();
  if (!value) return '';
  if (value === 'personalinfo' || value === 'personal_info' || value === 'personal') return 'personalInfo';
  if (value === 'workexps' || value === 'work_exp' || value === 'work' || value === 'experience') return 'workExps';
  if (value === 'skills' || value === 'skill') return 'skills';
  if (value === 'projects' || value === 'project') return 'projects';
  if (value === 'educations' || value === 'education' || value === 'edu') return 'educations';
  if (value === 'summary' || value === 'profile') return 'summary';
  return '';
};

export const getDisplayOriginalValue = (suggestion: Suggestion, resumeData: ResumeData) => {
  const section = normalizeTargetSection(suggestion.targetSection) || inferTargetSection(suggestion);
  const raw = suggestion.originalValue;
  if (raw === null || raw === undefined) return '';

  if (section === 'educations') {
    const text = String(raw).trim();
    const edu = (resumeData?.educations || []).find((e: any) =>
      typeof suggestion.targetId === 'number' ? e.id === suggestion.targetId : true
    );
    if (edu) {
      const school = (edu.school || edu.title || '').trim();
      const degree = (edu.degree || '').trim();
      const major = (edu.major || edu.subtitle || '').trim();
      const parts = [school, degree, major].filter(Boolean);
      const uniqueParts: string[] = [];
      const seen = new Set<string>();
      parts.forEach((p) => {
        const key = p.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        uniqueParts.push(p);
      });
      const composed = uniqueParts.join(' | ');
      if (composed) return composed;
    }

    const leftRight = text.split('@').map(s => s.trim()).filter(Boolean);
    if (leftRight.length === 2) {
      const left = Array.from(new Set(leftRight[0].split(/\s+/).filter(Boolean))).join(' ');
      return [left, leftRight[1]].filter(Boolean).join(' @ ');
    }

    const tokens = text.split(/\s+/).filter(Boolean);
    if (tokens.length > 1) {
      return Array.from(new Set(tokens)).join(' ');
    }
    return text;
  }

  if (Array.isArray(raw)) return raw.join('、');
  return String(raw);
};

export const getSuggestionModuleLabel = (suggestion: Suggestion, resumeData: ResumeData) => {
  const normalizeText = (value: any) =>
    String(value || '')
      .replace(/\s+/g, '')
      .trim();
  const buildNeedle = () =>
    normalizeText(
      [
        suggestion.originalValue,
        suggestion.reason,
        suggestion.title,
        typeof suggestion.suggestedValue === 'string' ? suggestion.suggestedValue : ''
      ].join(' ')
    );
  const scoreMatch = (needle: string, haystack: string) => {
    if (!needle || !haystack) return 0;
    let score = 0;
    const chunks = needle
      .split(/[，。；、,.;:\-_/|()\[\]{}]+/)
      .map(s => s.trim())
      .filter(s => s.length >= 4)
      .slice(0, 8);
    for (const c of chunks) {
      if (haystack.includes(c)) score += c.length;
    }
    if (needle.length >= 8 && haystack.includes(needle.slice(0, 8))) score += 8;
    return score;
  };

  const section = normalizeTargetSection(suggestion.targetSection) || suggestion.targetSection;
  if (section === 'personalInfo') return '个人信息';
  if (section === 'skills') return '技能';
  if (section === 'projects') {
    const projects = resumeData?.projects || [];
    const directMatch = typeof suggestion.targetId === 'number'
      ? projects.find(item => item.id === suggestion.targetId)
      : null;
    const smartMatch = (() => {
      const needle = buildNeedle();
      if (!needle) return null;
      let best: any = null;
      let bestScore = 0;
      for (const item of projects) {
        const haystack = normalizeText(`${item.title || ''}${item.subtitle || ''}${item.description || ''}`);
        const s = scoreMatch(needle, haystack);
        if (s > bestScore) {
          bestScore = s;
          best = item;
        }
      }
      return bestScore > 0 ? best : null;
    })();
    const match = directMatch || smartMatch || projects.find(item => (item.title || item.subtitle || '').trim());
    const label = (match?.title || match?.subtitle || '').trim();
    if (label) return label;
    return '项目经历';
  }
  if (section === 'summary') return '个人简介';
  if (section === 'workExps') {
    const exps = resumeData?.workExps || [];
    const directMatch = typeof suggestion.targetId === 'number'
      ? exps.find(item => item.id === suggestion.targetId)
      : null;
    const smartMatch = (() => {
      const needle = buildNeedle();
      if (!needle) return null;
      let best: any = null;
      let bestScore = 0;
      for (const item of exps) {
        const haystack = normalizeText(`${item.company || ''}${item.title || ''}${(item as any).position || ''}${item.subtitle || ''}${item.description || ''}`);
        const s = scoreMatch(needle, haystack);
        if (s > bestScore) {
          bestScore = s;
          best = item;
        }
      }
      return bestScore > 0 ? best : null;
    })();
    const match = directMatch || smartMatch || exps.find(item => (item.company || item.title || '').trim());
    const companyName = (match?.company || match?.title || '').trim();
    if (companyName) return companyName;
    return '工作经历';
  }
  if (section === 'educations') {
    const edus = resumeData?.educations || [];
    const match = typeof suggestion.targetId === 'number'
      ? edus.find(item => item.id === suggestion.targetId)
      : edus.find(item => (item.major || item.subtitle || item.school || item.title || '').trim());
    const majorLabel = (match?.major || match?.subtitle || '').trim();
    if (majorLabel) return majorLabel;
    const schoolLabel = (match?.school || match?.title || '').trim();
    if (schoolLabel) return schoolLabel;
    return '教育背景';
  }
  const eduHint = `${suggestion.title || ''}${suggestion.reason || ''}${suggestion.originalValue || ''}`;
  if (/(教育|专业|学历|学位|本科|硕士|博士)/.test(eduHint)) return '专业';
  return '简历';
};

export const applySuggestionFeedback = (
  items: Suggestion[],
  feedback?: Record<string, { rating?: 'up' | 'down' }>
) => {
  if (!feedback || Object.keys(feedback).length === 0) return items;
  return items.map((item) => {
    const entry = feedback[item.id];
    return entry?.rating ? { ...item, rating: entry.rating } : item;
  });
};

export const consolidateSkillSuggestions = (items: Suggestion[]) => {
  if (!Array.isArray(items) || items.length === 0) return [];

  const isSkillSuggestion = (item: Suggestion) => {
    const section = normalizeTargetSection(item.targetSection);
    const field = String(item.targetField || '').toLowerCase();
    return section === 'skills' || field === 'skills' || field === 'skill';
  };

  const skillIndices = items
    .map((item, idx) => ({ item, idx }))
    .filter(({ item }) => isSkillSuggestion(item));

  if (skillIndices.length <= 1) return items;

  const mergedReason = skillIndices
    .map(({ item }) => String(item.reason || '').trim())
    .filter(Boolean)
    .join('；');
  const mergedSuggestedSkills = skillIndices
    .flatMap(({ item }) => Array.isArray(item.suggestedValue) ? item.suggestedValue : [item.suggestedValue])
    .map((s) => String(s || '').trim())
    .filter(Boolean);
  const dedupedSkills = Array.from(new Set(mergedSuggestedSkills));

  const mergedOriginalSkills = skillIndices
    .flatMap(({ item }) => Array.isArray(item.originalValue) ? item.originalValue : [item.originalValue])
    .map((s) => String(s || '').trim())
    .filter(Boolean);
  const dedupedOriginal = Array.from(new Set(mergedOriginalSkills));

  const mergedStatus = skillIndices.some(({ item }) => item.status === 'accepted')
    ? 'accepted'
    : (skillIndices.some(({ item }) => item.status === 'ignored') ? 'ignored' : 'pending');
  const mergedRating = skillIndices.find(({ item }) => !!item.rating)?.item.rating;
  const firstSkill = skillIndices[0].item;

  const mergedSkillSuggestion: Suggestion = {
    ...firstSkill,
    reason: mergedReason || firstSkill.reason,
    targetSection: 'skills',
    targetField: 'skills',
    suggestedValue: dedupedSkills,
    originalValue: dedupedOriginal.join('、') || firstSkill.originalValue,
    status: mergedStatus as any,
    rating: mergedRating
  };

  const firstIdx = skillIndices[0].idx;
  const skillIndexSet = new Set(skillIndices.map(({ idx }) => idx));
  const result: Suggestion[] = [];
  items.forEach((item, idx) => {
    if (idx === firstIdx) {
      result.push(mergedSkillSuggestion);
      return;
    }
    if (skillIndexSet.has(idx)) return;
    result.push(item);
  });
  return result;
};
