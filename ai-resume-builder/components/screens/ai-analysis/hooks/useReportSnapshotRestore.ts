import { useEffect } from 'react';
import { makeNormalizedJdKey } from '../id-utils';

export const resolveRestoredAnalysisTarget = (snapshotLike: any): string =>
  String(snapshotLike?.targetRole || '').trim();

export const canRestoreAnalysisSnapshot = ({
  currentResumeId,
  lastResumeId,
  currentJdText,
  lastJdText,
}: {
  currentResumeId: string;
  lastResumeId: string;
  currentJdText: string;
  lastJdText: string;
}): boolean => {
  if (!currentResumeId || !lastResumeId || currentResumeId !== lastResumeId) return false;
  return makeNormalizedJdKey(currentJdText) === makeNormalizedJdKey(lastJdText);
};

type Params = {
  currentStep: string;
  score: number;
  suggestionsLength: number;
  report: any;
  resumeData: any;
  jdText: string;
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
  jdText,
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
    const currentJdText = String(jdText || '').trim();
    const snapshotJdText = String(last.jdText || '').trim();

    if (!canRestoreAnalysisSnapshot({
      currentResumeId,
      lastResumeId,
      currentJdText,
      lastJdText: snapshotJdText,
    })) {
      return;
    }

    const snapshotApplied = applyAnalysisSnapshot(last.snapshot);
    if (!snapshotApplied) return;

    setJdText(snapshotJdText);
    const restoredTarget = resolveRestoredAnalysisTarget(last);
    if (restoredTarget) {
      setTargetCompany(restoredTarget);
    }
    setAnalysisResumeId(last.resumeId);

    // keep refs touched for backwards compatibility with existing call sites
    void setResumeData;
    void sourceResumeIdRef;
  }, [
    applyAnalysisSnapshot,
    currentStep,
    jdText,
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
