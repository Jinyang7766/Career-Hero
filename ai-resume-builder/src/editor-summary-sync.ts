import type { ResumeData } from '../types';
import { clampByLimit, SUMMARY_MAX_CHARS } from './editor-field-limits';

export const toSummaryText = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

export const pickFirstNonEmptySummary = (...values: unknown[]) => {
  for (const value of values) {
    const normalized = toSummaryText(value);
    if (normalized) return normalized;
  }
  return '';
};

export const normalizeEditorSummary = (value: unknown) =>
  clampByLimit(toSummaryText(value), SUMMARY_MAX_CHARS);

export const resolveResumeSummaryValue = (data?: Partial<ResumeData> | null) =>
  pickFirstNonEmptySummary(data?.summary, data?.personalInfo?.summary);

export const resolveImportedSummaryText = (importedData?: Partial<ResumeData> | null) =>
  pickFirstNonEmptySummary(importedData?.summary, importedData?.personalInfo?.summary);

export const applySummaryToResumeData = (prev: ResumeData, summaryValue: unknown): ResumeData => {
  const normalizedSummary = normalizeEditorSummary(summaryValue);
  const prevRootSummary = normalizeEditorSummary(prev?.summary);
  const prevPersonalSummary = normalizeEditorSummary(prev?.personalInfo?.summary);

  if (prevRootSummary === normalizedSummary && prevPersonalSummary === normalizedSummary) {
    return prev;
  }

  return {
    ...prev,
    summary: normalizedSummary,
    personalInfo: {
      ...prev.personalInfo,
      summary: normalizedSummary,
    },
  };
};
