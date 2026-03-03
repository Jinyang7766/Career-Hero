const ANALYSIS_SOURCES = new Set([
  'diagnosis_generated',
  'analysis_generated',
  'interview_refined',
]);

const toText = (value: unknown): string => String(value || '').trim();

const toNormalized = (value: unknown): string => toText(value).toLowerCase();

const isObjectRecord = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const hasNonEmptyKeys = (value: unknown): boolean =>
  isObjectRecord(value) && Object.keys(value).length > 0;

const toResumeData = (resumeLike: any): Record<string, any> => {
  if (isObjectRecord(resumeLike?.resume_data)) return resumeLike.resume_data;
  if (isObjectRecord(resumeLike)) return resumeLike;
  return {};
};

export const isResumeEligibleForLibrary = (resumeLike: any): boolean => {
  const resumeData = toResumeData(resumeLike);

  const optimizationStatus = toNormalized(resumeData.optimizationStatus);
  if (optimizationStatus === 'optimized') return true;

  if (toText(resumeData.analysisReportId)) return true;
  if (toText(resumeData.optimizationJdKey)) return true;

  if (hasNonEmptyKeys(resumeData.analysisSnapshot)) return true;
  if (hasNonEmptyKeys(resumeData.analysisDossierLatest)) return true;
  if (hasNonEmptyKeys(resumeData.analysisBindings)) return true;
  if (hasNonEmptyKeys(resumeData.analysisSessionByJd)) return true;

  const source = toNormalized(resumeData.source || resumeData.resumeSource || resumeData.generatedSource);
  if (ANALYSIS_SOURCES.has(source)) return true;

  return false;
};

export const shouldPersistResumeRecord = (resumeLike: any): boolean =>
  isResumeEligibleForLibrary(resumeLike);

export const withLocalOnlyDraftMeta = (resumeLike: any): Record<string, any> => {
  const resumeData = toResumeData(resumeLike);
  const source = toNormalized(resumeData.source) || 'profile_draft';
  return {
    ...resumeData,
    source,
    persistPolicy: 'local_only',
  };
};

