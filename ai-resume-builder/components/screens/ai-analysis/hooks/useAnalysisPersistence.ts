import { DatabaseService } from '../../../../src/database-service';
import { supabase } from '../../../../src/supabase-client';
import type { ResumeData } from '../../../../types';
import type { Suggestion } from '../types';

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
};

export const useAnalysisPersistence = ({
  resumeData,
  setResumeData,
  jdText,
  targetCompany,
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
        actionable: nextSuggestions.length,
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

  return {
    persistAnalysisSnapshot,
    persistSuggestionsState,
  };
};
