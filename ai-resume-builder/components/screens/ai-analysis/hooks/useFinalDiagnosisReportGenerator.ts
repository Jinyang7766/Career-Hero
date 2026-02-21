import { useEffect, useRef, useState } from 'react';
import { createMasker, maskChatHistory } from '../chat-payload';
import type { QuotaKind } from './useUsageQuota';

const FINAL_REPORT_TASKS = new Map<string, Promise<any>>();
const FINAL_REPORT_RESULTS = new Map<string, {
  score: number;
  summary: string;
  advice: string[];
  weaknesses: string[];
  suggestions: any[];
  generatedResume?: any | null;
}>();
const FINAL_REPORT_CACHE_VERSION = 'candidate_match_v3';
const FINAL_REPORT_BYPASS_ONCE_KEY = 'ai_final_report_bypass_cache_once';

const normalizeSkillToken = (value: any) => String(value || '').trim().replace(/[，,;；。]+$/g, '');
const isResumeWordingAdvice = (text: string) => /(简历|措辞|排版|描述|模块|字数|版式|润色|改写|优化文案)/.test(text);
const rewriteToCandidateAction = (text: string) => {
  const source = String(text || '').trim();
  if (!source) return '';
  if (/数据|量化|指标|贡献|证据/.test(source)) {
    return '补强数据化表达能力：围绕 2-3 个核心项目沉淀“动作-结果-指标”证据链，并进行口头复盘训练。';
  }
  if (/工具|技能栈|商智|生意参谋|sql|python|bi|tableau|power\s*bi/i.test(source)) {
    return '补强岗位关键工具能力：列出目标岗位核心工具清单，按“实战任务 + 结果复盘”方式逐项强化。';
  }
  if (/自我介绍|表达|沟通|逻辑/.test(source)) {
    return '补强面试表达能力：用 STAR 结构重练自我介绍和高频追问，重点提升逻辑清晰度与业务说服力。';
  }
  return '补强岗位胜任能力：针对目标岗位关键任务补充真实案例，并通过模拟面试持续验证。';
};
const extractSkillGapAdvice = (result: any, fallback: string[]) => {
  const fromSuggestions: string[] = [];
  const suggestions = Array.isArray(result?.suggestions) ? result.suggestions : [];
  suggestions.forEach((item: any) => {
    if (String(item?.targetSection || '').trim().toLowerCase() !== 'skills') return;
    const raw = item?.suggestedValue;
    const skills = Array.isArray(raw)
      ? raw.map(normalizeSkillToken).filter(Boolean)
      : String(raw || '')
        .split(/[、,，\n/]/)
        .map(normalizeSkillToken)
        .filter(Boolean);
    if (!skills.length) return;
    fromSuggestions.push(`补强关键技能：优先强化 ${skills.slice(0, 3).join('、')}，每项至少准备 1 个可验证项目案例用于面试证明。`);
  });

  const missingKeywords = Array.isArray(result?.missingKeywords)
    ? result.missingKeywords.map(normalizeSkillToken).filter(Boolean)
    : [];
  const topMissingKeywords = Array.from(new Set(missingKeywords)).slice(0, 3);
  const fromMissing = topMissingKeywords.length > 0
    ? [
      `补齐能力缺口：围绕“${topMissingKeywords.join('”、“')}”完成专题学习与实战复盘，形成可量化成果。`,
    ]
    : [];

  const fromWeaknesses = (Array.isArray(result?.weaknesses) ? result.weaknesses : fallback)
    .map((x: any) => String(x || '').trim())
    .filter(Boolean)
    .map((line: string) => (isResumeWordingAdvice(line) ? rewriteToCandidateAction(line) : line));

  return Array.from(new Set([...fromSuggestions, ...fromMissing, ...fromWeaknesses])).slice(0, 6);
};

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
  consumeUsageQuota?: (kind: QuotaKind, context?: { scenario?: string; mode?: string }) => Promise<boolean>;
  refundUsageQuota?: (kind: QuotaKind, note?: string) => Promise<boolean>;
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
  consumeUsageQuota,
  refundUsageQuota,
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

  const hashText = (text: string) => {
    const normalized = String(text || '').trim();
    if (!normalized) return 'empty';
    let hash = 0;
    for (let i = 0; i < normalized.length; i += 1) {
      hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
    }
    return `${normalized.length}_${hash.toString(16)}`;
  };

  const makeCacheKey = (requestKey: string) => {
    const uid = String(currentUserId || 'anon').trim() || 'anon';
    return `final_report_result:${FINAL_REPORT_CACHE_VERSION}:${uid}:${requestKey}`;
  };
  const makeChargeKey = (requestKey: string) => {
    const uid = String(currentUserId || 'anon').trim() || 'anon';
    return `final_report_charge:${FINAL_REPORT_CACHE_VERSION}:${uid}:${requestKey}`;
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
    const summaryFingerprint = hashText(baseSummary);
    const requestKey = [
      String((effectiveResume as any)?.id || ''),
      makeJdKey(effectiveJdText),
      summaryFingerprint,
    ].join('|');
    if (!requestKey) return;

    let bypassCacheOnce = false;
    try {
      bypassCacheOnce = localStorage.getItem(FINAL_REPORT_BYPASS_ONCE_KEY) === '1';
      if (bypassCacheOnce) {
        localStorage.removeItem(FINAL_REPORT_BYPASS_ONCE_KEY);
      }
    } catch {
      bypassCacheOnce = false;
    }

    if (requestKeyRef.current === requestKey && !bypassCacheOnce) return;
    requestKeyRef.current = requestKey;

    if (bypassCacheOnce) {
      setOverride(null);
      setIsGenerating(false);
    }

    const persistedReport = (resumeData as any)?.postInterviewFinalReport;
    if (!bypassCacheOnce && persistedReport && typeof persistedReport === 'object') {
      const persistedSummary = String(persistedReport?.summary || '').trim();
      const persistedScoreNum = Number(persistedReport?.score);
      const persistedJdText = String(persistedReport?.jdText || '').trim();
      const persistedJdKey = makeJdKey(persistedJdText || '');
      const effectiveJdKey = makeJdKey(effectiveJdText || '');
      const jdMatched = !effectiveJdText || persistedJdKey === effectiveJdKey;
      if (persistedSummary && Number.isFinite(persistedScoreNum) && jdMatched) {
        const persistedWeaknesses = Array.isArray(persistedReport?.weaknesses)
          ? persistedReport.weaknesses
          : [];
        const persistedAdvice = Array.isArray(persistedReport?.advice)
          ? persistedReport.advice
          : persistedWeaknesses;
        const persistedSuggestions = Array.isArray(persistedReport?.suggestions)
          ? persistedReport.suggestions
          : [];
        const hydratedAdvice = extractSkillGapAdvice(
          { suggestions: persistedSuggestions, weaknesses: persistedWeaknesses },
          persistedAdvice.map((x: any) => String(x || '').trim()).filter(Boolean).slice(0, 6)
        );
        const hydrated = {
          score: Math.max(0, Math.min(100, Math.round(persistedScoreNum))),
          summary: persistedSummary,
          advice: hydratedAdvice,
          weaknesses: persistedWeaknesses.map((x: any) => String(x || '').trim()).filter(Boolean).slice(0, 6),
          suggestions: persistedSuggestions,
          generatedResume: persistedReport?.generatedResume && typeof persistedReport.generatedResume === 'object'
            ? persistedReport.generatedResume
            : null,
        };
        setOverride(hydrated);
        setIsGenerating(false);
        writeCachedResult(requestKey, hydrated);
        return;
      }
    }

    const cached = bypassCacheOnce ? null : readCachedResult(requestKey);
    if (cached) {
      setOverride(cached);
      setIsGenerating(false);
      return;
    }

    const existingTask = bypassCacheOnce ? null : FINAL_REPORT_TASKS.get(requestKey);
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
      const chargeKey = makeChargeKey(requestKey);
      try {
        const charged = localStorage.getItem(chargeKey) === '1';
        if (!charged && consumeUsageQuota) {
          const allowed = await consumeUsageQuota('final_report');
          if (!allowed) return null;
          localStorage.setItem(chargeKey, '1');
        }
      } catch {
        // ignore storage failures
      }
      const masker = createMasker();
      const maskedResumeData = masker.maskObject(effectiveResume);
      const maskedJdText = masker.maskText(effectiveJdText);
      const candidateFocusedSummaryPrompt = [
        baseSummary,
        '输出要求：请给出候选人综合评价，并提供 3-5 条候选人后续提升建议（如面试表达、业务能力、项目复盘、沟通协作等），不要输出简历排版或措辞修改建议。'
      ]
        .map((x) => String(x || '').trim())
        .filter(Boolean)
        .join('\n');
      const resumeDossier = (resumeData as any)?.analysisDossierLatest || null;
      const resumeDossierJdKey = makeJdKey(String((resumeDossier as any)?.jdText || '').trim());
      const effectiveJdKey = makeJdKey(effectiveJdText);
      const diagnosisDossier = resumeDossier && (!effectiveJdText || resumeDossierJdKey === effectiveJdKey)
        ? resumeDossier
        : null;
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
          interviewSummary: masker.maskText(candidateFocusedSummaryPrompt),
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
      const candidateAdvice = extractSkillGapAdvice(result, weaknesses);
      const suggestions = Array.isArray(result?.suggestions) ? result.suggestions : [];
      const generatedResume = result?.resumeData && typeof result.resumeData === 'object'
        ? result.resumeData
        : null;
      return {
        score: scoreValue,
        summary,
        advice: candidateAdvice,
        weaknesses,
        suggestions,
        generatedResume,
      };
    };

    const runWithRefund = async () => {
      try {
        return await run();
      } catch (err) {
        const chargeKey = makeChargeKey(requestKey);
        try {
          if (localStorage.getItem(chargeKey) === '1' && refundUsageQuota) {
            await refundUsageQuota('final_report', '最终报告生成失败返还积分');
            localStorage.removeItem(chargeKey);
          }
        } catch {
          // ignore refund/storage failure here
        }
        throw err;
      }
    };

    const task = runWithRefund()
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
