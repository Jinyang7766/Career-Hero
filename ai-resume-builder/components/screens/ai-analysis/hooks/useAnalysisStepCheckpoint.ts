import { useEffect, useRef } from 'react';
import { getActiveInterviewFocus, getActiveInterviewMode, getActiveInterviewType } from '../interview-plan-utils';
import { makeJdKey } from '../id-utils';
import { normalizeAnalysisMode, type AnalysisMode } from '../analysis-mode';
import { resolveAnalysisTargetValue } from '../target-role';
import { pushRuntimeTrace } from '../../../../src/runtime-diagnostics';

type Params = {
  currentStep: string;
  jdText: string;
  resumeData: any;
  targetCompany: string;
  analysisMode?: AnalysisMode;
  score: number;
  isInterviewMode?: boolean;
  persistAnalysisSessionState: (
    state: 'jd_ready' | 'analyzing' | 'report_ready' | 'interview_in_progress' | 'interview_done',
    patch?: Partial<{
      jdText: string;
      targetCompany: string;
      targetRole: string;
      score: number;
      step: string;
      analysisMode: AnalysisMode;
      force: boolean;
    }>
  ) => Promise<void> | void;
};

export const resolveCheckpointTargetRole = ({
  isInterviewMode = false,
  effectiveTargetCompany,
  resumeData,
}: {
  isInterviewMode?: boolean;
  effectiveTargetCompany: string;
  resumeData: any;
}) =>
  isInterviewMode
    ? String((resumeData as any)?.targetRole || '').trim()
    : String(effectiveTargetCompany || resumeData?.targetRole || '').trim();

export const useAnalysisStepCheckpoint = ({
  currentStep,
  jdText,
  resumeData,
  targetCompany,
  analysisMode,
  score,
  isInterviewMode = false,
  persistAnalysisSessionState,
}: Params) => {
  const lastCheckpointRef = useRef<string>('');

  useEffect(() => {
    const effectiveAnalysisMode = normalizeAnalysisMode(analysisMode || resumeData?.analysisMode);
    const effectiveJdText = (!isInterviewMode && effectiveAnalysisMode === 'generic')
      ? ''
      : String(jdText || '').trim();
    const effectiveTargetCompany = isInterviewMode
      ? String(targetCompany || resumeData?.targetRole || resumeData?.targetCompany || '').trim()
      : resolveAnalysisTargetValue({
          analysisMode: effectiveAnalysisMode,
          stateTargetCompany: targetCompany,
          resumeTargetCompany: '',
          resumeTargetRole: resumeData?.targetRole,
          resumeHasTargetRole: Object.prototype.hasOwnProperty.call(resumeData || {}, 'targetRole'),
        });
    const effectiveTargetRole = resolveCheckpointTargetRole({
      isInterviewMode,
      effectiveTargetCompany,
      resumeData,
    });
    if (!effectiveJdText && !isInterviewMode) return;
    if (currentStep === 'resume_select') return;

    const map: Record<
      string,
      {
        state: 'jd_ready' | 'analyzing' | 'report_ready' | 'interview_in_progress' | 'interview_done';
        step: string;
      }
    > = {
      jd_input: { state: 'jd_ready', step: 'jd_input' },
      interview_scene: { state: 'jd_ready', step: 'interview_scene' },
      analyzing: { state: 'analyzing', step: 'analyzing' },
      chat: { state: 'interview_in_progress', step: 'chat' },
      interview_report: { state: 'interview_done', step: 'interview_report' },
      comparison: { state: 'interview_done', step: 'comparison' },
      final_report: {
        state: isInterviewMode ? 'interview_done' : 'report_ready',
        step: 'final_report',
      },
    };
    const mapped = map[currentStep];
    if (!mapped) return;

    // Interview flow guard:
    // Once a scene is started, returning to entry step must not downgrade state to jd_ready,
    // otherwise "继续面试" and scene lock will be lost.
    if (isInterviewMode && mapped.state === 'jd_ready') {
      const normalizedType = String(getActiveInterviewType() || '').trim().toLowerCase();
      const normalizedMode = String(getActiveInterviewMode() || '').trim().toLowerCase();
      const normalizedFocus = String(getActiveInterviewFocus() || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const normalizedCompany = String(effectiveTargetCompany || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const normalizedResumeId = String((resumeData as any)?.id || '').trim();
      const jdKey = makeJdKey(effectiveJdText || '__no_jd__');
      const sessions = Object.values((resumeData as any)?.analysisSessionByJd || {}) as any[];
      const hasStartedSession = sessions.some((session: any) => {
        if (!session) return false;
        const state = String(session?.state || '').trim().toLowerCase();
        if (state !== 'interview_in_progress' && state !== 'paused' && state !== 'interview_done') return false;
        const sessionJdKey =
          String(session?.jdKey || '').trim() ||
          makeJdKey(String(session?.jdText || '').trim() || '__no_jd__');
        if (sessionJdKey !== jdKey) return false;
        const sessionType = String(session?.interviewType || '').trim().toLowerCase();
        const sessionMode = String(session?.interviewMode || '').trim().toLowerCase();
        const sessionFocus = String(session?.interviewFocus || '').trim().toLowerCase().replace(/\s+/g, ' ');
        const sessionCompany = String(session?.targetRole || session?.targetCompany || '').trim().toLowerCase().replace(/\s+/g, ' ');
        const sessionResumeId = String(session?.resumeId || '').trim();
        return (
          sessionType === normalizedType &&
          sessionMode === normalizedMode &&
          sessionFocus === normalizedFocus &&
          sessionCompany === normalizedCompany &&
          (!sessionResumeId || sessionResumeId === normalizedResumeId)
        );
      });
      if (hasStartedSession) return;
    }

    const checkpointKey = [
      String((resumeData as any)?.id || ''),
      mapped.state,
      mapped.step,
      effectiveJdText,
      String(effectiveTargetCompany || ''),
      String(effectiveTargetRole || ''),
      String(typeof score === 'number' ? score : ''),
    ].join('|');
    if (lastCheckpointRef.current === checkpointKey) return;
    lastCheckpointRef.current = checkpointKey;
    pushRuntimeTrace('ai_analysis.checkpoint', 'persist_session_state', {
      step: currentStep,
      state: mapped.state,
      jdLen: effectiveJdText.length,
      hasCompany: Boolean(String(effectiveTargetCompany || '').trim()),
      hasTargetRole: Boolean(String(effectiveTargetRole || '').trim()),
      score: Number(score || 0),
    });

    void persistAnalysisSessionState(mapped.state, {
      jdText: effectiveJdText,
      targetCompany: effectiveTargetCompany,
      targetRole: effectiveTargetRole,
      analysisMode: effectiveAnalysisMode,
      score,
      step: mapped.step,
      force: true,
    });
  }, [
    currentStep,
    jdText,
    resumeData?.lastJdText,
    resumeData?.analysisMode,
    resumeData?.id,
    resumeData?.targetCompany,
    resumeData?.targetRole,
    analysisMode,
    score,
    targetCompany,
    isInterviewMode,
  ]);
};
