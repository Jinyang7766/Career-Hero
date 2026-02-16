import { useCallback } from 'react';
import { normalizeScoreBreakdown, resolveDisplayScore } from '../analysis-mappers';
import { applySuggestionFeedback, consolidateSkillSuggestions } from '../suggestion-helpers';
import type { AnalysisReport, Suggestion } from '../types';

type Params = {
  resumeFeedback?: Record<string, any>;
  setOriginalScore: (value: number) => void;
  setScore: (value: number) => void;
  setSuggestions: (items: Suggestion[]) => void;
  setReport: (value: AnalysisReport | null) => void;
  setIsFromCache: (value: boolean) => void;
};

export const useAnalysisSnapshotApplier = ({
  resumeFeedback,
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
    setSuggestions(applySuggestionFeedback(
      consolidateSkillSuggestions(snapshot.suggestions || []),
      resumeFeedback || {}
    ));
    setReport({
      summary: snapshot.summary || '',
      strengths: snapshot.strengths || [],
      weaknesses: snapshot.weaknesses || [],
      missingKeywords: snapshot.missingKeywords || [],
      scoreBreakdown: normalizedBreakdown
    });
    setIsFromCache(true);
    return true;
  }, [resumeFeedback, setIsFromCache, setOriginalScore, setReport, setScore, setSuggestions]);

  return { applyAnalysisSnapshot };
};
