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

export const makeInterviewSessionKey = (jdText: string, interviewType: any) => {
  const jdKey = makeJdKey(jdText);
  const typeKey = normalizeInterviewType(interviewType);
  return `${jdKey}__${typeKey}`;
};

export const buildAnalysisReportId = (originalResumeId: any, jdText: string) => {
  const normalizedOriginalId = normalizeResumeId(originalResumeId) || 'unknown';
  return `analysis_${normalizedOriginalId}_${makeJdKey(jdText)}`;
};
