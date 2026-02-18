import { useEffect, useRef, useState } from 'react';
import { createMasker, maskChatHistory } from '../chat-payload';

type Params = {
  currentStep: string;
  resumeData: any;
  postInterviewGeneratedResume: any;
  jdText: string;
  effectivePostInterviewSummary: string;
  finalReportSummary: string;
  finalReportScore: number;
  finalReportAdvice: string[];
  makeJdKey: (text: string) => string;
  userProfile: any;
  getRagEnabledFlag: () => boolean;
  getBackendAuthToken: () => Promise<string>;
  buildApiUrl: (path: string) => string;
  chatMessagesRef: { current: any[] };
};

export const useFinalDiagnosisReportGenerator = ({
  currentStep,
  resumeData,
  postInterviewGeneratedResume,
  jdText,
  effectivePostInterviewSummary,
  finalReportSummary,
  finalReportScore,
  finalReportAdvice,
  makeJdKey,
  userProfile,
  getRagEnabledFlag,
  getBackendAuthToken,
  buildApiUrl,
  chatMessagesRef,
}: Params) => {
  const [override, setOverride] = useState<{
    score: number;
    summary: string;
    advice: string[];
  } | null>(null);
  const requestKeyRef = useRef<string>('');

  useEffect(() => {
    if (currentStep !== 'final_report') return;
    const effectiveResume = (resumeData as any) || (postInterviewGeneratedResume as any);
    if (!effectiveResume) return;
    const effectiveJdText = String(jdText || (resumeData as any)?.lastJdText || '').trim();
    const baseSummary = String(effectivePostInterviewSummary || finalReportSummary || '').trim();
    const requestKey = [
      String((effectiveResume as any)?.id || ''),
      makeJdKey(effectiveJdText),
      baseSummary.slice(0, 160),
    ].join('|');
    if (!requestKey || requestKeyRef.current === requestKey) return;
    requestKeyRef.current = requestKey;

    let cancelled = false;
    const run = async () => {
      try {
        const token = await getBackendAuthToken();
        if (!token) return;
        const masker = createMasker();
        const maskedResumeData = masker.maskObject(effectiveResume);
        const maskedJdText = masker.maskText(effectiveJdText);
        const diagnosisDossier = (userProfile as any)?.analysis_dossier_latest || (resumeData as any)?.analysisDossierLatest || null;
        const resp = await fetch(buildApiUrl('/api/ai/analyze'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token.trim()}`,
          },
          body: JSON.stringify({
            resumeData: maskedResumeData,
            jobDescription: maskedJdText,
            analysisStage: 'final_report',
            ragEnabled: getRagEnabledFlag(),
            interviewSummary: masker.maskText(baseSummary),
            chatHistory: maskChatHistory(chatMessagesRef.current || [], masker.maskText),
            diagnosisDossier: diagnosisDossier ? masker.maskObject(diagnosisDossier) : null,
          }),
        });
        if (!resp.ok) throw new Error(`final_report_generate_failed_${resp.status}`);
        const payload = await resp.json().catch(() => ({} as any));
        const result = masker.unmaskObject(payload || {});
        if (cancelled) return;
        const summary = String(result?.summary || '').trim();
        const scoreNum = Number(result?.score);
        const scoreValue = Number.isFinite(scoreNum)
          ? Math.max(0, Math.min(100, Math.round(scoreNum)))
          : finalReportScore;
        const advice = (Array.isArray(result?.weaknesses) ? result.weaknesses : finalReportAdvice)
          .map((x: any) => String(x || '').trim())
          .filter(Boolean)
          .slice(0, 6);
        if (summary) {
          setOverride({
            score: scoreValue,
            summary,
            advice,
          });
        }
      } catch (err) {
        console.warn('Failed to generate final diagnosis report via API:', err);
        requestKeyRef.current = '';
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [
    currentStep,
    resumeData,
    postInterviewGeneratedResume,
    jdText,
    effectivePostInterviewSummary,
    finalReportSummary,
    finalReportScore,
    finalReportAdvice,
    makeJdKey,
    userProfile,
    getRagEnabledFlag,
    getBackendAuthToken,
    buildApiUrl,
    chatMessagesRef,
  ]);

  return override;
};

