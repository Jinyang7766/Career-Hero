import { useEffect, useRef, useState } from 'react';
import { createMasker, maskChatHistory } from '../chat-payload';

const FINAL_REPORT_TASKS = new Map<string, Promise<any>>();
const FINAL_REPORT_RESULTS = new Map<string, {
  score: number;
  summary: string;
  advice: string[];
  weaknesses: string[];
  suggestions: any[];
  generatedResume?: any | null;
}>();

type Params = {
  currentUserId?: string;
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
  currentUserId,
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
    weaknesses: string[];
    suggestions: any[];
    generatedResume?: any | null;
  } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const requestKeyRef = useRef<string>('');

  const makeCacheKey = (requestKey: string) => {
    const uid = String(currentUserId || 'anon').trim() || 'anon';
    return `final_report_result:${uid}:${requestKey}`;
  };

  const readCachedResult = (requestKey: string) => {
    if (FINAL_REPORT_RESULTS.has(requestKey)) {
      return FINAL_REPORT_RESULTS.get(requestKey) || null;
    }
    try {
      const raw = localStorage.getItem(makeCacheKey(requestKey));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      FINAL_REPORT_RESULTS.set(requestKey, parsed);
      return parsed;
    } catch {
      return null;
    }
  };

  const writeCachedResult = (requestKey: string, value: any) => {
    FINAL_REPORT_RESULTS.set(requestKey, value);
    try {
      localStorage.setItem(makeCacheKey(requestKey), JSON.stringify(value));
    } catch { }
  };

  useEffect(() => {
    if (currentStep !== 'comparison' && currentStep !== 'final_report') return;
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
    const cached = readCachedResult(requestKey);
    if (cached) {
      setOverride(cached);
      setIsGenerating(false);
      return;
    }

    const existingTask = FINAL_REPORT_TASKS.get(requestKey);
    if (existingTask) {
      setIsGenerating(true);
      existingTask
        .then((result) => {
          if (result) setOverride(result);
        })
        .finally(() => {
          setIsGenerating(false);
        });
      return;
    }

    const run = async () => {
      const token = await getBackendAuthToken();
      if (!token) return null;
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
      const summary = String(result?.summary || '').trim();
      const scoreNum = Number(result?.score);
      const scoreValue = Number.isFinite(scoreNum)
        ? Math.max(0, Math.min(100, Math.round(scoreNum)))
        : finalReportScore;
      const weaknesses = (Array.isArray(result?.weaknesses) ? result.weaknesses : finalReportAdvice)
        .map((x: any) => String(x || '').trim())
        .filter(Boolean)
        .slice(0, 6);
      const suggestions = Array.isArray(result?.suggestions) ? result.suggestions : [];
      const generatedResume = result?.resumeData && typeof result.resumeData === 'object'
        ? result.resumeData
        : null;
      return {
        score: scoreValue,
        summary,
        advice: weaknesses,
        weaknesses,
        suggestions,
        generatedResume,
      };
    };

    const task = run()
      .then((result) => {
        if (result) writeCachedResult(requestKey, result);
        return result;
      })
      .catch((err) => {
        console.warn('Failed to generate final diagnosis report via API:', err);
        requestKeyRef.current = '';
        return null;
      })
      .finally(() => {
        FINAL_REPORT_TASKS.delete(requestKey);
      });

    FINAL_REPORT_TASKS.set(requestKey, task);
    setIsGenerating(true);
    task
      .then((result) => {
        if (result) setOverride(result);
      })
      .finally(() => {
        setIsGenerating(false);
      });
  }, [
    currentUserId,
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

  return { override, isGenerating };
};
