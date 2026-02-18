import type { Dispatch, SetStateAction } from 'react';
import { DatabaseService } from '../../../../src/database-service';
import { supabase } from '../../../../src/supabase-client';
import type { ResumeData } from '../../../../types';
import type { Suggestion } from '../types';
import { createMasker } from '../chat-payload';

type AnalysisReportLike = {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  missingKeywords: string[];
  scoreBreakdown: { experience: number; skills: number; format: number };
};

type Params = {
  resumeData: ResumeData;
  setResumeData?: (v: ResumeData) => void;
  jdText: string;
  targetCompany: string;
  setSuggestions: Dispatch<SetStateAction<Suggestion[]>>;
};

export const useAnalysisPersistence = ({
  resumeData,
  setResumeData,
  jdText,
  targetCompany,
  setSuggestions,
}: Params) => {
  const persistSuggestionsState = async (nextSuggestions: Suggestion[]) => {
    if (!resumeData) return;

    const updatedResumeData: ResumeData = {
      ...resumeData,
      analysisSnapshot: resumeData.analysisSnapshot
        ? {
            ...resumeData.analysisSnapshot,
            suggestions: nextSuggestions || [],
            updatedAt: new Date().toISOString(),
          }
        : resumeData.analysisSnapshot,
    };

    if (setResumeData) {
      setResumeData(updatedResumeData);
    }

    if (!resumeData.id) return;
    try {
      await DatabaseService.updateResume(String(resumeData.id), {
        resume_data: updatedResumeData,
        updated_at: new Date().toISOString()
      });
    } catch (err) {
      console.error('Failed to persist suggestion state:', err);
    }
  };

  const persistAnalysisSnapshot = async (
    data: ResumeData,
    reportData: AnalysisReportLike,
    scoreValue: number,
    suggestionItems: Suggestion[]
  ) => {
    if (!data?.id) return;
    const targetId = String(data.id);
    const latestRow = await DatabaseService.getResume(targetId);
    const latestResumeData = latestRow.success && latestRow.data?.resume_data
      ? latestRow.data.resume_data
      : null;
    const baseResumeData: ResumeData = (latestResumeData
      ? {
          id: latestRow.data.id,
          ...latestResumeData,
          resumeTitle: latestRow.data.title,
        }
      : data) as ResumeData;

    const snapshot = {
      score: scoreValue,
      summary: reportData.summary || '',
      strengths: reportData.strengths || [],
      weaknesses: reportData.weaknesses || [],
      missingKeywords: reportData.missingKeywords || [],
      scoreBreakdown: reportData.scoreBreakdown || { experience: 0, skills: 0, format: 0 },
      suggestions: suggestionItems || [],
      updatedAt: new Date().toISOString(),
      jdText: jdText || baseResumeData.lastJdText || '',
      targetCompany: targetCompany || baseResumeData.targetCompany || ''
    };
    const nextSuggestions = Array.isArray(suggestionItems) ? suggestionItems : [];
    const pendingCount = nextSuggestions.filter((s: any) => s?.status === 'pending').length;
    const acceptedCount = nextSuggestions.filter((s: any) => s?.status === 'accepted').length;
    const ignoredCount = nextSuggestions.filter((s: any) => s?.status === 'ignored').length;
    const dossier = {
      id: `dossier_${Date.now()}`,
      createdAt: snapshot.updatedAt,
      score: scoreValue,
      summary: reportData.summary || '',
      targetCompany: snapshot.targetCompany || '',
      jdText: snapshot.jdText || '',
      scoreBreakdown: snapshot.scoreBreakdown,
      suggestionsOverview: {
        total: nextSuggestions.length,
        pending: pendingCount,
        accepted: acceptedCount,
        ignored: ignoredCount,
      },
      strengths: reportData.strengths || [],
      weaknesses: reportData.weaknesses || [],
      missingKeywords: reportData.missingKeywords || [],
    };
    const previousHistory = Array.isArray((baseResumeData as any).analysisDossierHistory)
      ? (baseResumeData as any).analysisDossierHistory
      : [];
    const updatedResumeData: ResumeData = {
      ...baseResumeData,
      analysisSnapshot: snapshot,
      analysisDossierLatest: dossier,
      analysisDossierHistory: [dossier, ...previousHistory].slice(0, 20),
      lastJdText: snapshot.jdText || baseResumeData.lastJdText || '',
      targetCompany: snapshot.targetCompany || baseResumeData.targetCompany || '',
    };
    if (setResumeData) {
      setResumeData(updatedResumeData);
    }
    await DatabaseService.updateResume(targetId, {
      resume_data: updatedResumeData,
      updated_at: new Date().toISOString()
    });
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (!userError && user?.id) {
        const userResult = await DatabaseService.getUser(String(user.id));
        const userHistory = Array.isArray((userResult as any)?.data?.analysis_dossier_history)
          ? (userResult as any).data.analysis_dossier_history
          : [];
        const nextUserHistory = [dossier, ...userHistory].slice(0, 50);
        await DatabaseService.updateUser(String(user.id), {
          analysis_dossier_latest: dossier,
          analysis_dossier_history: nextUserHistory,
        });
      }
    } catch (err) {
      console.warn('Failed to persist user-level analysis dossier:', err);
    }
    return updatedResumeData;
  };

  const maskSuggestionPayload = (suggestion: Suggestion) => {
    const masker = createMasker();
    const maskValue = (value: any) => {
      if (value === null || value === undefined) return value;
      if (typeof value === 'string') return masker.maskText(value);
      return masker.maskObject(value);
    };

    return {
      reasonMasked: suggestion.reason ? masker.maskText(suggestion.reason) : undefined,
      originalValueMasked: maskValue(suggestion.originalValue),
      suggestedValueMasked: maskValue(suggestion.suggestedValue)
    };
  };

  const persistSuggestionFeedback = async (suggestion: Suggestion, rating: 'up' | 'down') => {
    if (!resumeData) return;
    if (suggestion.rating === rating) return;

    const updatedFeedback = {
      ...(resumeData.aiSuggestionFeedback || {}),
      [suggestion.id]: {
        rating,
        ratedAt: new Date().toISOString(),
        title: suggestion.title,
        reason: suggestion.reason
      }
    };

    const updatedResumeData: ResumeData = {
      ...resumeData,
      aiSuggestionFeedback: updatedFeedback
    };

    setSuggestions(prev => prev.map(s => s.id === suggestion.id ? { ...s, rating } : s));
    if (setResumeData) {
      setResumeData(updatedResumeData);
    }

    if (!resumeData.id) return;
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) return;

      const masked = rating === 'down' ? maskSuggestionPayload(suggestion) : {};

      await DatabaseService.createSuggestionFeedback({
        userId: user.id,
        resumeId: resumeData.id ?? null,
        suggestionId: suggestion.id,
        rating,
        title: suggestion.title,
        reasonMasked: (masked as any).reasonMasked,
        originalValueMasked: (masked as any).originalValueMasked,
        suggestedValueMasked: (masked as any).suggestedValueMasked
      });

      await DatabaseService.updateResume(String(resumeData.id), {
        resume_data: updatedResumeData,
        updated_at: new Date().toISOString()
      });
    } catch (err) {
      console.error('Failed to persist suggestion feedback:', err);
    }
  };

  return {
    persistAnalysisSnapshot,
    persistSuggestionFeedback,
    persistSuggestionsState,
  };
};
