import type { WorkExperience } from '../../../types';
import type { CareerProfileExperience } from '../../../src/career-profile-utils';

const toText = (value: unknown): string => String(value || '').trim();

const parseDateRange = (item: WorkExperience): string => {
  const explicit = toText(item.date);
  if (explicit) return explicit;
  const start = toText(item.startDate);
  const end = toText(item.endDate);
  if (start && end) return `${start}-${end}`;
  return start || end;
};

export const composeExperienceDescription = (actions: string, results: string): string => {
  const cleanActions = toText(actions);
  const cleanResults = toText(results);
  if (cleanActions && cleanResults) return `${cleanActions}\n成果：${cleanResults}`;
  if (cleanActions) return cleanActions;
  if (cleanResults) return `成果：${cleanResults}`;
  return '';
};

export const splitExperienceDescription = (
  description: string
): { actions: string; results: string; hasResultsMarker: boolean } => {
  const text = toText(description);
  if (!text) return { actions: '', results: '', hasResultsMarker: false };

  const leadingMarker = text.match(/^\s*成果[:：]\s*(.*)$/s);
  if (leadingMarker) {
    return {
      actions: '',
      results: toText(leadingMarker[1]),
      hasResultsMarker: true,
    };
  }

  const markerMatch = text.match(/\n\s*成果[:：]\s*/);
  if (!markerMatch || markerMatch.index == null) {
    return {
      actions: text,
      results: '',
      hasResultsMarker: false,
    };
  }

  const markerStart = markerMatch.index;
  const markerEnd = markerStart + markerMatch[0].length;
  return {
    actions: toText(text.slice(0, markerStart)),
    results: toText(text.slice(markerEnd)),
    hasResultsMarker: true,
  };
};

const normalizeInResume = (
  value: unknown
): CareerProfileExperience['inResume'] => {
  const text = toText(value).toLowerCase();
  if (text === 'yes' || text === 'no' || text === 'unknown') {
    return text as CareerProfileExperience['inResume'];
  }
  return 'unknown';
};

const normalizeConfidence = (
  value: unknown
): CareerProfileExperience['confidence'] => {
  const text = toText(value).toLowerCase();
  if (text === 'high' || text === 'medium' || text === 'low') {
    return text as CareerProfileExperience['confidence'];
  }
  return 'medium';
};

export const buildCareerProfileExperiencesFromWorkExps = (
  workExps: WorkExperience[],
  existingExperiences: CareerProfileExperience[] | undefined
): CareerProfileExperience[] => {
  const fallbackById = new Map<number, CareerProfileExperience>();
  (existingExperiences || []).forEach((item, index) => {
    fallbackById.set(index + 1, item);
  });

  return (workExps || []).map((item, index) => {
    const fallback =
      fallbackById.get(Number(item.id)) ||
      (Array.isArray(existingExperiences) ? existingExperiences[index] : undefined);
    const parsed = splitExperienceDescription(String(item.description || ''));

    const actions = parsed.actions || toText(fallback?.actions);
    const results = parsed.hasResultsMarker ? parsed.results : toText(fallback?.results);
    const organization = toText(item.title || item.company) || toText(fallback?.organization);
    const title = toText(item.subtitle) || toText(fallback?.title);
    const period = parseDateRange(item) || toText(fallback?.period);

    return {
      title,
      period,
      organization,
      actions,
      results,
      skills: Array.isArray(fallback?.skills) ? [...fallback.skills] : [],
      inResume: normalizeInResume(fallback?.inResume),
      confidence: normalizeConfidence(fallback?.confidence),
      evidence: toText(fallback?.evidence) || '来自全量画像编辑',
    };
  });
};
