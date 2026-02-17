import { AICacheService } from '../../../src/ai-cache-service';
import type { MutableRefObject } from 'react';

type Params = {
  resumeData: any;
  jdText: string;
  getBackendAuthToken: () => Promise<string>;
  showToast: (msg: string, type?: 'info' | 'success' | 'error') => void;
  buildApiUrl: (path: string) => string;
  createMasker: () => {
    maskText: (text: string) => string;
    maskObject: (input: any) => any;
    unmaskObject: (input: any) => any;
  };
  getRagEnabledFlag: () => boolean;
  analysisAbortRef: MutableRefObject<AbortController | null>;
  analysisRunIdRef: MutableRefObject<string | null>;
  runId: string;
  setIsFromCache: (v: boolean) => void;
  interviewType?: string;
};

export const runRealAnalysis = async ({
  resumeData,
  jdText,
  getBackendAuthToken,
  showToast,
  buildApiUrl,
  createMasker,
  getRagEnabledFlag,
  analysisAbortRef,
  analysisRunIdRef,
  runId,
  setIsFromCache,
  interviewType,
}: Params) => {
  if (!resumeData) return null;

  try {
    console.log('Generating real AI analysis via backend API...');

    const cachedResult = await AICacheService.get(resumeData, jdText);
    if (cachedResult) {
      const cachedSummary = String(cachedResult.summary || '').trim();
      if (cachedSummary.length < 80) {
        console.log('Cached summary too short, bypassing cache and requesting fresh analysis');
      } else {
        console.log('🎯 Using cached AI analysis result');
        console.log(`📊 Cache stats: ${AICacheService.getHitRate()}% hit rate`);
        setIsFromCache(true);
        return cachedResult;
      }
    }
    setIsFromCache(false);

    const token = await getBackendAuthToken();
    if (!token) {
      showToast('登录已过期，请重新登录', 'error');
      window.location.href = '/login';
      return null;
    }

    const controller = new AbortController();
    analysisAbortRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    const masker = createMasker();
    const maskedResumeData = masker.maskObject(resumeData);
    const maskedJdText = masker.maskText(jdText || '');
    const ragEnabled = getRagEnabledFlag();

    const response = await fetch(buildApiUrl('/api/ai/analyze'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token.trim()}`
      },
      signal: controller.signal,
      body: JSON.stringify({
        resumeData: maskedResumeData,
        jobDescription: maskedJdText,
        ragEnabled,
        interviewType
      })
    });
    clearTimeout(timeoutId);

    if (response.status === 401) {
      throw new Error('鉴权失败，服务器不认这个 Token');
    }

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'AI分析请求失败');
    }

    const result = await response.json();
    const unmaskedResult = masker.unmaskObject(result);
    const backendScore = unmaskedResult.score || 0;

    const analysisResult = {
      summary: unmaskedResult.summary || 'AI分析完成',
      targetCompany: unmaskedResult.targetCompany || '',
      targetCompanyConfidence: Number(unmaskedResult.targetCompanyConfidence || 0),
      strengths: unmaskedResult.strengths || [],
      weaknesses: unmaskedResult.weaknesses || [],
      missingKeywords: unmaskedResult.missingKeywords,
      score: backendScore,
      scoreBreakdown: {
        experience: Math.round(backendScore * 0.4),
        skills: Math.round(backendScore * 0.4),
        format: Math.round(backendScore * 0.2)
      },
      suggestions: unmaskedResult.suggestions
    };

    await AICacheService.set(resumeData, jdText, analysisResult);
    return analysisResult;
  } catch (error) {
    console.error('AI Analysis Error:', error);
    throw error;
  } finally {
    if (analysisRunIdRef.current === runId) {
      analysisAbortRef.current = null;
    }
  }
};
