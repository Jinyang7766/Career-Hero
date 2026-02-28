import { useEffect, useRef } from 'react';
import { DatabaseService } from '../../../../src/database-service';

type Params = {
  currentStep: string;
  isFinalReportGenerating: boolean;
  jdText: string;
  makeJdKey: (v: string) => string;
  resumeData: any;
  resolvedFinalReport: any;
  setResumeData: (v: any) => void;
  targetCompany: string;
};

export const usePostInterviewFinalReportPersistence = ({
  currentStep,
  isFinalReportGenerating,
  jdText,
  makeJdKey,
  resumeData,
  resolvedFinalReport,
  setResumeData,
  targetCompany,
}: Params) => {
  const persistedFinalReportKeyRef = useRef<string>('');

  useEffect(() => {
    if (currentStep !== 'comparison' && currentStep !== 'final_report') return;
    if (!resolvedFinalReport || isFinalReportGenerating) return;
    const resumeId = String((resumeData as any)?.id || '').trim();
    if (!resumeId) return;
    const normalizedSummary = String(resolvedFinalReport.summary || '').trim();
    if (!normalizedSummary) return;
    const existingFinal = (resumeData as any)?.postInterviewFinalReport || {};
    const existingSummary = String(existingFinal?.summary || '').trim();
    const existingScore = Number(existingFinal?.score);
    const incomingScore = Number(resolvedFinalReport.score);
    const existingJdKey = makeJdKey(String(existingFinal?.jdText || '').trim());
    const incomingJdKey = makeJdKey(String(jdText || (resumeData as any)?.lastJdText || '').trim());
    if (
      existingSummary === normalizedSummary &&
      Number.isFinite(existingScore) &&
      Number.isFinite(incomingScore) &&
      Math.round(existingScore) === Math.round(incomingScore) &&
      existingJdKey === incomingJdKey
    ) {
      return;
    }

    const persistKey = [
      resumeId,
      String(resolvedFinalReport.score ?? ''),
      normalizedSummary.slice(0, 160),
      incomingJdKey,
    ].join('|');
    if (persistedFinalReportKeyRef.current === persistKey) return;
    persistedFinalReportKeyRef.current = persistKey;

    let cancelled = false;
    const run = async () => {
      try {
        const latest = await DatabaseService.getResume(resumeId);
        if (!latest.success || !latest.data) return;
        const baseResumeData = (latest.data.resume_data || {}) as any;
        const now = new Date().toISOString();
        const effectiveJdText = String(jdText || baseResumeData.lastJdText || '').trim();
        const effectiveTargetCompany = String(targetCompany || baseResumeData.targetCompany || '').trim();
        const weaknesses = Array.isArray(resolvedFinalReport.weaknesses)
          ? resolvedFinalReport.weaknesses.map((x: any) => String(x || '').trim()).filter(Boolean).slice(0, 10)
          : [];
        const suggestionsList = Array.isArray(resolvedFinalReport.suggestions)
          ? resolvedFinalReport.suggestions
          : [];
        const nextDossier = {
          id: `dossier_final_diagnosis_${Date.now()}`,
          createdAt: now,
          score: Number.isFinite(Number(resolvedFinalReport.score))
            ? Math.max(0, Math.min(100, Math.round(Number(resolvedFinalReport.score))))
            : 0,
          summary: normalizedSummary,
          targetCompany: effectiveTargetCompany,
          jdText: effectiveJdText,
          scoreBreakdown: baseResumeData?.analysisDossierLatest?.scoreBreakdown || {
            experience: 0,
            skills: 0,
            format: 0,
          },
          suggestionsOverview: {
            total: suggestionsList.length,
            actionable: suggestionsList.length,
          },
          strengths: Array.isArray(baseResumeData?.analysisDossierLatest?.strengths)
            ? baseResumeData.analysisDossierLatest.strengths
            : [],
          weaknesses,
          missingKeywords: Array.isArray(baseResumeData?.analysisDossierLatest?.missingKeywords)
            ? baseResumeData.analysisDossierLatest.missingKeywords
            : [],
        };
        const prevHistory = Array.isArray(baseResumeData?.analysisDossierHistory)
          ? baseResumeData.analysisDossierHistory
          : [];
        const updatedResumeData = {
          ...baseResumeData,
          analysisDossierLatest: nextDossier,
          analysisDossierHistory: [nextDossier, ...prevHistory].slice(0, 20),
          postInterviewFinalReport: {
            score: nextDossier.score,
            summary: normalizedSummary,
            advice: Array.isArray(resolvedFinalReport.advice) ? resolvedFinalReport.advice : weaknesses,
            weaknesses,
            suggestions: suggestionsList,
            generatedResume: resolvedFinalReport.generatedResume || null,
            updatedAt: now,
            jdText: effectiveJdText,
            targetCompany: effectiveTargetCompany,
          },
          lastJdText: effectiveJdText || baseResumeData.lastJdText || '',
          targetCompany: effectiveTargetCompany || baseResumeData.targetCompany || '',
        };
        const write = await DatabaseService.updateResume(
          resumeId,
          { resume_data: updatedResumeData },
          { touchUpdatedAt: false }
        );
        if (!write.success) {
          persistedFinalReportKeyRef.current = '';
          return;
        }
        if (!cancelled) {
          setResumeData({
            id: latest.data.id,
            ...updatedResumeData,
            resumeTitle: latest.data.title,
          });
        }
      } catch {
        persistedFinalReportKeyRef.current = '';
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [
    currentStep,
    isFinalReportGenerating,
    jdText,
    makeJdKey,
    resumeData,
    resolvedFinalReport,
    setResumeData,
    targetCompany,
  ]);
};
