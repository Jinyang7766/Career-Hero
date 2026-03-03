import { DatabaseService } from '../../../../src/database-service';
import type { ResumeData } from '../../../../types';
import type { Suggestion } from '../types';
import { normalizeAnalysisMode } from '../analysis-mode';
import { resolveAnalysisTargetValue, shouldPersistTargetRole } from '../target-role';

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
      }, { touchUpdatedAt: false });
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

    const effectiveMode = normalizeAnalysisMode(
      baseResumeData.analysisMode || data.analysisMode
    );
    const effectiveTargetCompany = resolveAnalysisTargetValue({
      analysisMode: effectiveMode,
      stateTargetCompany: targetCompany,
      resumeTargetCompany: '',
      resumeTargetRole: baseResumeData.targetRole,
      resumeHasTargetRole: Object.prototype.hasOwnProperty.call(baseResumeData || {}, 'targetRole'),
    });

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
      targetCompany: effectiveTargetCompany || '',
      targetRole: effectiveTargetCompany || baseResumeData.targetRole || '',
    };
    const nextTargetRole = shouldPersistTargetRole({
      isInterviewMode: false,
      analysisMode: effectiveMode,
    })
      ? (effectiveTargetCompany || baseResumeData.targetRole || '')
      : (baseResumeData.targetRole || '');
    const nextSuggestions = Array.isArray(suggestionItems) ? suggestionItems : [];
    const dossier = {
      id: `dossier_${Date.now()}`,
      createdAt: snapshot.updatedAt,
      score: scoreValue,
      summary: reportData.summary || '',
      targetCompany: snapshot.targetCompany || '',
      targetRole: snapshot.targetRole || '',
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
      targetCompany: snapshot.targetCompany || '',
      targetRole: nextTargetRole,
    };
    if (setResumeData) {
      setResumeData(updatedResumeData);
    }
    await DatabaseService.updateResume(targetId, {
      resume_data: updatedResumeData,
    }, { touchUpdatedAt: false });
    return updatedResumeData;
  };

  return {
    persistAnalysisSnapshot,
    persistSuggestionsState,
  };
};
