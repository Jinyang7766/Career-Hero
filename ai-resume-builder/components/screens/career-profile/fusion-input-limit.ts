export const CAREER_PROFILE_SUPPLEMENT_MAX_CHARS = 2000;

const normalizeToken = (value: string): string =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

export const clampCareerProfileSupplement = (
  value: string,
  maxChars: number = CAREER_PROFILE_SUPPLEMENT_MAX_CHARS
): string => {
  const text = String(value || '');
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
};

export const appendCareerProfileSupplement = (
  currentValue: string,
  nextBlock: string,
  maxChars: number = CAREER_PROFILE_SUPPLEMENT_MAX_CHARS
): string => {
  const next = normalizeToken(nextBlock);
  if (!next) return clampCareerProfileSupplement(currentValue, maxChars);

  const current = String(currentValue || '').trim();
  if (!current) return clampCareerProfileSupplement(`${next}\n`, maxChars);
  if (current.includes(next)) return clampCareerProfileSupplement(current, maxChars);
  return clampCareerProfileSupplement(`${current}\n${next}\n`, maxChars);
};
