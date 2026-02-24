const toText = (value: unknown) => {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  return '';
};

export const normalizeImportedGenderValue = (value: unknown): '' | 'male' | 'female' => {
  const raw = toText(value).toLowerCase();
  if (!raw) return '';
  const cleaned = raw.replace(/^(?:性别|gender|sex)\s*[:：]?\s*/i, '').trim();
  if (!cleaned) return '';

  const maleTokens = new Set(['male', 'm', 'man', 'boy', '男', '男性', '先生', '♂']);
  const femaleTokens = new Set(['female', 'f', 'woman', 'girl', '女', '女性', '女士', '♀']);
  if (maleTokens.has(cleaned)) return 'male';
  if (femaleTokens.has(cleaned)) return 'female';
  if (cleaned.includes('男') && !cleaned.includes('女')) return 'male';
  if (cleaned.includes('女') && !cleaned.includes('男')) return 'female';
  if (/\bmale\b/.test(cleaned)) return 'male';
  if (/\bfemale\b/.test(cleaned)) return 'female';
  return '';
};

export const normalizeImportedAgeValue = (value: unknown): string => {
  const raw = toText(value);
  if (!raw) return '';
  const compact = raw.replace(/\s+/g, '').replace(/(周?岁|years?old|yrs?)/gi, '');
  if (!compact) return '';

  // Prefer explicit age tokens and avoid treating birth year as age.
  const match = compact.match(/(?<!\d)(\d{1,3})(?!\d)/);
  if (match && !/\d{4}/.test(compact)) return match[1];
  return compact.slice(0, 10);
};

export const resolveImportedProfileMeta = (importedData: any): { age: string; gender: '' | 'male' | 'female' } => {
  const personal = importedData?.personalInfo || {};
  const age = normalizeImportedAgeValue(
    personal?.age ?? personal?.年龄 ?? importedData?.age ?? importedData?.年龄
  );
  const gender = normalizeImportedGenderValue(
    importedData?.gender ?? importedData?.sex ?? personal?.gender ?? personal?.sex ?? personal?.性别 ?? importedData?.性别
  );
  return { age, gender };
};
