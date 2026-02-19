import { useEffect } from 'react';

type Params = {
  currentStep: string;
  jdText: string;
  resumeData: any;
  targetCompany: string;
  score: number;
  persistAnalysisSessionState: (
    state: 'jd_ready' | 'analyzing' | 'report_ready' | 'interview_in_progress' | 'interview_done',
    patch?: Partial<{
      jdText: string;
      targetCompany: string;
      score: number;
      step: string;
      force: boolean;
    }>
  ) => Promise<void> | void;
};

export const useAnalysisStepCheckpoint = ({
  currentStep,
  jdText,
  resumeData,
  targetCompany,
  score,
  persistAnalysisSessionState,
}: Params) => {
  useEffect(() => {
    const effectiveJdText = (jdText || resumeData?.lastJdText || '').trim();
    if (!effectiveJdText) return;
    if (currentStep === 'resume_select') return;

    const map: Record<
      string,
      {
        state: 'jd_ready' | 'analyzing' | 'report_ready' | 'interview_in_progress' | 'interview_done';
        step: string;
      }
    > = {
      jd_input: { state: 'jd_ready', step: 'jd_input' },
      analyzing: { state: 'analyzing', step: 'analyzing' },
      report: { state: 'report_ready', step: 'report' },
      micro_intro: { state: 'interview_in_progress', step: 'micro_intro' },
      chat: { state: 'interview_in_progress', step: 'chat' },
      interview_report: { state: 'interview_done', step: 'interview_report' },
      comparison: { state: 'interview_done', step: 'comparison' },
      final_report: { state: 'interview_done', step: 'final_report' },
    };
    const mapped = map[currentStep];
    if (!mapped) return;

    void persistAnalysisSessionState(mapped.state, {
      jdText: effectiveJdText,
      targetCompany: targetCompany || resumeData?.targetCompany || '',
      score,
      step: mapped.step,
      force: true,
    });
  }, [
    currentStep,
    jdText,
    persistAnalysisSessionState,
    resumeData?.lastJdText,
    resumeData?.targetCompany,
    score,
    targetCompany,
  ]);
};
