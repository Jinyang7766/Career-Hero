export const PERSONAL_FIELD_LIMITS = {
  name: 40,
  title: 60,
  email: 120,
  phone: 24,
  age: 3,
  location: 80,
  linkedin: 120,
  website: 120,
  avatar: 2_000_000,
} as const;

export const WORK_FIELD_LIMITS = {
  title: 80,
  subtitle: 80,
  startDate: 20,
  endDate: 20,
  description: 1200,
} as const;

export const EDUCATION_FIELD_LIMITS = {
  title: 80,
  subtitle: 80,
  degree: 40,
  startDate: 20,
  endDate: 20,
} as const;

export const PROJECT_FIELD_LIMITS = {
  title: 80,
  subtitle: 80,
  startDate: 20,
  endDate: 20,
  description: 1200,
} as const;

export const SKILL_MAX_CHARS = 30;
export const SUMMARY_MAX_CHARS = 1200;

export const clampByLimit = (value: string, limit: number) => String(value || '').slice(0, limit);
