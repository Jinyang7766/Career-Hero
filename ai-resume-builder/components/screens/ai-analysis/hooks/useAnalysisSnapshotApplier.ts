import { useCallback } from 'react';
import { normalizeScoreBreakdown, resolveDisplayScore } from '../analysis-mappers';
import { consolidateSkillSuggestions } from '../suggestion-helpers';
import { isGenderRelatedSuggestion, isEducationRelatedSuggestion } from '../chat-formatters';
import type { AnalysisReport, Suggestion } from '../types';

type Params = {
  setOriginalScore: (value: number) => void;
  setScore: (value: number) => void;
  setSuggestions: (items: Suggestion[]) => void;
  setReport: (value: AnalysisReport | null) => void;
  setIsFromCache: (value: boolean) => void;
};

export const useAnalysisSnapshotApplier = ({
  setOriginalScore,
  setScore,
  setSuggestions,
  setReport,
  setIsFromCache,
}: Params) => {
  const applyAnalysisSnapshot = useCallback((snapshot: any) => {
    if (!snapshot) return false;

    const normalizedBreakdown = normalizeScoreBreakdown(
      snapshot.scoreBreakdown || { experience: 0, skills: 0, format: 0 },
      snapshot.score || 0
    );
    const displayScore = resolveDisplayScore(snapshot.score || 0, normalizedBreakdown);
    setOriginalScore(displayScore);
    setScore(displayScore);
    const cleanedSuggestions = consolidateSkillSuggestions(snapshot.suggestions || []).filter((s: any) =>
      !isGenderRelatedSuggestion(s) && !isEducationRelatedSuggestion(s)
    );
    setSuggestions(cleanedSuggestions);
    setReport({
      summary: snapshot.summary || '',
      microInterviewFirstQuestion: String(snapshot.microInterviewFirstQuestion || '').trim(),
      strengths: snapshot.strengths || [],
      weaknesses: snapshot.weaknesses || [],
      missingKeywords: snapshot.missingKeywords || [],
      scoreBreakdown: normalizedBreakdown
    });
    setIsFromCache(true);
    return true;
  }, [setIsFromCache, setOriginalScore, setReport, setScore, setSuggestions]);

  return { applyAnalysisSnapshot };
};
