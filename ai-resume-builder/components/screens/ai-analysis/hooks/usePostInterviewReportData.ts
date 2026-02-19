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
  baseScore?: number;
  weaknesses?: string[];
};

export const usePostInterviewReportData = ({
  originalResumeData,
  resumeData,
  suggestions,
  postInterviewSummary,
  reportSummary,
  baseScore,
  weaknesses,
}: Params) => {
  const postInterviewOriginalResume = (originalResumeData || resumeData || null) as ResumeData | null;

  const cloneResumeData = (input: ResumeData) => {
    try {
      return JSON.parse(JSON.stringify(input)) as ResumeData;
    } catch {
      return { ...(input as any) } as ResumeData;
    }
  };

  const postInterviewGeneratedResume = useMemo(() => {
    if (!postInterviewOriginalResume) return null;
    const base = cloneResumeData(postInterviewOriginalResume);
    const generated = (suggestions || []).reduce((acc: ResumeData, s: Suggestion) => {
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
    }, base);

    // Keep original resume intact: generated resume should be treated as a new optimized copy.
    const sourceId = String((postInterviewOriginalResume as any)?.id || '').trim();
    const normalized: any = { ...(generated as any) };
    if (sourceId) {
      normalized.optimizationStatus = 'optimized';
      normalized.optimizedFromId = sourceId;
    }
    delete normalized.id;
    return normalized as ResumeData;
  }, [postInterviewOriginalResume, suggestions]);

  const postInterviewAnnotations = useMemo(() => (
    (() => {
      const normalize = (v: any) =>
        String(v || '')
          .trim()
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .replace(/[，,。.;；:：!?！？'"`]/g, '');

      const seen = new Set<string>();
      const deduped: Array<{
        id: string;
        title: string;
        reason: string;
        section: string;
        targetId: string;
        targetField: string;
        originalValue: string;
        suggestedValue: string;
      }> = [];

      (suggestions || []).forEach((s: any) => {
        const item = {
          id: String(s.id),
          title: String(s.title || '优化建议'),
          reason: String(s.reason || ''),
          section: String(s.targetSection || ''),
          targetId: s.targetId === undefined || s.targetId === null ? '' : String(s.targetId),
          targetField: String(s.targetField || ''),
          originalValue: typeof s.originalValue === 'string' ? s.originalValue : '',
          suggestedValue: typeof s.suggestedValue === 'string' ? s.suggestedValue : '',
        };
        const dedupKey = [
          normalize(item.section),
          normalize(item.targetId),
          normalize(item.targetField),
          normalize(item.title),
          normalize(item.reason),
          normalize(item.originalValue),
        ].join('|');
        if (seen.has(dedupKey)) return;
        seen.add(dedupKey);
        deduped.push(item);
      });
      return deduped;
    })()
  ), [suggestions]);

  const effectivePostInterviewSummary = String(postInterviewSummary || reportSummary || '').trim();
  const parseScoreFromSummary = (text: string) => {
    const raw = String(text || '');
    const m = raw.match(/总分[:：]?\s*(\d{1,3})\s*\/\s*100/i) || raw.match(/(\d{1,3})\s*\/\s*100/);
    if (!m) return null;
    const n = Number(m[1]);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.min(100, Math.round(n)));
  };
  const finalReportScore = useMemo(() => {
    const parsed = parseScoreFromSummary(effectivePostInterviewSummary);
    const fallback = Number(baseScore || 0);
    return parsed ?? Math.max(0, Math.min(100, Math.round(fallback)));
  }, [effectivePostInterviewSummary, baseScore]);
  const finalReportSummary = useMemo(
    () => String(effectivePostInterviewSummary || '').trim() || '优化已完成。',
    [effectivePostInterviewSummary]
  );
  const finalReportAdvice = useMemo(
    () => (Array.isArray(weaknesses) ? weaknesses : [])
      .map((x) => String(x || '').trim())
      .filter(Boolean)
      .slice(0, 6),
    [weaknesses]
  );

  return {
    postInterviewOriginalResume,
    postInterviewGeneratedResume,
    postInterviewAnnotations,
    effectivePostInterviewSummary,
    finalReportScore,
    finalReportSummary,
    finalReportAdvice,
  };
};
