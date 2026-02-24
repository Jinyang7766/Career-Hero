import { createMasker } from './chat-payload';
import { runRealAnalysis } from './analysis-api';

type RunAnalysisRequestParams = {
  interviewType?: string;
  resumeData: any;
  jdText: string;
  getBackendAuthToken: () => Promise<string>;
  showToast: (msg: string, type?: 'info' | 'success' | 'error', durationMs?: number) => void;
  buildApiUrl: (path: string) => string;
  getRagEnabledFlag: () => boolean;
  analysisAbortRef: { current: AbortController | null };
  analysisRunIdRef: { current: string | null };
  runId: string;
  setIsFromCache: (value: boolean) => void;
  bypassCache?: boolean;
};

export const runRealAnalysisRequest = async ({
  interviewType,
  resumeData,
  jdText,
  getBackendAuthToken,
  showToast,
  buildApiUrl,
  getRagEnabledFlag,
  analysisAbortRef,
  analysisRunIdRef,
  runId,
  setIsFromCache,
  bypassCache,
}: RunAnalysisRequestParams) => {
  return runRealAnalysis({
    interviewType,
    resumeData,
    jdText,
    getBackendAuthToken,
    showToast,
    buildApiUrl,
    createMasker,
    getRagEnabledFlag,
    analysisAbortRef: analysisAbortRef as any,
    analysisRunIdRef: analysisRunIdRef as any,
    runId,
    setIsFromCache,
    bypassCache: !!bypassCache,
  });
};
