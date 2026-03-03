export type InlineEditableSection = 'workExps' | 'educations' | 'projects';

export const buildSectionTitleFocusKey = (section: InlineEditableSection, id: number): string =>
  `${section}:${id}:title`;

export const buildSkillFocusKey = (index: number): string =>
  `skills:${index}:item`;

