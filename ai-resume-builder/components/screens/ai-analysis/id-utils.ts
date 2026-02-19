export const normalizeResumeId = (id: any) => String(id ?? '').trim();

export const isSameResumeId = (a: any, b: any) => {
  const aa = normalizeResumeId(a);
  const bb = normalizeResumeId(b);
  return !!aa && !!bb && aa === bb;
};

export const normalizeJdText = (text: any) =>
  String(text ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

export const makeJdKey = (text: string) => {
  const normalized = normalizeJdText(text);
  if (!normalized) return 'jd_default';
  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 31 + normalized.charCodeAt(i)) | 0;
  }
  return `jd_${Math.abs(hash)}`;
};

export const normalizeInterviewType = (value: any) => {
  const t = String(value ?? '').trim().toLowerCase();
  if (t === 'technical' || t === 'hr' || t === 'general') return t;
  return 'general';
};

export const normalizeInterviewMode = (value: any) => {
  const mode = String(value ?? '').trim().toLowerCase();
  return mode === 'simple' ? 'simple' : 'comprehensive';
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
