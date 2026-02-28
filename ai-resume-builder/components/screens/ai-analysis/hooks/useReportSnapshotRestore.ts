import { useEffect } from 'react';
import { DatabaseService } from '../../../../src/database-service';

type Params = {
  currentStep: string;
  score: number;
  suggestionsLength: number;
  report: any;
  resumeData: any;
  loadLastAnalysis: () => any;
  applyAnalysisSnapshot: (snapshot: any) => boolean;
  setJdText: (value: string) => void;
  setTargetCompany: (value: string) => void;
  setAnalysisResumeId: (value: string | number | null) => void;
  setResumeData?: (value: any) => void;
  sourceResumeIdRef: { current: string | number | null };
};

export const useReportSnapshotRestore = ({
  currentStep,
  score,
  suggestionsLength,
  report,
  resumeData,
  loadLastAnalysis,
  applyAnalysisSnapshot,
  setJdText,
  setTargetCompany,
  setAnalysisResumeId,
  setResumeData,
  sourceResumeIdRef,
}: Params) => {
  useEffect(() => {
    if (currentStep !== 'final_report') return;
    if (score > 0 || suggestionsLength > 0 || report) return;

    const last = loadLastAnalysis();
    if (!last || !last.resumeId) return;
    const lastResumeId = String(last.resumeId);
    const currentResumeId = String(resumeData?.id || '');

    const applyFromSnapshot = () => {
      const snapshotApplied = applyAnalysisSnapshot(last.snapshot);
      if (!snapshotApplied) return;
      setJdText(last.jdText || '');
      if (last.targetCompany) {
        setTargetCompany(last.targetCompany);
      }
      setAnalysisResumeId(last.resumeId);
    };

    if (currentResumeId && currentResumeId === lastResumeId) {
      applyFromSnapshot();
      return;
    }

    DatabaseService.getResume(last.resumeId).then((result) => {
      // Resume was deleted: discard stale local snapshot to avoid ghost report restore.
      if (!result.success || !result.data) {
        try {
          localStorage.removeItem('ai_last_analysis_snapshot');
          localStorage.removeItem('ai_analysis_resume_id');
        } catch {
          // ignore
        }
        return;
      }

      const finalResumeData = {
        id: result.data.id,
        ...result.data.resume_data,
        resumeTitle: result.data.title
      };
      if (setResumeData) {
        sourceResumeIdRef.current = finalResumeData.optimizedFromId || finalResumeData.id;
        setResumeData(finalResumeData);
      }
      applyFromSnapshot();
    });
  }, [
    applyAnalysisSnapshot,
    currentStep,
    loadLastAnalysis,
    report,
    resumeData,
    score,
    setAnalysisResumeId,
    setJdText,
    setResumeData,
    setTargetCompany,
    sourceResumeIdRef,
    suggestionsLength,
  ]);
};
