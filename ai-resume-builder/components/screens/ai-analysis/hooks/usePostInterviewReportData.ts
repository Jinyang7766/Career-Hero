import { useMemo } from 'react';
import type { ResumeData } from '../../../../types';
import { toSkillList } from '../../../../src/skill-utils';
import { sanitizeSuggestedValue } from '../chat-formatters';
import { inferTargetSection, normalizeTargetSection } from '../suggestion-helpers';
import { applySuggestionToResume } from '../suggestion-applier';
import type { Suggestion } from '../types';

type Params = {
  originalResumeData: ResumeData | null;
  resumeData: ResumeData;
  suggestions: Suggestion[];
  postInterviewSummary: string;
  reportSummary?: string;
};

export const usePostInterviewReportData = ({
  originalResumeData,
  resumeData,
  suggestions,
  postInterviewSummary,
  reportSummary,
}: Params) => {
  const postInterviewOriginalResume = (originalResumeData || resumeData || null) as ResumeData | null;

  const postInterviewGeneratedResume = useMemo(() => {
    if (!postInterviewOriginalResume) return null;
    return (suggestions || []).reduce((acc: ResumeData, s: Suggestion) => {
      try {
        return applySuggestionToResume({
          base: acc,
          suggestion: s,
          normalizeTargetSection,
          inferTargetSection,
          sanitizeSuggestedValue,
          toSkillList,
        });
      } catch {
        return acc;
      }
    }, { ...(postInterviewOriginalResume as any) });
  }, [postInterviewOriginalResume, suggestions]);

  const postInterviewAnnotations = useMemo(() => (
    (suggestions || [])
      .map((s: any) => ({
        id: String(s.id),
        title: String(s.title || '优化建议'),
        reason: String(s.reason || ''),
        section: String(s.targetSection || ''),
        targetId: s.targetId === undefined || s.targetId === null ? '' : String(s.targetId),
      }))
  ), [suggestions]);

  const effectivePostInterviewSummary = String(postInterviewSummary || reportSummary || '').trim();

  return {
    postInterviewOriginalResume,
    postInterviewGeneratedResume,
    postInterviewAnnotations,
    effectivePostInterviewSummary,
  };
};
