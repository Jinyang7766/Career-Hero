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

const clampScore = (n: number) => Math.min(100, Math.max(0, Math.round(n)));

const weightedTotal = (b: { experience: number; skills: number; format: number }) =>
  b.experience * 0.4 + b.skills * 0.4 + b.format * 0.2;

const buildIndependentBreakdown = (
  resumeData: any,
  totalScore: number,
  rawBreakdown: any,
  missingKeywords: any[],
  suggestions: any[],
  weaknesses: any[],
) => {
  const normalizedRaw = {
    experience: Number(rawBreakdown?.experience || 0),
    skills: Number(rawBreakdown?.skills || 0),
    format: Number(rawBreakdown?.format || 0),
  };
  const rawRange = Math.max(normalizedRaw.experience, normalizedRaw.skills, normalizedRaw.format) -
    Math.min(normalizedRaw.experience, normalizedRaw.skills, normalizedRaw.format);
  const hasUsableRaw =
    normalizedRaw.experience > 0 &&
    normalizedRaw.skills > 0 &&
    normalizedRaw.format > 0 &&
    rawRange >= 6;
  if (hasUsableRaw) {
    return {
      experience: clampScore(normalizedRaw.experience),
      skills: clampScore(normalizedRaw.skills),
      format: clampScore(normalizedRaw.format),
    };
  }

  const score = clampScore(totalScore);
  const workCount = Array.isArray(resumeData?.workExps) ? resumeData.workExps.length : 0;
  const projectCount = Array.isArray(resumeData?.projects) ? resumeData.projects.length : 0;
  const skillCount = Array.isArray(resumeData?.skills) ? resumeData.skills.filter(Boolean).length : 0;
  const missingCount = Array.isArray(missingKeywords) ? missingKeywords.filter(Boolean).length : 0;
  const suggestionCount = Array.isArray(suggestions) ? suggestions.length : 0;
  const weaknessText = (Array.isArray(weaknesses) ? weaknesses : []).join(' ');
  const hasFormatIssue = /(格式|排版|结构|可读性|版式)/.test(weaknessText);

  let experience = score + (workCount >= 2 ? 4 : -2) + (projectCount >= 1 ? 2 : -1) - (missingCount >= 6 ? 3 : 0);
  let skills = score + (skillCount >= 8 ? 5 : skillCount >= 5 ? 2 : -4) - (missingCount >= 5 ? 4 : 0);
  let format = score + (hasFormatIssue ? -6 : 4) - (suggestionCount >= 10 ? 2 : 0);

  experience = clampScore(experience);
  skills = clampScore(skills);
  format = clampScore(format);

  // Ensure dimensions are not too close.
  let range = Math.max(experience, skills, format) - Math.min(experience, skills, format);
  if (range < 6) {
    const ranked = [
      { key: 'experience' as const, value: experience },
      { key: 'skills' as const, value: skills },
      { key: 'format' as const, value: format },
    ].sort((a, b) => a.value - b.value);
    const low = ranked[0].key;
    const high = ranked[2].key;
    const applyDelta = (k: 'experience' | 'skills' | 'format', delta: number) => {
      if (k === 'experience') experience = clampScore(experience + delta);
      if (k === 'skills') skills = clampScore(skills + delta);
      if (k === 'format') format = clampScore(format + delta);
    };
    applyDelta(low, -4);
    applyDelta(high, +4);
  }

  // Keep weighted total close to original score.
  const delta = score - weightedTotal({ experience, skills, format });
  experience = clampScore(experience + delta);

  return { experience, skills, format };
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
  let controller: AbortController | null = null;

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

    controller = new AbortController();
    analysisAbortRef.current = controller;
    const timeoutMs = 120000;
    const timeoutId = setTimeout(() => controller.abort('analysis_timeout'), timeoutMs);

    const masker = createMasker();
    const maskedResumeData = masker.maskObject(resumeData);
    const maskedJdText = masker.maskText(jdText || '');
    const ragEnabled = getRagEnabledFlag();

    let response: Response;
    try {
      console.info('[AI_ANALYZE] sending POST /api/ai/analyze', {
        runId,
        hasResumeData: Boolean(maskedResumeData),
        jdLength: String(maskedJdText || '').length,
        ragEnabled,
      });
      response = await fetch(buildApiUrl('/api/ai/analyze'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token.trim()}`
        },
        signal: controller.signal,
      body: JSON.stringify({
        resumeData: maskedResumeData,
        jobDescription: maskedJdText,
        analysisStage: 'pre_interview',
        ragEnabled,
        interviewType
      })
      });
      console.info('[AI_ANALYZE] response received', {
        runId,
        status: response.status,
        ok: response.ok,
      });
    } finally {
      clearTimeout(timeoutId);
    }

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
      analysisStage: String(unmaskedResult.analysisStage || 'pre_interview'),
      score: backendScore,
      scoreBreakdown: buildIndependentBreakdown(
        resumeData,
        backendScore,
        unmaskedResult.scoreBreakdown,
        unmaskedResult.missingKeywords || [],
        unmaskedResult.suggestions || [],
        unmaskedResult.weaknesses || [],
      ),
      suggestions: unmaskedResult.suggestions
    };

    await AICacheService.set(resumeData, jdText, analysisResult);
    return analysisResult;
  } catch (error: any) {
    const isAbort = String(error?.name || '') === 'AbortError';
    if (isAbort) {
      const reason = (controller as any)?.signal?.reason;
      console.warn('[AI_ANALYZE] aborted', { runId, reason: String(reason || '') });
      const normalizedReason = String(reason || '').toLowerCase();
      if (!normalizedReason || normalizedReason === 'analysis_timeout') {
        throw new Error('analysis_timeout');
      }
      throw new Error('analysis_cancelled');
    }
    console.error('AI Analysis Error:', error);
    throw error;
  } finally {
    if (analysisRunIdRef.current === runId) {
      analysisAbortRef.current = null;
    }
  }
};
