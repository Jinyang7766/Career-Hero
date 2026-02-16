export const normalizeResumeId = (id: any) => String(id ?? '').trim();

export const isSameResumeId = (a: any, b: any) => {
  const aa = normalizeResumeId(a);
  const bb = normalizeResumeId(b);
  return !!aa && !!bb && aa === bb;
};
