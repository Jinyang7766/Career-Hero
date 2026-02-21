import type { ResumeData } from '../../../types';
import type { Suggestion } from './types';

type Params = {
  base: ResumeData;
  suggestion: Suggestion;
  normalizeTargetSection: (section: any) => Suggestion['targetSection'] | '';
  inferTargetSection: (raw: any) => Suggestion['targetSection'];
  sanitizeSuggestedValue: (value: any, targetSection?: string) => any;
  toSkillList: (value: any) => string[];
};

const normalizeFieldForSection = (section: Suggestion['targetSection'], field?: string) => {
  if (!field) return field;
  const key = field.trim();
  if (!key) return field;
  const lowerKey = key.toLowerCase();
  if (section === 'personalInfo') {
    if (['jobTitle', 'job_title', 'position', 'targetTitle', 'title'].includes(key)) {
      return 'title';
    }
    return key;
  }
  if (section === 'workExps') {
    if (['position', 'jobTitle', 'job_title', 'role', 'subtitle'].includes(key)) {
      return 'subtitle';
    }
    if (['company', 'employer', 'organization', 'org', 'title'].includes(key)) {
      return 'company';
    }
    // Most LLM suggestion fields for experiences should end up in description text.
    if (
      [
        'description', 'content', 'responsibility', 'responsibilities', 'achievement', 'achievements',
        'result', 'results', 'impact', 'highlights', 'detail', 'details', 'bullet', 'bullets',
        'task', 'tasks', 'action', 'actions', 'summary'
      ].includes(lowerKey)
    ) {
      return 'description';
    }
    if (['date', 'startDate', 'endDate'].includes(key)) return key;
    // Unknown workExp fields are rendered nowhere in UI; map to description to avoid silent no-op edits.
    return 'description';
  }
  if (section === 'projects') {
    if (['role', 'position', 'jobTitle', 'job_title', 'subtitle'].includes(key)) {
      return 'subtitle';
    }
    if (
      [
        'description', 'content', 'responsibility', 'responsibilities', 'achievement', 'achievements',
        'result', 'results', 'impact', 'highlights', 'detail', 'details', 'bullet', 'bullets',
        'task', 'tasks', 'action', 'actions', 'summary'
      ].includes(lowerKey)
    ) {
      return 'description';
    }
    if (['title', 'date', 'link'].includes(lowerKey)) return key;
    return 'description';
  }
  if (section === 'educations') {
    if (['school', 'university', 'college', 'title'].includes(key)) {
      return 'school';
    }
    if (['major', 'specialty', 'discipline', 'subtitle'].includes(key)) {
      return 'major';
    }
    if (['degree', 'educationLevel'].includes(key)) {
      return 'degree';
    }
    if (['description', 'content', 'summary', 'highlights'].includes(lowerKey)) return 'major';
    return key;
  }
  return key;
};

const looksLikeTemplatePlaceholder = (text: string) => {
  const raw = String(text || '').trim();
  if (!raw) return true;
  const placeholderPattern = /(?:【[^】]*(?:具体|关键|量化|任务|方法|结果|示例|待补充|xx|xxx)[^】]*】|\[[^\]]*(?:具体|关键|量化|任务|方法|结果|示例|待补充|xx|xxx)[^\]]*\]|(?:^|[^a-zA-Z])(?:XX%|XXX|xxx|待补充|请填写|可替换)(?:$|[^a-zA-Z]))/i;
  if (placeholderPattern.test(raw)) return true;
  const sentenceParts = (raw.match(/[^。！？!?；;]+[。！？!?；;]?/g) || [])
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentenceParts.length >= 3) {
    const normalized = sentenceParts.map((s) => s.replace(/\s+/g, '').toLowerCase());
    const uniqueCount = new Set(normalized).size;
    if (uniqueCount <= Math.ceil(sentenceParts.length / 2)) return true;
  }
  return false;
};

export const applySuggestionToResume = ({
  base,
  suggestion,
  normalizeTargetSection,
  inferTargetSection,
  sanitizeSuggestedValue,
  toSkillList,
}: Params): ResumeData => {
  const newData = { ...base };
  const effectiveSection =
    normalizeTargetSection(suggestion.targetSection) ||
    inferTargetSection(suggestion);
  const normalizedField = normalizeFieldForSection(effectiveSection, suggestion.targetField);
  const normalizeForMatch = (v: any) =>
    String(v ?? '')
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[，,。.;；:：\-—_()（）\[\]【】'"`]/g, '');
  const suggestionNeedle = (() => {
    if (typeof suggestion.originalValue === 'string') return normalizeForMatch(suggestion.originalValue);
    if (Array.isArray(suggestion.originalValue as any)) {
      return normalizeForMatch((suggestion.originalValue as any[]).join(' '));
    }
    if (suggestion.originalValue && typeof suggestion.originalValue === 'object') {
      return normalizeForMatch(JSON.stringify(suggestion.originalValue));
    }
    return '';
  })();
  const targetIdStr = suggestion.targetId === undefined || suggestion.targetId === null
    ? ''
    : String(suggestion.targetId);
  const findBestTargetIndex = (items: any[], fieldFallback: string) => {
    if (!Array.isArray(items) || items.length === 0) return -1;
    if (targetIdStr) {
      const idIndex = items.findIndex((item: any) => String(item?.id ?? '') === targetIdStr);
      if (idIndex >= 0) return idIndex;
    }
    let bestIndex = -1;
    let bestScore = -1;
    const hintText = normalizeForMatch([
      suggestion.title,
      suggestion.reason,
      suggestion.originalValue,
    ].filter(Boolean).join(' '));
    items.forEach((item: any, idx: number) => {
      const fieldValue = normalizeForMatch(item?.[normalizedField || fieldFallback] || '');
      const haystack = normalizeForMatch([
        item?.title,
        item?.subtitle,
        item?.company,
        item?.position,
        item?.school,
        item?.major,
        item?.description
      ].filter(Boolean).join(' '));
      let score = 0;
      if (suggestionNeedle && suggestionNeedle.length >= 4) {
        if (fieldValue.includes(suggestionNeedle)) score += 80;
        if (haystack.includes(suggestionNeedle)) score += 60;
      }
      if (hintText) {
        const companyOrTitle = normalizeForMatch([item?.company, item?.title, item?.subtitle, item?.position].filter(Boolean).join(' '));
        if (companyOrTitle && hintText.includes(companyOrTitle)) score += 30;
        if (haystack && hintText.includes(haystack.slice(0, 32))) score += 10;
      }
      if (normalizedField && String(item?.[normalizedField] ?? '').trim()) score += 5;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = idx;
      }
    });
    if (bestScore <= 0 && items.length > 1) {
      // Do not silently drop valid optimization suggestions when anchors are weak.
      // Prefer the first experience/project item as a deterministic fallback.
      return 0;
    }
    return bestIndex >= 0 ? bestIndex : 0;
  };
  const patchFieldValue = (item: any, field: string, value: any) => {
    const next: any = { ...item };
    const isSameText = (a: any, b: any) =>
      normalizeForMatch(String(a ?? '')) === normalizeForMatch(String(b ?? ''));
    if (
      field === 'description' &&
      typeof item?.description === 'string' &&
      typeof value === 'string' &&
      typeof suggestion.originalValue === 'string'
    ) {
      const origin = String(suggestion.originalValue).trim();
      if (origin && item.description.includes(origin)) {
        next.description = item.description.replace(origin, value);
      } else if (!isSameText(item.description, value)) {
        next.description = value;
      } else {
        next.description = item.description;
      }
    } else {
      next[field] = isSameText(item?.[field], value) ? item?.[field] : value;
    }
    return next;
  };
  const getSafeSuggestedValue = (section?: string) => {
    const value = sanitizeSuggestedValue(suggestion.suggestedValue, section);
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return null;
      if (looksLikeTemplatePlaceholder(trimmed)) {
        console.warn('Skip low-quality template-like suggestion value', {
          section: effectiveSection,
          field: normalizedField,
          suggestionId: suggestion.id,
        });
        return null;
      }
      return trimmed;
    }
    return value;
  };

  if (effectiveSection === 'personalInfo') {
    if (!normalizedField) return newData;
    const safeValue = getSafeSuggestedValue(suggestion.targetSection);
    if (safeValue === null) return newData;
    newData.personalInfo = {
      ...newData.personalInfo,
      [normalizedField!]: safeValue
    };
    return newData;
  }

  if (effectiveSection === 'workExps' && Array.isArray(newData.workExps)) {
    const targetIndex = findBestTargetIndex(newData.workExps, 'description');
    if (targetIndex < 0) {
      console.warn('Skip workExps suggestion: unable to resolve target item', suggestion);
      return newData;
    }
    newData.workExps = newData.workExps.map((item, index) => {
      if (index !== targetIndex) return item;
      const value = getSafeSuggestedValue(suggestion.targetSection);
      if (value === null) return item;
      const field = normalizedField || 'description';
      const next: any = patchFieldValue(item, field, value);
      if (field === 'company' || field === 'title') {
        next.company = value;
        next.title = value;
      }
      if (field === 'position' || field === 'subtitle') {
        next.position = value;
        next.subtitle = value;
      }
      return next;
    });
    return newData;
  }

  if (effectiveSection === 'projects' && Array.isArray(newData.projects)) {
    const targetIndex = findBestTargetIndex(newData.projects, 'description');
    if (targetIndex < 0) {
      if (!newData.projects || newData.projects.length === 0) {
        const value = getSafeSuggestedValue(suggestion.targetSection);
        if (value === null) return newData;
        const desc = String(value || '').trim() || '请填写与你目标岗位相关的项目经历，突出目标、行动与量化结果。';
        const newProject = {
          id: Date.now(),
          title: '项目经历',
          subtitle: '',
          date: '',
          description: desc,
          link: '',
        } as any;
        newData.projects = [newProject];
        return newData;
      }
      console.warn('Skip projects suggestion: unable to resolve target item', suggestion);
      return newData;
    }
    newData.projects = newData.projects.map((item, index) => {
      if (index !== targetIndex) return item;
      const value = getSafeSuggestedValue(suggestion.targetSection);
      if (value === null) return item;
      const field = normalizedField || 'description';
      const next: any = patchFieldValue(item, field, value);
      if (field === 'role' || field === 'subtitle') {
        next.role = value;
        next.subtitle = value;
      }
      return next;
    });
    return newData;
  }

  if (effectiveSection === 'educations' && Array.isArray(newData.educations)) {
    const targetIndex = findBestTargetIndex(newData.educations, 'major');
    if (targetIndex < 0) {
      console.warn('Skip educations suggestion: unable to resolve target item', suggestion);
      return newData;
    }
    newData.educations = newData.educations.map((item, index) => {
      if (index !== targetIndex) return item;
      const value = getSafeSuggestedValue(suggestion.targetSection);
      if (value === null) return item;
      const field = normalizedField || 'major';
      const next: any = patchFieldValue(item, field, value);
      if (field === 'school' || field === 'title') {
        next.school = value;
        next.title = value;
      }
      if (field === 'major' || field === 'subtitle') {
        next.major = value;
        next.subtitle = value;
      }
      return next;
    });
    return newData;
  }

  if (effectiveSection === 'skills') {
    const safeSkills = toSkillList(suggestion.suggestedValue);
    if (safeSkills.length > 0) {
      const existing = Array.isArray(newData.skills) ? newData.skills : [];
      const seen = new Set<string>();
      const merged: string[] = [];
      [...existing, ...safeSkills].forEach((raw) => {
        const text = String(raw || '').trim();
        if (!text) return;
        const key = normalizeForMatch(text);
        if (!key || seen.has(key)) return;
        seen.add(key);
        merged.push(text);
      });
      newData.skills = merged;
    }
    return newData;
  }

  if (effectiveSection === 'summary') {
    const value = getSafeSuggestedValue(suggestion.targetSection);
    if (value === null) return newData;
    newData.summary = value;
    newData.personalInfo = {
      ...newData.personalInfo,
      summary: value
    };
    return newData;
  }

  return newData;
};
