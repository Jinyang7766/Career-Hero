import type { ResumeData } from '../../../types';

export type PreviewEditableSection = 'workExps' | 'educations' | 'projects';
export type PreviewEditableItemField = 'title' | 'subtitle' | 'description' | 'date';

const SUMMARY_KEY = 'summary';
const SKILLS_COLLECTION_KEY = 'skills.__collection';

export const buildPreviewSummaryDirtyKey = () => SUMMARY_KEY;

export const buildPreviewPersonalDirtyKey = (field: keyof ResumeData['personalInfo']) =>
  `personalInfo.${String(field)}`;

export const buildPreviewSectionFieldDirtyKey = (
  section: PreviewEditableSection,
  id: number,
  field: PreviewEditableItemField
) => `${section}.${String(id)}.${field}`;

export const buildPreviewSectionCollectionDirtyKey = (section: PreviewEditableSection) => `${section}.__collection`;

export const buildPreviewSkillDirtyKey = (index: number) => `skills.${String(index)}`;

export const buildPreviewSkillsCollectionDirtyKey = () => SKILLS_COLLECTION_KEY;

type ResolveParams = {
  baseline: ResumeData | null | undefined;
  current: ResumeData | null | undefined;
  trackedKeys: Iterable<string>;
};

const normalizePrimitive = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value) || '';
  } catch {
    return String(value);
  }
};

const getSectionItemValue = (
  resumeData: ResumeData | null | undefined,
  section: PreviewEditableSection,
  id: number,
  field: PreviewEditableItemField
): string => {
  const list = (resumeData as any)?.[section];
  if (!Array.isArray(list)) return '';
  const item = list.find((entry: any) => Number(entry?.id) === Number(id));
  if (!item) return '';
  return normalizePrimitive(item?.[field]);
};

const getSectionCollectionSignature = (
  resumeData: ResumeData | null | undefined,
  section: PreviewEditableSection
): string => {
  const list = (resumeData as any)?.[section];
  if (!Array.isArray(list)) return '[]';
  return normalizePrimitive(
    list.map((item: any) => ({
      id: Number(item?.id),
      title: normalizePrimitive(item?.title),
      subtitle: normalizePrimitive(item?.subtitle),
      description: normalizePrimitive(item?.description),
      date: normalizePrimitive(item?.date),
    }))
  );
};

const getComparableValueByDirtyKey = (resumeData: ResumeData | null | undefined, dirtyKey: string): string => {
  if (!dirtyKey) return '';

  if (dirtyKey === SUMMARY_KEY) {
    return normalizePrimitive((resumeData as any)?.summary ?? (resumeData as any)?.personalInfo?.summary ?? '');
  }

  if (dirtyKey === SKILLS_COLLECTION_KEY) {
    const skills = Array.isArray((resumeData as any)?.skills) ? (resumeData as any).skills : [];
    return normalizePrimitive(skills.map((item: unknown) => normalizePrimitive(item)));
  }

  if (dirtyKey.startsWith('skills.')) {
    const index = Number(dirtyKey.split('.')[1]);
    const skills = Array.isArray((resumeData as any)?.skills) ? (resumeData as any).skills : [];
    return normalizePrimitive(Number.isFinite(index) ? skills[index] : '');
  }

  if (dirtyKey.startsWith('personalInfo.')) {
    const field = dirtyKey.replace('personalInfo.', '');
    return normalizePrimitive((resumeData as any)?.personalInfo?.[field]);
  }

  if (dirtyKey.endsWith('.__collection')) {
    const section = dirtyKey.replace('.__collection', '') as PreviewEditableSection;
    if (section === 'workExps' || section === 'educations' || section === 'projects') {
      return getSectionCollectionSignature(resumeData, section);
    }
  }

  const sectionFieldMatch = dirtyKey.match(/^(workExps|educations|projects)\.(\d+)\.(title|subtitle|description|date)$/);
  if (sectionFieldMatch) {
    const [, section, idText, field] = sectionFieldMatch;
    return getSectionItemValue(
      resumeData,
      section as PreviewEditableSection,
      Number(idText),
      field as PreviewEditableItemField
    );
  }

  return normalizePrimitive((resumeData as any)?.[dirtyKey]);
};

export const resolvePreviewDirtyKeys = ({ baseline, current, trackedKeys }: ResolveParams): string[] => {
  const uniqueKeys = Array.from(new Set(Array.from(trackedKeys).filter(Boolean)));
  return uniqueKeys.filter((dirtyKey) => {
    const baselineValue = getComparableValueByDirtyKey(baseline, dirtyKey);
    const currentValue = getComparableValueByDirtyKey(current, dirtyKey);
    return baselineValue !== currentValue;
  });
};
