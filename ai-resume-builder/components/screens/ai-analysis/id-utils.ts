export const normalizeResumeId = (id: any) => String(id ?? '').trim();

export const isSameResumeId = (a: any, b: any) => {
  const aa = normalizeResumeId(a);
  const bb = normalizeResumeId(b);
  return !!aa && !!bb && aa === bb;
};

export const normalizeJdText = (text: any) =>
  String(text ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

export const NO_JD_SENTINEL = '__no_jd__';
export const LEGACY_NO_JD_KEY = 'jd_default';

export const makeJdKey = (text: string) => {
  const normalized = normalizeJdText(text);
  if (!normalized) return 'jd_default';
  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 31 + normalized.charCodeAt(i)) | 0;
  }
  return `jd_${Math.abs(hash)}`;
};

export const makeNormalizedJdKey = (text: string) =>
  makeJdKey(String(text || '').trim() || NO_JD_SENTINEL);

export const normalizeStoredJdKey = (key: any): string => {
  const raw = String(key || '').trim();
  if (!raw || raw === LEGACY_NO_JD_KEY) return makeNormalizedJdKey('');
  return raw;
};

export const isEquivalentJdKey = (a: any, b: any): boolean =>
  normalizeStoredJdKey(a) === normalizeStoredJdKey(b);

export const normalizeInterviewType = (value: any) => {
  const t = String(value ?? '').trim().toLowerCase();
  if (t === 'technical') return 'technical';
  if (t === 'pressure' || t === 'hr') return 'pressure';
  return 'general';
};

export const normalizeInterviewMode = (value: any) => {
  // Interview mode selection is removed. Keep one canonical mode in runtime.
  void value;
  return 'comprehensive';
};

export const makeInterviewScopedKey = (
  jdKey: string,
  interviewType: any,
  interviewMode?: any
) => {
  const typeKey = normalizeInterviewType(interviewType);
  const modeKey = String(interviewMode ?? '').trim().toLowerCase();
  if (modeKey === 'simple' || modeKey === 'comprehensive') {
    return `${jdKey}__${typeKey}__${modeKey}`;
  }
  return `${jdKey}__${typeKey}`;
};

export const makeInterviewSessionKey = (
  jdText: string,
  interviewType: any,
  interviewMode?: any
) => {
  const jdKey = makeJdKey(jdText);
  return makeInterviewScopedKey(jdKey, interviewType, interviewMode);
};

export const parseInterviewScopedKey = (key: string) => {
  const raw = String(key || '').trim();
  const parts = raw.split('__').filter(Boolean);
  const base = String(parts[0] || '').trim();
  const type = normalizeInterviewType(parts[1] || '');
  const modeRaw = String(parts[2] || '').trim().toLowerCase();
  const mode = modeRaw === 'simple' || modeRaw === 'comprehensive' ? modeRaw : '';
  return {
    jdKey: base,
    interviewType: type,
    interviewMode: mode,
  };
};

export const buildAnalysisReportId = (originalResumeId: any, jdText: string) => {
  const normalizedOriginalId = normalizeResumeId(originalResumeId) || 'unknown';
  return `analysis_${normalizedOriginalId}_${makeJdKey(jdText)}`;
};
