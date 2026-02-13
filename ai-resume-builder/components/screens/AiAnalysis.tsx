import React, { useState, useEffect, useRef } from 'react';
import { ScreenProps, ResumeData, View } from '../../types';
import { DatabaseService } from '../../src/database-service';
import { supabase } from '../../src/supabase-client';
import { AICacheService } from '../../src/ai-cache-service';
import { buildApiUrl } from '../../src/api-config';

interface Suggestion {
  id: string;
  type: 'optimization' | 'grammar' | 'missing';
  title: string;
  reason: string;
  targetSection: 'personalInfo' | 'workExps' | 'skills' | 'projects' | 'educations' | 'summary';
  targetId?: number;
  targetField?: string;
  suggestedValue: any;
  originalValue?: string;
  status: 'pending' | 'accepted' | 'ignored';
  rating?: 'up' | 'down';
}

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  suggestion?: Suggestion; // Embedded suggestion for interactive chat
}

interface ScoreBreakdown {
  experience: number;
  skills: number;
  format: number;
}

interface AnalysisReport {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  missingKeywords: string[];
  scoreBreakdown: ScoreBreakdown;
}

type Step = 'resume_select' | 'jd_input' | 'analyzing' | 'report' | 'chat' | 'comparison';
type ResumeReadState = {
  status: 'idle' | 'loading' | 'success' | 'error';
  message: string;
};

const AiAnalysis: React.FC<ScreenProps> = ({ setCurrentView, resumeData, setResumeData, allResumes, loadUserResumes, goBack }) => {
  const SCORE_WEIGHTS = { experience: 0.4, skills: 0.4, format: 0.2 } as const;

  const normalizeScoreBreakdown = (raw: ScoreBreakdown, totalScore?: number): ScoreBreakdown => {
    if (!raw) return { experience: 0, skills: 0, format: 0 };

    const sum = (raw.experience || 0) + (raw.skills || 0) + (raw.format || 0);
    const maxExpected = {
      experience: Math.round(SCORE_WEIGHTS.experience * 100),
      skills: Math.round(SCORE_WEIGHTS.skills * 100),
      format: Math.round(SCORE_WEIGHTS.format * 100),
    };

    const looksLikeContrib =
      sum > 0 &&
      sum <= 100 &&
      (totalScore ? Math.abs(sum - totalScore) <= 3 : true) &&
      raw.experience <= maxExpected.experience &&
      raw.skills <= maxExpected.skills &&
      raw.format <= maxExpected.format;

    if (!looksLikeContrib) {
      return {
        experience: Math.min(100, Math.max(0, Math.round(raw.experience || 0))),
        skills: Math.min(100, Math.max(0, Math.round(raw.skills || 0))),
        format: Math.min(100, Math.max(0, Math.round(raw.format || 0))),
      };
    }

    const toDimScore = (value: number, weight: number) =>
      Math.min(100, Math.max(0, Math.round((value || 0) / weight)));

    return {
      experience: toDimScore(raw.experience || 0, SCORE_WEIGHTS.experience),
      skills: toDimScore(raw.skills || 0, SCORE_WEIGHTS.skills),
      format: toDimScore(raw.format || 0, SCORE_WEIGHTS.format),
    };
  };
  const clampScore = (value: number) => Math.min(100, Math.max(0, Math.round(value || 0)));
  const calcTotalFromBreakdown = (b: ScoreBreakdown) =>
    clampScore((b.experience || 0) * SCORE_WEIGHTS.experience + (b.skills || 0) * SCORE_WEIGHTS.skills + (b.format || 0) * SCORE_WEIGHTS.format);
  const resolveDisplayScore = (rawScore: number, breakdown: ScoreBreakdown) => {
    const hasBreakdown =
      (breakdown?.experience || 0) > 0 ||
      (breakdown?.skills || 0) > 0 ||
      (breakdown?.format || 0) > 0;
    return hasBreakdown ? calcTotalFromBreakdown(breakdown) : clampScore(rawScore);
  };
  const sanitizeSuggestedValue = (value: any, targetSection?: Suggestion['targetSection']) => {
    if (targetSection === 'skills') return value;
    if (typeof value !== 'string') return value;

    let text = value.trim();
    if (!text) return value;

    // Remove leading advisory/prefix phrases so the result is directly usable in resume
    const prefixPatterns = [
      /^精炼描述为[:：]\s*/i,
      /^修改建议[:：]\s*/i,
      /^优化建议[:：]\s*/i,
      /^建议[:：]\s*/i,
      /^修改原因[:：]\s*/i,
      /^原因[:：]\s*/i,
      /^说明[:：]\s*/i,
      /^请将[:：]?\s*/i,
      /^请把[:：]?\s*/i,
      /^请删除[:：]?\s*/i,
      /^请去掉[:：]?\s*/i
    ];
    prefixPatterns.forEach((pattern) => {
      text = text.replace(pattern, '');
    });

    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length > 1 && /(建议|原因|说明|修改|优化|请)/.test(lines[0])) {
      return lines.slice(1).join('\n').trim();
    }

    if (/^(建议|修改建议|修改原因|原因|说明|请|请将|请把|请删除|请去掉)/.test(text) && /[:：]/.test(text)) {
      return text.replace(/^[^:：]{0,20}[:：]\s*/, '').trim();
    }

    return text;
  };
  const sanitizeReasonText = (value: any) => {
    let text = String(value ?? '').trim();
    if (!text) return '';
    text = text
      .replace(/;/g, '；')
      .replace(/([。！？；，])\s*[；，。！？]+/g, '$1')
      .replace(/([。！？；，]){2,}/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
    return text;
  };
  const normalizeSkillToken = (raw: any) => {
    const text = String(raw ?? '')
      .replace(/[•·]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) return '';
    return text;
  };
  const toNounSkillToken = (raw: string) => {
    let t = raw.trim();
    if (!t) return '';

    // 去掉常见动作词/过程词，尽量保留“工具/技术/方法”名词
    const actionWords = [
      '搭建', '构建', '设计', '训练', '微调', '精调', '调优', '优化', '执行', '推进', '落地', '管理',
      '脚本', '自动化', '开发', '实现', '运营', '打造', '分析', '监控', '维护', '产出'
    ];
    actionWords.forEach((w) => {
      t = t.replace(new RegExp(w, 'g'), '');
    });

    // 清理尾部连接词，避免“模型与”“流程和”这类残留
    t = t
      .replace(/[与和及、,\s]+$/g, '')
      .replace(/^[与和及、,\s]+/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // 删除仅剩动作残片（如“精调”“优化”“自动化”）
    if (/^(微调|精调|调优|优化|自动化|搭建|构建|设计|训练|开发|实现|运营|管理)$/.test(t)) {
      return '';
    }

    // 语义归一：把泛化表达转成更硬核名词；若无法落到硬技能则在后续过滤
    t = t
      .replace(/智能化数据看板/g, '数据可视化')
      .replace(/数据看板/g, '数据可视化')
      .replace(/AI短视频分镜/g, '短视频内容策划');

    return t;
  };
  const isProfessionalSkillToken = (token: string) => {
    const t = token.trim();
    if (!t || t.length < 2) return false;

    const keepPatterns = [
      /^(sql|python|java|javascript|typescript|excel|tableau|power\s?bi|scrm|crm|ltv|roi|cpc|cpa|cpm|gmv|erp|wms|sap|vba|ga4|seo|sem|a\/b\s?test|ab\s?test)$/i,
      /(生意参谋|京东商智|万相台|直通车|引力魔方|京东快车|千川|巨量引擎|飞书|钉钉|notion|chatgpt|zapier|make|airtable|supabase|photoshop|figma)/i,
      /(数据分析|数据建模|数据可视化|用户分层|增长模型|库存预测|供应链scm|供应链管理|定价模型)/i
    ];
    if (keepPatterns.some((p) => p.test(t))) return true;

    const rejectPatterns = [
      /(全链路|运营|打法|策略|构建|打造|推进|落地|执行|管理|策划|复盘|对接|沟通|协同|增长|提效|优化|闭环|主导|负责)/,
      /(直播间|店群|主播|私域|社群)/,
      /(体系|方案|流程|SOP)/i,
      /^(与|和|及).*/,
      /(微调|精调|调优|自动化)$/,
      /(短视频分镜|内容策划|智能化|看板)$/
    ];
    if (rejectPatterns.some((p) => p.test(t))) return false;

    // 默认保留更像“名词型工具/技术”的短词，过滤长句型表述
    return t.length <= 12;
  };
  const toSkillList = (value: any): string[] => {
    const rawList = Array.isArray(value)
      ? value
      : String(value ?? '')
        .split(/[\n,，;；、]+/)
        .map((v) => v.trim())
        .filter(Boolean);
    const expanded = rawList.flatMap((item: any) =>
      String(item)
        .split(/[\/|｜]+/)
        .map((v) => v.trim())
        .filter(Boolean)
    );
    const cleaned = expanded
      .map(normalizeSkillToken)
      .map(toNounSkillToken)
      .filter(Boolean)
      .map((v) => v.length > 24 ? v.slice(0, 24).trim() : v)
      .filter((v) => isProfessionalSkillToken(v));
    return Array.from(new Set(cleaned));
  };

  const inferTargetSection = (raw: any): Suggestion['targetSection'] => {
    const field = (raw?.targetField || '').toString().toLowerCase();
    if (['email', 'phone', 'name', 'title', 'jobtitle', 'job_title', 'position', 'gender', 'location'].includes(field)) {
      return 'personalInfo';
    }
    if (['company', 'employer', 'organization', 'org', 'subtitle', 'role', 'description', 'startdate', 'enddate'].includes(field)) {
      return 'workExps';
    }
    if (['project', 'projects', 'link'].includes(field)) {
      return 'projects';
    }
    if (['degree', 'major', 'school', 'education', 'educations'].includes(field)) {
      return 'educations' as any;
    }
    if (['skills', 'skill'].includes(field)) {
      return 'skills';
    }
    if (['summary', 'profile'].includes(field)) {
      return 'summary';
    }
    return 'workExps';
  };
  const getDisplayOriginalValue = (suggestion: Suggestion) => {
    const section = normalizeTargetSection(suggestion.targetSection) || inferTargetSection(suggestion);
    const raw = suggestion.originalValue;
    if (raw === null || raw === undefined) return '';

    if (section === 'educations') {
      const text = String(raw).trim();
      const edu = (resumeData?.educations || []).find((e: any) =>
        typeof suggestion.targetId === 'number' ? e.id === suggestion.targetId : true
      );
      if (edu) {
        const school = (edu.school || edu.title || '').trim();
        const degree = (edu.degree || '').trim();
        const major = (edu.major || edu.subtitle || '').trim();
        const parts = [school, degree, major].filter(Boolean);
        const uniqueParts: string[] = [];
        const seen = new Set<string>();
        parts.forEach((p) => {
          const key = p.toLowerCase();
          if (seen.has(key)) return;
          seen.add(key);
          uniqueParts.push(p);
        });
        const composed = uniqueParts.join(' | ');
        if (composed) return composed;
      }

      const leftRight = text.split('@').map(s => s.trim()).filter(Boolean);
      if (leftRight.length === 2) {
        const left = Array.from(new Set(leftRight[0].split(/\s+/).filter(Boolean))).join(' ');
        return [left, leftRight[1]].filter(Boolean).join(' @ ');
      }

      const tokens = text.split(/\s+/).filter(Boolean);
      if (tokens.length > 1) {
        return Array.from(new Set(tokens)).join(' ');
      }
      return text;
    }

    if (Array.isArray(raw)) return raw.join('、');
    return String(raw);
  };

  const normalizeTargetSection = (section: any): Suggestion['targetSection'] | '' => {
    const value = String(section || '').trim().toLowerCase();
    if (!value) return '';
    if (value === 'personalinfo' || value === 'personal_info' || value === 'personal') return 'personalInfo';
    if (value === 'workexps' || value === 'work_exp' || value === 'work' || value === 'experience') return 'workExps';
    if (value === 'skills' || value === 'skill') return 'skills';
    if (value === 'projects' || value === 'project') return 'projects';
    if (value === 'educations' || value === 'education' || value === 'edu') return 'educations';
    if (value === 'summary' || value === 'profile') return 'summary';
    return '';
  };

  const getSuggestionModuleLabel = (suggestion: Suggestion) => {
    const normalizeText = (value: any) =>
      String(value || '')
        .replace(/\s+/g, '')
        .trim();
    const buildNeedle = () =>
      normalizeText(
        [
          suggestion.originalValue,
          suggestion.reason,
          suggestion.title,
          typeof suggestion.suggestedValue === 'string' ? suggestion.suggestedValue : ''
        ].join(' ')
      );
    const scoreMatch = (needle: string, haystack: string) => {
      if (!needle || !haystack) return 0;
      let score = 0;
      const chunks = needle
        .split(/[，。；、,.;:\-_/|()\[\]{}]+/)
        .map(s => s.trim())
        .filter(s => s.length >= 4)
        .slice(0, 8);
      for (const c of chunks) {
        if (haystack.includes(c)) score += c.length;
      }
      if (needle.length >= 8 && haystack.includes(needle.slice(0, 8))) score += 8;
      return score;
    };

    const section = normalizeTargetSection(suggestion.targetSection) || suggestion.targetSection;
    if (section === 'personalInfo') return '个人信息';
    if (section === 'skills') return '技能';
    if (section === 'projects') {
      const projects = resumeData?.projects || [];
      const directMatch = typeof suggestion.targetId === 'number'
        ? projects.find(item => item.id === suggestion.targetId)
        : null;
      const smartMatch = (() => {
        const needle = buildNeedle();
        if (!needle) return null;
        let best: any = null;
        let bestScore = 0;
        for (const item of projects) {
          const haystack = normalizeText(`${item.title || ''}${item.subtitle || ''}${item.description || ''}`);
          const s = scoreMatch(needle, haystack);
          if (s > bestScore) {
            bestScore = s;
            best = item;
          }
        }
        return bestScore > 0 ? best : null;
      })();
      const match = directMatch || smartMatch || projects.find(item => (item.title || item.subtitle || '').trim());
      const label = (match?.title || match?.subtitle || '').trim();
      if (label) return label;
      return '项目经历';
    }
    if (section === 'summary') return '个人简介';
    if (section === 'workExps') {
      const exps = resumeData?.workExps || [];
      const directMatch = typeof suggestion.targetId === 'number'
        ? exps.find(item => item.id === suggestion.targetId)
        : null;
      const smartMatch = (() => {
        const needle = buildNeedle();
        if (!needle) return null;
        let best: any = null;
        let bestScore = 0;
        for (const item of exps) {
          const haystack = normalizeText(`${item.company || ''}${item.title || ''}${(item as any).position || ''}${item.subtitle || ''}${item.description || ''}`);
          const s = scoreMatch(needle, haystack);
          if (s > bestScore) {
            bestScore = s;
            best = item;
          }
        }
        return bestScore > 0 ? best : null;
      })();
      const match = directMatch || smartMatch || exps.find(item => (item.company || item.title || '').trim());
      const companyName = (match?.company || match?.title || '').trim();
      if (companyName) return companyName;
      return '工作经历';
    }
    if (section === 'educations') {
      const edus = resumeData?.educations || [];
      const match = typeof suggestion.targetId === 'number'
        ? edus.find(item => item.id === suggestion.targetId)
        : edus.find(item => (item.major || item.subtitle || item.school || item.title || '').trim());
      const majorLabel = (match?.major || match?.subtitle || '').trim();
      if (majorLabel) return majorLabel;
      const schoolLabel = (match?.school || match?.title || '').trim();
      if (schoolLabel) return schoolLabel;
      return '教育背景';
    }
    const eduHint = `${suggestion.title || ''}${suggestion.reason || ''}${suggestion.originalValue || ''}`;
    if (/(教育|专业|学历|学位|本科|硕士|博士)/.test(eduHint)) return '专业';
    return '简历';
  };
  // --- Privacy masking helpers ---
  const createMasker = () => {
    const mapping = new Map<string, string>();
    let counter = 0;

    const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
    const phoneRegex = /(?<!\d)(\+?\d[\d\s-]{7,}\d)(?!\d)/g;

    const maskValue = (value: string, type: string) => {
      const token = `[[${type}_${++counter}]]`;
      mapping.set(token, value);
      return token;
    };

    const maskText = (text: string) => {
      if (!text) return text;
      return text
        .replace(emailRegex, (m) => maskValue(m, 'EMAIL'))
        .replace(phoneRegex, (m) => maskValue(m, 'PHONE'));
    };

    const companyKeys = new Set(['company', 'employer', 'organization', 'org', 'school']);
    const addressKeys = new Set(['address', 'location', 'city', 'province', 'state', 'country']);

    const maskObject = (input: any): any => {
      if (input === null || input === undefined) return input;
      if (typeof input === 'string') return maskText(input);
      if (Array.isArray(input)) return input.map((item) => maskObject(item));
      if (typeof input === 'object') {
        const out: any = {};
        Object.keys(input).forEach((key) => {
          const value = input[key];
          if (typeof value === 'string' && companyKeys.has(key)) {
            out[key] = maskValue(value, 'COMPANY');
            return;
          }
          if (typeof value === 'string' && addressKeys.has(key)) {
            out[key] = maskValue(value, 'ADDRESS');
            return;
          }
          out[key] = maskObject(value);
        });
        return out;
      }
      return input;
    };

    const unmaskText = (text: string) => {
      if (!text) return text;
      let result = text;
      for (const [token, value] of mapping.entries()) {
        const bareToken = token.replace(/^\[\[/, '').replace(/\]\]$/, '');
        result = result.split(token).join(value);
        result = result.split(bareToken).join(value);
      }
      return result;
    };

    const unmaskObject = (input: any): any => {
      if (input === null || input === undefined) return input;
      if (typeof input === 'string') return unmaskText(input);
      if (Array.isArray(input)) return input.map((item) => unmaskObject(item));
      if (typeof input === 'object') {
        const out: any = {};
        Object.keys(input).forEach((key) => {
          out[key] = unmaskObject(input[key]);
        });
        return out;
      }
      return input;
    };

    return { maskText, maskObject, unmaskText, unmaskObject };
  };
  // Navigation State
  const [currentStep, setCurrentStep] = useState<Step>(() => {
    const saved = localStorage.getItem('ai_analysis_step') as Step | null;
    return saved || 'resume_select';
  });
  const [selectedResumeId, setSelectedResumeId] = useState<string | number | null>(null);
  const sourceResumeIdRef = useRef<string | number | null>(null);
  const [stepHistory, setStepHistory] = useState<Step[]>([]);
  const [chatEntrySource, setChatEntrySource] = useState<'internal' | 'preview' | null>(() => {
    const stored = localStorage.getItem('ai_chat_entry_source');
    return stored === 'internal' || stored === 'preview' ? stored : null;
  });
  const [lastChatStep, setLastChatStep] = useState<Step | null>(() => {
    const stored = localStorage.getItem('ai_chat_prev_step');
    const validSteps: Step[] = ['resume_select', 'jd_input', 'analyzing', 'report', 'comparison'];
    return stored && validSteps.includes(stored as Step) ? (stored as Step) : null;
  });

  // Wrapper for setCurrentStep that records history
  const navigateToStep = (nextStep: Step, replace: boolean = false) => {
    if (nextStep !== currentStep) {
      if (!replace) {
        setStepHistory(prev => [...prev, currentStep]);
      }
      setCurrentStep(nextStep);
    }
  };

  const openChat = (source: 'internal' | 'preview') => {
    if (source === 'internal') {
      setIsInterviewEntry(false);
      const prevStep = currentStep !== 'chat' ? currentStep : lastChatStep;
      if (prevStep && prevStep !== 'chat') {
        setLastChatStep(prevStep);
        localStorage.setItem('ai_chat_prev_step', prevStep);
      }
      setChatEntrySource('internal');
      localStorage.setItem('ai_chat_entry_source', 'internal');
      if (chatMessages.length === 0) {
        restoreInterviewSession();
      }
      navigateToStep('chat');
      return;
    }

    setIsInterviewEntry(true);
    setChatEntrySource('preview');
    localStorage.setItem('ai_chat_entry_source', 'preview');
    localStorage.removeItem('ai_chat_prev_step');
    setLastChatStep(null);
    navigateToStep('chat', true);
  };

  // Improved back logic
  const handleStepBack = () => {
    if (currentStep === 'chat') {
      if (chatEntrySource === 'preview') {
        if (goBack) {
          goBack();
        }
        return;
      }
      if (stepHistory.length === 0 && lastChatStep && lastChatStep !== 'chat') {
        setCurrentStep(lastChatStep);
        return;
      }
    }
    if (stepHistory.length > 0) {
      const prev = [...stepHistory];
      const lastStep = prev.pop()!;
      setStepHistory(prev);
      setCurrentStep(lastStep);
    } else if (goBack) {
      goBack();
    }
  };
  const [originalResumeData, setOriginalResumeData] = useState<ResumeData | null>(null);
  const [jdText, setJdText] = useState('');
  const [targetCompany, setTargetCompany] = useState('');

  // Analysis Result State
  const [originalScore, setOriginalScore] = useState(0);
  const [score, setScore] = useState(0);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const isExporting = false;

  // Upload State
  const [isUploading, setIsUploading] = useState(false);
  const [showJdEmptyModal, setShowJdEmptyModal] = useState(false);

  // Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const CHAT_PREFILL_TEXT = '准备好了';
  const [isChatPrefill, setIsChatPrefill] = useState(false);
  const [isInterviewEntry, setIsInterviewEntry] = useState(false);
  const [forceReportEntry, setForceReportEntry] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [expandedReferences, setExpandedReferences] = useState<Record<string, boolean>>({});
  const [pendingNextQuestion, setPendingNextQuestion] = useState<string | null>(null);

  // Cache State
  const [isFromCache, setIsFromCache] = useState(false);

  // Optimized Resume Tracking
  const [optimizedResumeId, setOptimizedResumeId] = useState<string | number | null>(null);
  const optimizedResumeIdRef = useRef<string | number | null>(null);
  const creatingOptimizedResumeRef = useRef<Promise<string | number | null> | null>(null);
  const creatingOptimizedForOriginalIdRef = useRef<string | null>(null);
  const acceptSuggestionQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [isOptimizedOpen, setIsOptimizedOpen] = useState(true);
  const [isUnoptimizedOpen, setIsUnoptimizedOpen] = useState(true);
  const [resumeReadState, setResumeReadState] = useState<ResumeReadState>({
    status: 'idle',
    message: '尚未读取简历，请先选择简历'
  });
  const isLikelyJwt = (token?: string | null) => {
    const raw = (token || '').trim();
    if (!raw) return false;
    return raw.split('.').length === 3;
  };
  const getBackendAuthToken = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const sessionToken = session?.access_token?.trim();
      if (isLikelyJwt(sessionToken)) return sessionToken as string;
    } catch (error) {
      console.warn('Failed to get Supabase session token:', error);
    }

    try {
      const sessionStr = localStorage.getItem('supabase_session');
      if (sessionStr) {
        const parsed = JSON.parse(sessionStr);
        const token = (parsed?.access_token || parsed?.token || '').trim();
        if (isLikelyJwt(token)) return token;
      }
    } catch (error) {
      console.warn('Failed to parse supabase_session:', error);
    }

    const legacyToken = (localStorage.getItem('token') || '').trim();
    if (isLikelyJwt(legacyToken)) return legacyToken;
    return '';
  };
  const getRagEnabledFlag = () => {
    try {
      const raw = (localStorage.getItem('rag_enabled_test') || '').trim().toLowerCase();
      if (!raw) return true; // default ON
      if (raw === '0' || raw === 'false' || raw === 'off' || raw === 'no') return false;
      if (raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes') return true;
      return true;
    } catch {
      return true;
    }
  };
  const setAnalysisResumeId = (id: string | number | null) => {
    if (id === null || id === undefined) {
      localStorage.removeItem('ai_analysis_resume_id');
      return;
    }
    localStorage.setItem('ai_analysis_resume_id', String(id));
  };
  const LAST_ANALYSIS_KEY = 'ai_last_analysis_snapshot';
  const ANALYSIS_COMPLETED_KEY = 'ai_analysis_completed_once';
  const saveLastAnalysis = (payload: {
    resumeId: string | number;
    jdText: string;
    targetCompany?: string;
    snapshot: any;
    updatedAt: string;
  }) => {
    try {
      localStorage.setItem(LAST_ANALYSIS_KEY, JSON.stringify(payload));
    } catch (error) {
      console.warn('Failed to save last analysis snapshot:', error);
    }
  };
  const loadLastAnalysis = () => {
    try {
      const raw = localStorage.getItem(LAST_ANALYSIS_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (error) {
      console.warn('Failed to parse last analysis snapshot:', error);
      return null;
    }
  };
  const clearLastAnalysis = () => {
    localStorage.removeItem(LAST_ANALYSIS_KEY);
  };

  const setAnalysisInProgress = (value: boolean) => {
    if (value) {
      localStorage.setItem('ai_analysis_in_progress', '1');
    } else {
      localStorage.removeItem('ai_analysis_in_progress');
    }
  };

  useEffect(() => {
    const entrySource = localStorage.getItem('ai_analysis_entry_source');
    if (entrySource !== 'bottom_nav') return;

    const hasCompletedAnalysis = localStorage.getItem(ANALYSIS_COMPLETED_KEY) === '1';
    const hasSnapshot = !!loadLastAnalysis();
    if (hasCompletedAnalysis || hasSnapshot) return;

    setStepHistory([]);
    setCurrentStep('resume_select');
    setChatEntrySource(null);
    setLastChatStep(null);
    localStorage.setItem('ai_analysis_step', 'resume_select');
    localStorage.removeItem('ai_analysis_in_progress');
    localStorage.removeItem('ai_chat_prev_step');
    localStorage.removeItem('ai_chat_entry_source');
  }, []);

  const applySuggestionFeedback = (items: Suggestion[]) => {
    const feedback = resumeData?.aiSuggestionFeedback || {};
    if (!feedback || Object.keys(feedback).length === 0) return items;
    return items.map(item => {
      const entry = feedback[item.id];
      return entry?.rating ? { ...item, rating: entry.rating } : item;
    });
  };
  const consolidateSkillSuggestions = (items: Suggestion[]) => {
    if (!Array.isArray(items) || items.length <= 1) return items;
    const skillIndices = items
      .map((item, idx) => ({ item, idx }))
      .filter(({ item }) => normalizeTargetSection(item.targetSection) === 'skills');
    if (skillIndices.length <= 1) return items;

    const mergedSkills = toSkillList(
      skillIndices.flatMap(({ item }) =>
        Array.isArray(item.suggestedValue) ? item.suggestedValue : [item.suggestedValue]
      )
    );
    const firstSkill = skillIndices[0].item;
    const mergedReason = Array.from(
      new Set(skillIndices.map(({ item }) => String(item.reason || '').trim()).filter(Boolean))
    ).join('；');
    const mergedOriginal = skillIndices.find(({ item }) => item.originalValue)?.item.originalValue;
    const mergedRating = skillIndices.find(({ item }) => item.rating)?.item.rating;
    const mergedStatus = skillIndices.some(({ item }) => item.status === 'accepted')
      ? 'accepted'
      : (skillIndices.some(({ item }) => item.status === 'ignored') ? 'ignored' : 'pending');

    const mergedSkillSuggestion: Suggestion = {
      ...firstSkill,
      title: firstSkill.title || '技能补全',
      reason: sanitizeReasonText(mergedReason || firstSkill.reason),
      targetSection: 'skills',
      suggestedValue: mergedSkills,
      originalValue: mergedOriginal ?? firstSkill.originalValue,
      status: mergedStatus as any,
      rating: mergedRating
    };

    const firstIdx = skillIndices[0].idx;
    const skillIndexSet = new Set(skillIndices.map(({ idx }) => idx));
    const result: Suggestion[] = [];
    items.forEach((item, idx) => {
      if (idx === firstIdx) {
        result.push(mergedSkillSuggestion);
        return;
      }
      if (skillIndexSet.has(idx)) return;
      result.push(item);
    });
    return result;
  };

  const applyAnalysisSnapshot = (snapshot: any) => {
    if (!snapshot) return false;
    const normalizedBreakdown = normalizeScoreBreakdown(
      snapshot.scoreBreakdown || { experience: 0, skills: 0, format: 0 },
      snapshot.score || 0
    );
    const displayScore = resolveDisplayScore(snapshot.score || 0, normalizedBreakdown);
    setOriginalScore(displayScore);
    setScore(displayScore);
    setSuggestions(applySuggestionFeedback(consolidateSkillSuggestions(snapshot.suggestions || [])));
    setReport({
      summary: snapshot.summary || '',
      strengths: snapshot.strengths || [],
      weaknesses: snapshot.weaknesses || [],
      missingKeywords: snapshot.missingKeywords || [],
      scoreBreakdown: normalizedBreakdown
    });
    setIsFromCache(true);
    return true;
  };

  useEffect(() => {
    optimizedResumeIdRef.current = optimizedResumeId;
  }, [optimizedResumeId]);

  const normalizeResumeId = (id: any) => String(id ?? '').trim();
  const isSameResumeId = (a: any, b: any) => {
    const aa = normalizeResumeId(a);
    const bb = normalizeResumeId(b);
    return !!aa && !!bb && aa === bb;
  };

  const resolveOriginalResumeIdForOptimization = () => {
    if (sourceResumeIdRef.current) {
      return sourceResumeIdRef.current;
    }
    if (selectedResumeId) {
      return selectedResumeId;
    }
    if (!resumeData?.id) return null;
    if (resumeData.optimizationStatus === 'optimized') {
      return resumeData.optimizedFromId || resumeData.id;
    }
    return resumeData.id;
  };

  const findExistingOptimizedResumeId = async (userId: string, originalResumeId: string | number) => {
    const normalizedOriginalId = normalizeResumeId(originalResumeId);
    const list = await DatabaseService.getUserResumes(userId);
    if (!list.success || !Array.isArray(list.data)) return null;
    const hit = list.data.find((r: any) => {
      const data = r?.resume_data || {};
      const isOptimized = data?.optimizationStatus === 'optimized';
      return isOptimized && isSameResumeId(data?.optimizedFromId, normalizedOriginalId);
    });
    return hit?.id ? hit.id : null;
  };

  const ensureSingleOptimizedResume = async (
    userId: string,
    originalResumeId: string | number,
    baseResumeData: ResumeData
  ): Promise<string | number> => {
    const normalizedOriginalId = normalizeResumeId(originalResumeId);
    const current = optimizedResumeIdRef.current;
    if (current) {
      const currentRow = await DatabaseService.getResume(current);
      const currentData = currentRow.success ? currentRow.data?.resume_data : null;
      const isValidCurrent =
        !!currentRow.success &&
        !!currentRow.data &&
        currentData?.optimizationStatus === 'optimized' &&
        isSameResumeId(currentData?.optimizedFromId, normalizedOriginalId);
      if (isValidCurrent) {
        return currentRow.data.id;
      }
      setOptimizedResumeId(null);
      optimizedResumeIdRef.current = null;
    }

    const existingId = await findExistingOptimizedResumeId(userId, normalizedOriginalId);
    if (existingId) {
      setOptimizedResumeId(existingId);
      optimizedResumeIdRef.current = existingId;
      return existingId;
    }

    if (
      creatingOptimizedResumeRef.current &&
      creatingOptimizedForOriginalIdRef.current === normalizedOriginalId
    ) {
      const pendingId = await creatingOptimizedResumeRef.current;
      if (!pendingId) {
        throw new Error('创建优化简历失败');
      }
      return pendingId;
    }

    creatingOptimizedForOriginalIdRef.current = normalizedOriginalId;
    creatingOptimizedResumeRef.current = (async () => {
      const baseTitle = allResumes?.find(r => isSameResumeId(r.id, baseResumeData.id))?.title || '简历';
      const newTitle = buildResumeTitle(baseTitle, baseResumeData, jdText, true);
      const createResult = await DatabaseService.createResume(userId, newTitle, {
        ...baseResumeData,
        optimizationStatus: 'optimized' as const,
        optimizedFromId: normalizedOriginalId,
        lastJdText: jdText || baseResumeData.lastJdText || '',
        targetCompany: targetCompany || baseResumeData.targetCompany || ''
      });
      if (!createResult.success || !createResult.data?.id) {
        console.error('ensureSingleOptimizedResume create failed:', createResult.error);
        // 兼容并发/唯一约束场景：创建失败后再次回查一次，若已存在则直接复用
        const fallbackId = await findExistingOptimizedResumeId(userId, normalizedOriginalId);
        if (fallbackId) {
          return fallbackId;
        }
        const errMsg =
          (createResult.error as any)?.message ||
          (createResult.error as any)?.details ||
          (createResult.error as any)?.code ||
          '创建优化简历失败';
        throw new Error(errMsg);
      }
      return createResult.data.id;
    })()
      .finally(() => {
        creatingOptimizedResumeRef.current = null;
        creatingOptimizedForOriginalIdRef.current = null;
      });

    const createdId = await creatingOptimizedResumeRef.current;
    if (!createdId) {
      throw new Error('创建优化简历失败');
    }
    setOptimizedResumeId(createdId);
    optimizedResumeIdRef.current = createdId;
    return createdId;
  };

  const persistAnalysisSnapshot = async (data: ResumeData, reportData: AnalysisReport, scoreValue: number, suggestionItems: Suggestion[]) => {
    if (!data?.id) return;
    const snapshot = {
      score: scoreValue,
      summary: reportData.summary || '',
      strengths: reportData.strengths || [],
      weaknesses: reportData.weaknesses || [],
      missingKeywords: reportData.missingKeywords || [],
      scoreBreakdown: reportData.scoreBreakdown || { experience: 0, skills: 0, format: 0 },
      suggestions: suggestionItems || [],
      updatedAt: new Date().toISOString(),
      jdText: jdText || data.lastJdText || '',
      targetCompany: targetCompany || data.targetCompany || ''
    };
    const updatedResumeData = { ...data, analysisSnapshot: snapshot };
    if (setResumeData) {
      setResumeData(updatedResumeData);
    }
    await DatabaseService.updateResume(String(data.id), {
      resume_data: updatedResumeData,
      updated_at: new Date().toISOString()
    });
    return updatedResumeData;
  };

  const maskSuggestionPayload = (suggestion: Suggestion) => {
    const masker = createMasker();
    const maskValue = (value: any) => {
      if (value === null || value === undefined) return value;
      if (typeof value === 'string') return masker.maskText(value);
      return masker.maskObject(value);
    };

    return {
      reasonMasked: suggestion.reason ? masker.maskText(suggestion.reason) : undefined,
      originalValueMasked: maskValue(suggestion.originalValue),
      suggestedValueMasked: maskValue(suggestion.suggestedValue)
    };
  };

  const persistSuggestionFeedback = async (suggestion: Suggestion, rating: 'up' | 'down') => {
    if (!resumeData) return;
    if (suggestion.rating === rating) return;

    const updatedFeedback = {
      ...(resumeData.aiSuggestionFeedback || {}),
      [suggestion.id]: {
        rating,
        ratedAt: new Date().toISOString(),
        title: suggestion.title,
        reason: suggestion.reason
      }
    };

    const updatedResumeData: ResumeData = {
      ...resumeData,
      aiSuggestionFeedback: updatedFeedback
    };

    setSuggestions(prev => prev.map(s => s.id === suggestion.id ? { ...s, rating } : s));
    if (setResumeData) {
      setResumeData(updatedResumeData);
    }

    if (!resumeData.id) return;
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) return;

      const masked = rating === 'down' ? maskSuggestionPayload(suggestion) : {};

      await DatabaseService.createSuggestionFeedback({
        userId: user.id,
        resumeId: resumeData.id ?? null,
        suggestionId: suggestion.id,
        rating,
        title: suggestion.title,
        reasonMasked: (masked as any).reasonMasked,
        originalValueMasked: (masked as any).originalValueMasked,
        suggestedValueMasked: (masked as any).suggestedValueMasked
      });

      await DatabaseService.updateResume(String(resumeData.id), {
        resume_data: updatedResumeData,
        updated_at: new Date().toISOString()
      });
    } catch (err) {
      console.error('Failed to persist suggestion feedback:', err);
    }
  };

  // --- Helper: Extract Company Name from JD ---
  // --- Helper: Extract Company Name from JD ---
  const getCompanyNameFromJd = (text: string) => {
    if (!text) return '';

    // 预处理：移除常见的干扰字符
    const cleanText = text.trim();
    const lines = cleanText.split('\n').filter(l => l.trim().length > 0);

    // 黑名单关键词：包含这些词的一定不是公司名
    const invalidKeywords = ['职位', '岗位', '要求', '职责', '描述', '薪资', '地点', '福利', '一、', '二、', '三、', '1.', '2.', '3.', '任职', '优先', '加分', '简历', '投递', '招聘'];

    const isValid = (name: string) => {
      const n = name.trim();
      if (n.length < 2 || n.length > 50) return false;
      return !invalidKeywords.some(kw => n.includes(kw));
    };

    // 1. 优先匹配明确的标签
    const patterns = [
      /(?:公司|企业|Employer|Company)[:：]\s*([^\n]+)/i,
      /招聘单位[:：]\s*([^\n]+)/,
    ];

    for (const pattern of patterns) {
      const match = cleanText.match(pattern);
      if (match && match[1]) {
        const candidate = match[1].trim();
        if (isValid(candidate)) return candidate;
      }
    }

    // 2. 尝试从第一行判断（必须包含公司相关后缀）
    if (lines.length > 0) {
      const firstLine = lines[0].trim();
      // 必须包含公司实体后缀，且不包含黑名单
      if (/(?:公司|集团|工作室|科技|网络|技术|Consulting|Inc\.|Ltd\.|Co\.)/i.test(firstLine)) {
        if (isValid(firstLine)) return firstLine;
      }
    }

    // 不再鲁莽地返回第一行作为默认值，因为那往往是"职位描述"或"任职要求"
    return '';
  };

  const makeJdKey = (text: string) => {
    const normalized = (text || '').trim().toLowerCase();
    if (!normalized) return 'jd_default';
    let hash = 0;
    for (let i = 0; i < normalized.length; i += 1) {
      hash = (hash * 31 + normalized.charCodeAt(i)) | 0;
    }
    return `jd_${Math.abs(hash)}`;
  };

  const getLatestInterviewSession = (sessions: ResumeData['interviewSessions']) => {
    if (!sessions) return null;
    const entries = Object.values(sessions);
    if (entries.length === 0) return null;
    return entries.sort((a, b) => (a.updatedAt > b.updatedAt ? -1 : 1))[0];
  };

  const buildResumeTitle = (baseTitle: string | undefined, data: ResumeData, jd: string, includeCompany: boolean) => {
    const direction = data?.personalInfo?.title?.trim();
    const personName = data?.personalInfo?.name?.trim();
    const manualCompany = (data?.targetCompany || targetCompany || '').trim();
    const parts: string[] = [];

    if (direction) {
      parts.push(direction);
    } else if (baseTitle) {
      parts.push(baseTitle);
    } else {
      parts.push('简历');
    }

    if (includeCompany) {
      const companyName = manualCompany || getCompanyNameFromJd(jd);
      if (companyName) {
        parts.push(companyName);
      }
    }

    if (personName) {
      parts.push(personName);
    }

    return parts.join(' - ');
  };

  const restoreInterviewSession = (overrideJdText?: string) => {
    if (!resumeData) return;
    const sessionJdText = (overrideJdText ?? jdText ?? resumeData.lastJdText ?? '').trim();
    if (!jdText && sessionJdText) {
      setJdText(sessionJdText);
    }
    if (!targetCompany && resumeData.targetCompany) {
      setTargetCompany(resumeData.targetCompany);
    }

    if (!sessionJdText) {
      setChatMessages([]);
      setChatInitialized(false);
      return;
    }

    const sessions = resumeData.interviewSessions || {};
    const sessionKey = makeJdKey(sessionJdText);
    const session = sessions[sessionKey];

    if (session && session.messages?.length) {
      setChatMessages(session.messages as ChatMessage[]);
      setChatInitialized(true);
    } else {
      setChatMessages([]);
      setChatInitialized(false);
    }
  };

  const persistInterviewSession = async (messages: ChatMessage[], overrideJdText?: string) => {
    if (!resumeData?.id) return;
    const sessionJdText = (overrideJdText ?? jdText ?? resumeData.lastJdText ?? '').trim();
    const jdKey = makeJdKey(sessionJdText);
    const currentSessions = resumeData.interviewSessions || {};
    const updatedSessions = {
      ...currentSessions,
      [jdKey]: {
        jdText: sessionJdText,
        messages: messages.map(m => ({ id: m.id, role: m.role, text: m.text })),
        updatedAt: new Date().toISOString()
      }
    };

    const updatedResumeData = {
      ...resumeData,
      interviewSessions: updatedSessions,
      lastJdText: sessionJdText,
      targetCompany: targetCompany || resumeData.targetCompany || ''
    };

    if (setResumeData) {
      setResumeData(updatedResumeData);
    }

    await DatabaseService.updateResume(String(resumeData.id), {
      resume_data: updatedResumeData,
      updated_at: new Date().toISOString()
    });
  };

  // --- Handlers ---

  const handleResumeSelect = async (id: string | number, preferReport: boolean = false) => {
    setSelectedResumeId(id);
    sourceResumeIdRef.current = id;
    setAnalysisResumeId(id);
    const selectedTitle = (allResumes || []).find((item) => isSameResumeId(item.id, id))?.title || '当前简历';
    setResumeReadState({
      status: 'loading',
      message: `正在读取《${selectedTitle}》...`
    });

    // 立即切换到下一步，提高用户体验
    // 避免优先进入 report 导致 0 分闪屏，再进入 JD
    if (!preferReport) {
      navigateToStep('jd_input');
    }

    // 记录当前 resumeData 和 allResumes 的状态
    console.log('handleResumeSelect - Current resumeData:', resumeData);
    console.log('handleResumeSelect - Selected resume ID:', id);
    console.log('handleResumeSelect - All resumes:', allResumes);

    // 在后台从数据库中获取完整的简历数据
    try {
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError || !user) {
        console.error('User not authenticated:', userError);
        setResumeReadState({
          status: 'error',
          message: '读取失败：用户未登录或登录已过期'
        });
        // 已经切换到下一步，这里只需要显示错误提示
        alert('请先登录');
        return;
      }

      let resume: any = null;
      const single = await DatabaseService.getResume(id);
      if (single.success && single.data) {
        resume = single.data;
      } else {
        const result = await DatabaseService.getUserResumes(user.id);
        if (!result.success) {
          console.error('Failed to load resumes:', result.error);
          setResumeReadState({
            status: 'error',
            message: `读取失败：${result.error?.message || '加载简历失败'}`
          });
          alert(`加载简历失败: ${result.error?.message || '请重试'}`);
          return;
        }
        resume = result.data.find((r: any) => String(r.id) === String(id));
      }

      if (!resume && resumeData?.id && String(resumeData.id) === String(id)) {
        resume = {
          id: resumeData.id,
          title: allResumes?.find(r => String(r.id) === String(id))?.title || '简历',
          resume_data: resumeData
        };
      }

      if (!resume) {
        console.error('Resume not found');
        setResumeReadState({
          status: 'error',
          message: `读取失败：未找到该简历（ID: ${id}）`
        });
        alert(`简历不存在 (ID: ${id})`);
        return;
      }

      console.log('Target resume found:', resume);

      if (!resume.resume_data) {
        console.error('Resume data is empty: resume_data is null/undefined');
        setResumeReadState({
          status: 'error',
          message: '读取失败：简历内容为空'
        });
        alert('简历数据为空，请重新创建简历');
        return;
      }

      if (typeof resume.resume_data === 'object' && Object.keys(resume.resume_data).length === 0) {
        console.error('Resume data is empty object: resume_data is empty object');
        setResumeReadState({
          status: 'error',
          message: '读取失败：简历内容为空对象'
        });
        alert('简历数据为空，请重新创建简历');
        return;
      }

      console.log('Resume loaded successfully:', resume);

      if (setResumeData) {
        const finalResumeData = {
          id: resume.id,
          ...resume.resume_data,
          resumeTitle: resume.title
        };
        sourceResumeIdRef.current = finalResumeData.optimizedFromId || finalResumeData.id;

        console.log('Setting resume data:', finalResumeData);
        setResumeData(finalResumeData);
        setResumeReadState({
          status: 'success',
          message: `已成功读取《${resume.title || selectedTitle}》`
        });
        setOptimizedResumeId(
          finalResumeData.optimizedResumeId ||
          (finalResumeData.optimizationStatus === 'optimized' ? resume.id : null)
        );
        if (finalResumeData.targetCompany) {
          setTargetCompany(finalResumeData.targetCompany);
        }

        if (preferReport) {
          const restoredJdText = (finalResumeData.lastJdText || '').trim();
          if (restoredJdText) {
            setJdText(restoredJdText);
          }
          applyAnalysisSnapshot(finalResumeData.analysisSnapshot);
          if (finalResumeData.analysisSnapshot) {
            saveLastAnalysis({
              resumeId: resume.id,
              jdText: restoredJdText,
              targetCompany: finalResumeData.targetCompany || '',
              snapshot: finalResumeData.analysisSnapshot,
              updatedAt: finalResumeData.analysisSnapshot.updatedAt || new Date().toISOString()
            });
            setAnalysisResumeId(resume.id);
          }
          navigateToStep('report', true);
        }
      }
    } catch (error) {
      console.error('Error loading resume:', error);
      setResumeReadState({
        status: 'error',
        message: '读取失败：网络异常或服务不可用'
      });
      alert('加载简历失败，请检查网络连接');
    }
  };

  const generateRealAnalysis = async () => {
    if (!resumeData) return null;

    try {
      console.log('Generating real AI analysis via backend API...');

      // ========== 缓存检查 ==========
      // 检查是否有缓存的分析结果
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
      // ========== 缓存检查结束 ==========

      const token = await getBackendAuthToken();
      if (!token) {
        alert('登录已过期，请重新登录');
        window.location.href = '/login'; // 或者你的登录路由
        return null;
      }

      console.log('Using authenticated token for AI analyze request');

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // Increase timeout to 60s

      const masker = createMasker();
      const maskedResumeData = masker.maskObject(resumeData);
      const maskedJdText = masker.maskText(jdText || '');
      const ragEnabled = getRagEnabledFlag();
      console.log('AI analyze ragEnabled:', ragEnabled);

      const response = await fetch(buildApiUrl('/api/ai/analyze'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token.trim()}` // 增加 trim() 防止空格导致 401
        },
        signal: controller.signal,
        body: JSON.stringify({
          resumeData: maskedResumeData,
          jobDescription: maskedJdText,
          ragEnabled
        })
      });
      clearTimeout(timeoutId);

      // 重点：如果后端返回 401，一定要抛出错误
      if (response.status === 401) {
        throw new Error('鉴权失败，服务器不认这个 Token');
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'AI分析请求失败');
      }

      const result = await response.json();
      const unmaskedResult = masker.unmaskObject(result);
      console.log('Backend AI analysis result:', result);

      // 确保 result.score 存在
      const backendScore = unmaskedResult.score || 0;

      // 转换后端返回的数据格式为前端需要的格式
      const analysisResult = {
        summary: unmaskedResult.summary || 'AI分析完成',
        strengths: unmaskedResult.strengths || [],
        weaknesses: unmaskedResult.weaknesses || [],
        missingKeywords: unmaskedResult.missingKeywords, // 直接使用后端返回的数据
        score: backendScore, // 保存原始分数
        scoreBreakdown: {
          experience: Math.round(backendScore * 0.4), // 假设经验占40%
          skills: Math.round(backendScore * 0.4),     // 技能占40%
          format: Math.round(backendScore * 0.2)      // 格式占20%
        },
        suggestions: unmaskedResult.suggestions // 直接使用后端返回的建议
      };

      // ========== 缓存存储 ==========
      // 将新的分析结果存入缓存
      await AICacheService.set(resumeData, jdText, analysisResult);
      console.log('💾 Analysis result cached for future use');
      // ========== 缓存存储结束 ==========

      return analysisResult;
    } catch (error) {
      console.error('AI Analysis Error:', error);
      // 直接抛出错误，不回退到模拟数据
      throw error;
    }
  };

  const startAnalysis = async () => {
    // 检查 resumeData 是否存在
    if (!resumeData) {
      console.error('startAnalysis - resumeData is null or undefined');
      alert('无法进行 AI 分析：没有找到简历数据');
      return;
    }

    // 记录当前 resumeData 的内容
    console.log('startAnalysis - Resume data:', resumeData);

    // Reset Chat State for new analysis
    setChatMessages([]);
    setChatInitialized(false);
    setPendingNextQuestion(null);

    // Snapshot original data for comparison later
    setOriginalResumeData(JSON.parse(JSON.stringify(resumeData)));

    setAnalysisInProgress(true);
    navigateToStep('analyzing');

    try {
      // 直接调用真实AI分析，不回退到模拟数据
      const aiAnalysisResult = await generateRealAnalysis();

      if (aiAnalysisResult) {
        console.log('Using real AI analysis result');
        console.log('startAnalysis - AI analysis result:', aiAnalysisResult);

        // 转换后端返回的数据格式为前端需要的格式
        const newSuggestions: Suggestion[] = [];

        // 处理后端返回的建议
        const backendSuggestions = aiAnalysisResult.suggestions || [];
        const currentSkillsText = Array.isArray(resumeData?.skills) && resumeData.skills.length > 0
          ? resumeData.skills.filter(Boolean).join('、')
          : '';

        backendSuggestions.forEach((suggestion: any, index: number) => {
          // 如果是字符串，转换为对象
          if (typeof suggestion === 'string') {
            newSuggestions.push({
              id: `ai-suggestion-${index}`,
              type: 'optimization',
              title: '优化建议',
              reason: sanitizeReasonText(suggestion),
              targetSection: 'skills',
              targetId: undefined,
              targetField: undefined,
              suggestedValue: undefined,
              originalValue: currentSkillsText || undefined,
              status: 'pending' as const
            });
          } else {
            const inferredSection = normalizeTargetSection(suggestion.targetSection) || inferTargetSection(suggestion);
            const originalValue =
              suggestion.originalValue ||
              (inferredSection === 'skills' ? (currentSkillsText || undefined) : undefined);
            // 如果是对象，直接使用
            newSuggestions.push({
              id: suggestion.id || `ai-suggestion-${index}`,
              type: suggestion.type || 'optimization',
              title: suggestion.title || '优化建议',
              reason: sanitizeReasonText(suggestion.reason || '根据AI分析结果'),
              targetSection: inferredSection,
              targetId: suggestion.targetId,
              targetField: suggestion.targetField,
              suggestedValue: inferredSection === 'skills'
                ? toSkillList(suggestion.suggestedValue)
                : sanitizeSuggestedValue(suggestion.suggestedValue, inferredSection),
              originalValue,
              status: 'pending' as const
            });
          }
        });

        const normalizedBreakdown = normalizeScoreBreakdown(
          aiAnalysisResult.scoreBreakdown || {
            experience: 75,
            skills: 80,
            format: 90
          },
          aiAnalysisResult.score || 0
        );

        const newReport: AnalysisReport = {
          summary: aiAnalysisResult.summary || 'AI分析完成，请查看详细报告。',
          strengths: aiAnalysisResult.strengths || ['结构清晰'],
          weaknesses: aiAnalysisResult.weaknesses || ['需要进一步优化'],
          missingKeywords: aiAnalysisResult.missingKeywords, // 直接使用后端返回的数据
          scoreBreakdown: normalizedBreakdown
        };

        // 总分与分项统一：有分项时按权重从分项推导总分，避免展示不一致
        const totalScore = resolveDisplayScore(aiAnalysisResult.score || 0, newReport.scoreBreakdown);

        // 保存原始分数
        setOriginalScore(totalScore);
        // 初始化当前分数为原始分数
        setScore(totalScore);
        const appliedSuggestions = applySuggestionFeedback(consolidateSkillSuggestions(newSuggestions));
        setSuggestions(appliedSuggestions);
        setReport(newReport);
        const snapshotForPersist = {
          score: totalScore,
          summary: newReport.summary,
          strengths: newReport.strengths,
          weaknesses: newReport.weaknesses,
          missingKeywords: newReport.missingKeywords,
          scoreBreakdown: newReport.scoreBreakdown,
          suggestions: appliedSuggestions,
          updatedAt: new Date().toISOString(),
          jdText: jdText || resumeData.lastJdText || '',
          targetCompany: targetCompany || resumeData.targetCompany || ''
        };
        // 仅在“已优化简历”上持久化分析快照，避免污染原简历内容
        const persistTargetId =
          (resumeData.optimizationStatus === 'optimized' && resumeData.id)
            ? resumeData.id
            : (optimizedResumeIdRef.current || optimizedResumeId || resumeData.optimizedResumeId || null);
        if (persistTargetId) {
          await persistAnalysisSnapshot(
            { ...resumeData, id: persistTargetId as any },
            newReport,
            totalScore,
            appliedSuggestions
          );
        }
        if (resumeData?.id) {
          saveLastAnalysis({
            resumeId: resumeData.id,
            jdText: jdText || resumeData.lastJdText || '',
            targetCompany: targetCompany || resumeData.targetCompany || '',
            snapshot: snapshotForPersist,
            updatedAt: snapshotForPersist.updatedAt
          });
          setAnalysisResumeId(resumeData.id);
        }
        localStorage.setItem(ANALYSIS_COMPLETED_KEY, '1');




        navigateToStep('report', true); // Replace 'analyzing' step so back goes to 'jd_input'
      }
    } catch (error) {
      console.error('AI analysis failed:', error);
      // 显示错误提示，不回退到模拟数据
      alert(`AI 分析失败：${error.message || '网络连接异常，请稍后重试'}`);
      navigateToStep('jd_input');
    } finally {
      setAnalysisInProgress(false);
    }
  };

  const handleStartAnalysisClick = () => {
    if (!jdText.trim()) {
      setShowJdEmptyModal(true);
      return;
    }
    startAnalysis();
  };

  const updateScore = (points: number) => {
    setScore(prev => Math.min(prev + points, 100));
  };

  const handleAcceptSuggestionInChat = async (suggestion: Suggestion) => {
    acceptSuggestionQueueRef.current = acceptSuggestionQueueRef.current.then(async () => {
      try {
        if (!setResumeData || !resumeData) return;

        const normalizeFieldForSection = (section: Suggestion['targetSection'], field?: string) => {
          if (!field) return field;
          const key = field.trim();
          if (!key) return field;
          if (section === 'personalInfo') {
            if (['jobTitle', 'job_title', 'position', 'targetTitle', 'title'].includes(key)) {
              return 'title';
            }
            return key;
          }
          if (section === 'workExps') {
            if (['position', 'jobTitle', 'job_title', 'role', 'subtitle'].includes(key)) {
              return 'subtitle';
            }
            if (['company', 'employer', 'organization', 'org', 'title'].includes(key)) {
              return 'company';
            }
            return key;
          }
          if (section === 'projects') {
            if (['role', 'position', 'jobTitle', 'job_title', 'subtitle'].includes(key)) {
              return 'subtitle';
            }
            return key;
          }
          if (section === 'educations') {
            if (['school', 'university', 'college', 'title'].includes(key)) {
              return 'school';
            }
            if (['major', 'specialty', 'discipline', 'subtitle'].includes(key)) {
              return 'major';
            }
            if (['degree', 'educationLevel'].includes(key)) {
              return 'degree';
            }
            return key;
          }
          return key;
        };

        const applySuggestionToResume = (base: ResumeData) => {
          const newData = { ...base };
          const effectiveSection =
            normalizeTargetSection(suggestion.targetSection) ||
            inferTargetSection(suggestion);
          const normalizedField = normalizeFieldForSection(effectiveSection, suggestion.targetField);
          const normalizeForMatch = (v: any) =>
            String(v ?? '')
              .toLowerCase()
              .replace(/\s+/g, '')
              .replace(/[，,。.;；:：\-—_()（）\[\]【】'"`]/g, '');
          const suggestionNeedle = (() => {
            if (typeof suggestion.originalValue === 'string') return normalizeForMatch(suggestion.originalValue);
            if (Array.isArray(suggestion.originalValue as any)) {
              return normalizeForMatch((suggestion.originalValue as any[]).join(' '));
            }
            if (suggestion.originalValue && typeof suggestion.originalValue === 'object') {
              return normalizeForMatch(JSON.stringify(suggestion.originalValue));
            }
            return '';
          })();
          const targetIdStr = suggestion.targetId === undefined || suggestion.targetId === null
            ? ''
            : String(suggestion.targetId);
          const findBestTargetIndex = (items: any[], fieldFallback: string) => {
            if (!Array.isArray(items) || items.length === 0) return -1;
            if (targetIdStr) {
              const idIndex = items.findIndex((item: any) => String(item?.id ?? '') === targetIdStr);
              if (idIndex >= 0) return idIndex;
            }
            let bestIndex = -1;
            let bestScore = -1;
            items.forEach((item: any, idx: number) => {
              const fieldValue = normalizeForMatch(item?.[normalizedField || fieldFallback] || '');
              const haystack = normalizeForMatch([
                item?.title,
                item?.subtitle,
                item?.company,
                item?.position,
                item?.school,
                item?.major,
                item?.description
              ].filter(Boolean).join(' '));
              let score = 0;
              if (suggestionNeedle && suggestionNeedle.length >= 4) {
                if (fieldValue.includes(suggestionNeedle)) score += 80;
                if (haystack.includes(suggestionNeedle)) score += 60;
              }
              if (normalizedField && String(item?.[normalizedField] ?? '').trim()) score += 5;
              if (score > bestScore) {
                bestScore = score;
                bestIndex = idx;
              }
            });
            // 没有任何有效线索时，不默认改第一个，避免错改
            if (bestScore <= 0 && items.length > 1) return -1;
            return bestIndex >= 0 ? bestIndex : 0;
          };
          const patchFieldValue = (item: any, field: string, value: any) => {
            const next: any = { ...item };
            // description 场景优先替换命中的原句，避免覆盖整段
            if (
              field === 'description' &&
              typeof item?.description === 'string' &&
              typeof value === 'string' &&
              typeof suggestion.originalValue === 'string'
            ) {
              const origin = String(suggestion.originalValue).trim();
              if (origin && item.description.includes(origin)) {
                next.description = item.description.replace(origin, value);
              } else {
                next.description = value;
              }
            } else {
              next[field] = value;
            }
            return next;
          };

          if (effectiveSection === 'personalInfo') {
            if (!normalizedField) return newData;
            newData.personalInfo = {
              ...newData.personalInfo,
              [normalizedField!]: suggestion.suggestedValue
            };
            return newData;
          }

          if (effectiveSection === 'workExps' && Array.isArray(newData.workExps)) {
            const targetIndex = findBestTargetIndex(newData.workExps, 'description');
            if (targetIndex < 0) {
              console.warn('Skip workExps suggestion: unable to resolve target item', suggestion);
              return newData;
            }
            newData.workExps = newData.workExps.map((item, index) => {
              if (index !== targetIndex) return item;
              const value = sanitizeSuggestedValue(suggestion.suggestedValue, suggestion.targetSection);
              const field = normalizedField || 'description';
              const next: any = patchFieldValue(item, field, value);
              if (field === 'company' || field === 'title') {
                next.company = value;
                next.title = value;
              }
              if (field === 'position' || field === 'subtitle') {
                next.position = value;
                next.subtitle = value;
              }
              return next;
            });
            return newData;
          }

          if (effectiveSection === 'projects' && Array.isArray(newData.projects)) {
            const targetIndex = findBestTargetIndex(newData.projects, 'description');
            if (targetIndex < 0) {
              console.warn('Skip projects suggestion: unable to resolve target item', suggestion);
              return newData;
            }
            newData.projects = newData.projects.map((item, index) => {
              if (index !== targetIndex) return item;
              const value = sanitizeSuggestedValue(suggestion.suggestedValue, suggestion.targetSection);
              const field = normalizedField || 'description';
              const next: any = patchFieldValue(item, field, value);
              if (field === 'role' || field === 'subtitle') {
                next.role = value;
                next.subtitle = value;
              }
              return next;
            });
            return newData;
          }

          if (effectiveSection === 'educations' && Array.isArray(newData.educations)) {
            const targetIndex = findBestTargetIndex(newData.educations, 'major');
            if (targetIndex < 0) {
              console.warn('Skip educations suggestion: unable to resolve target item', suggestion);
              return newData;
            }
            newData.educations = newData.educations.map((item, index) => {
              if (index !== targetIndex) return item;
              const value = sanitizeSuggestedValue(suggestion.suggestedValue, suggestion.targetSection);
              const field = normalizedField || 'major';
              const next: any = patchFieldValue(item, field, value);
              if (field === 'school' || field === 'title') {
                next.school = value;
                next.title = value;
              }
              if (field === 'major' || field === 'subtitle') {
                next.major = value;
                next.subtitle = value;
              }
              return next;
            });
            return newData;
          }

          if (effectiveSection === 'skills') {
            const safeSkills = toSkillList(suggestion.suggestedValue);
            if (safeSkills.length > 0) newData.skills = safeSkills;
            return newData;
          }

          if (effectiveSection === 'summary') {
            const value = sanitizeSuggestedValue(suggestion.suggestedValue, suggestion.targetSection);
            newData.summary = value;
            newData.personalInfo = {
              ...newData.personalInfo,
              summary: value
            };
            return newData;
          }

          return newData;
        };

        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
          throw new Error('登录已过期，请重新登录后再采纳建议');
        }
        const originalResumeId = resolveOriginalResumeIdForOptimization();
        if (!originalResumeId) {
          throw new Error('未找到原始简历ID，无法创建优化简历');
        }

        const originResult = await DatabaseService.getResume(originalResumeId);
        if (!originResult.success || !originResult.data?.resume_data) {
          throw new Error('未找到原始简历，无法执行优化');
        }
        const originalResume = {
          id: originResult.data.id,
          ...originResult.data.resume_data,
          resumeTitle: originResult.data.title
        } as ResumeData;

        const targetOptimizedId =
          (resumeData.optimizationStatus === 'optimized' &&
            resumeData.id &&
            isSameResumeId(resumeData.optimizedFromId, originalResumeId))
            ? resumeData.id
            : await ensureSingleOptimizedResume(user.id, originalResumeId, originalResume);

        const optimizedResult = await DatabaseService.getResume(targetOptimizedId);
        if (!optimizedResult.success || !optimizedResult.data?.resume_data) {
          throw new Error('未找到优化简历，无法采纳建议');
        }

        const optimizedRowData = optimizedResult.data.resume_data || {};
        const validTarget =
          optimizedRowData.optimizationStatus === 'optimized' &&
          isSameResumeId(optimizedRowData.optimizedFromId, originalResumeId);
        if (!validTarget) {
          throw new Error('检测到优化简历关联异常，已阻止覆盖原简历');
        }

        const baseResume = {
          id: optimizedResult.data.id,
          ...optimizedRowData,
          resumeTitle: optimizedResult.data.title
        } as ResumeData;

        const nextResumeData = applySuggestionToResume(baseResume);
        const updatedSuggestions = suggestions.map(s =>
          s.id === suggestion.id ? { ...s, status: 'accepted' as const } : s
        );

        const baseTitle = allResumes?.find(r => isSameResumeId(r.id, originalResumeId))?.title || '简历';
        const newTitle = buildResumeTitle(baseTitle, nextResumeData, jdText, true);
        let updatedOptimized: ResumeData = {
          ...nextResumeData,
          interviewSessions: nextResumeData.interviewSessions || baseResume.interviewSessions || originalResume.interviewSessions,
          aiSuggestionFeedback: nextResumeData.aiSuggestionFeedback || baseResume.aiSuggestionFeedback || originalResume.aiSuggestionFeedback,
          optimizationStatus: 'optimized' as const,
          optimizedFromId: originalResumeId as any,
          lastJdText: jdText || baseResume.lastJdText || originalResume.lastJdText || '',
          targetCompany: targetCompany || baseResume.targetCompany || originalResume.targetCompany || ''
        };

        let snapshotForPersist: any = null;
        if (report && score > 0) {
          snapshotForPersist = {
            score,
            summary: report.summary || '',
            strengths: report.strengths || [],
            weaknesses: report.weaknesses || [],
            missingKeywords: report.missingKeywords || [],
            scoreBreakdown: report.scoreBreakdown || { experience: 0, skills: 0, format: 0 },
            suggestions: updatedSuggestions,
            updatedAt: new Date().toISOString(),
            jdText: jdText || updatedOptimized.lastJdText || '',
            targetCompany: targetCompany || updatedOptimized.targetCompany || ''
          };
          updatedOptimized = {
            ...updatedOptimized,
            analysisSnapshot: snapshotForPersist
          };
        }

        const updateResult = await DatabaseService.updateResume(String(targetOptimizedId), {
          resume_data: updatedOptimized,
          title: newTitle,
          updated_at: new Date().toISOString()
        });
        if (!updateResult.success) {
          throw new Error(updateResult.error?.message || '更新优化简历失败');
        }

        optimizedResumeIdRef.current = targetOptimizedId;
        setOptimizedResumeId(targetOptimizedId);
        setAnalysisResumeId(targetOptimizedId);
        setResumeData({
          ...updatedOptimized,
          id: targetOptimizedId as any,
          resumeTitle: newTitle
        });
        setSuggestions(updatedSuggestions);
        setChatMessages(prev => prev.map(msg =>
          msg.suggestion?.id === suggestion.id
            ? { ...msg, suggestion: { ...msg.suggestion!, status: 'accepted' as const } }
            : msg
        ));

        if (snapshotForPersist) {
          saveLastAnalysis({
            resumeId: targetOptimizedId,
            jdText: snapshotForPersist.jdText || '',
            targetCompany: snapshotForPersist.targetCompany || '',
            snapshot: snapshotForPersist,
            updatedAt: snapshotForPersist.updatedAt || new Date().toISOString()
          });
        }

        if (loadUserResumes) {
          await loadUserResumes();
        }

        updateScore(5);
      } catch (error) {
        console.error('Error in handleAcceptSuggestionInChat:', error);
        alert(`采纳失败：${(error as any)?.message || '请稍后重试'}`);
      }
    }).catch((error) => {
      console.error('Error in accept suggestion queue:', error);
    });

    await acceptSuggestionQueueRef.current;
  };

  const handleIgnoreSuggestionInChat = (suggestionId: string) => {
    setSuggestions(prev => prev.map(s => s.id === suggestionId ? { ...s, status: 'ignored' as const } : s));

    setChatMessages(prev => prev.map(msg =>
      msg.suggestion?.id === suggestionId
        ? { ...msg, suggestion: { ...msg.suggestion!, status: 'ignored' as const } }
        : msg
    ));

    // AI Follow up with conversation instead of automatic suggestion
    setTimeout(() => {
      setChatMessages(prev => [...prev, {
        id: `ai-ignore-${Date.now()}`,
        role: 'model' as const,
        text: '没问题，我们继续下一题。'
      }]);
    }, 600);
  };

  const handleExportPDF = () => {
    setCurrentView(View.PREVIEW);
  };

  const handleAnalyzeOtherResume = () => {
    setSelectedResumeId(null);
    sourceResumeIdRef.current = null;
    setAnalysisResumeId(null);
    optimizedResumeIdRef.current = null;
    creatingOptimizedResumeRef.current = null;
    creatingOptimizedForOriginalIdRef.current = null;
    clearLastAnalysis();
    setJdText('');
    setSuggestions([]);
    setReport(null);
    setScore(0);
    setOriginalScore(0);
    setChatMessages([]);
    setPendingNextQuestion(null);
    setIsFromCache(false);
    setOptimizedResumeId(null);
    setAnalysisInProgress(false);
    setCurrentStep('resume_select');
  };

  const hasJdInput = () => jdText.length > 0;

  // 处理JD截图上传
  const handleScreenshotUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 文件验证
    const maxSize = 5 * 1024 * 1024; // 5MB
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];

    if (file.size > maxSize) {
      alert('文件大小不能超过5MB');
      return;
    }

    if (!allowedTypes.includes(file.type)) {
      alert('只支持JPG、PNG和WEBP格式的图片');
      return;
    }

    setIsUploading(true);

    try {
      // 读取文件并转换为base64
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64Image = event.target?.result as string;

        const token = await getBackendAuthToken();

        if (!token) {
          alert('登录已过期，请重新登录');
          setIsUploading(false);
          return;
        }

        // 调用后端API进行OCR识别
        const response = await fetch(buildApiUrl('/api/ai/parse-screenshot'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token.trim()}`
          },
          body: JSON.stringify({
            image: base64Image
          })
        });

        if (response.ok) {
          const result = await response.json();
          if (result?.success && result?.text) {
            setJdText(result.text);
            alert('截图识别成功，已填充到文本框');
          } else {
            alert(result?.error || '截图识别失败，请重试');
          }
        } else {
          alert('截图识别失败，请重试');
        }

        setIsUploading(false);
      };

      reader.onerror = () => {
        alert('文件读取失败，请重试');
        setIsUploading(false);
      };

      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Screenshot upload error:', error);
      alert('上传失败，请重试');
      setIsUploading(false);
    }
  };

  // --- Chat Logic ---
  const scrollToBottom = () => {
    // 当消息更新或键盘高度变化时，强制置底
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({
        behavior: "smooth", // 键盘弹出时立即跳转，不平滑滚动
        block: "end"
      });
    }
  };

  useEffect(() => {
    if (currentStep === 'chat') {
      scrollToBottom();
    }
  }, [chatMessages, isSending]);

  // 额外的滚动逻辑，确保新消息时立即滚动
  useEffect(() => {
    if (currentStep === 'chat' && chatMessages.length > 0) {
      scrollToBottom();
    }
  }, [chatMessages.length]);

  // 状态变量，用于跟踪是否已经初始化了聊天消息
  const [chatInitialized, setChatInitialized] = useState(false);

  // 当步骤发生变化时，重置聊天初始化状态
  useEffect(() => {
    if (currentStep !== 'chat') {
      setChatInitialized(false);
    }
  }, [currentStep]);

  useEffect(() => {
    if (currentStep === 'chat') {
      const isNewInterview = !chatInitialized && chatMessages.length === 0;
      if (isNewInterview && !inputMessage) {
        setInputMessage(CHAT_PREFILL_TEXT);
        setIsChatPrefill(true);
      } else if (!isNewInterview && isChatPrefill) {
        setIsChatPrefill(false);
      }
    } else if (isChatPrefill) {
      setIsChatPrefill(false);
    }
  }, [currentStep, chatInitialized, chatMessages.length]);

  useEffect(() => {
    if (currentStep !== 'chat') return;

    if (chatEntrySource === 'internal') return;

    const entrySource = localStorage.getItem('ai_analysis_entry_source');
    if (entrySource !== 'bottom_nav') return;

    localStorage.removeItem('ai_analysis_entry_source');

    if (localStorage.getItem('ai_interview_open') === '1') {
      return;
    }

    const nextStep: Step = score > 0 || suggestions.length > 0 ? 'report' : 'resume_select';
    setChatEntrySource('internal');
    setLastChatStep(nextStep);
    localStorage.setItem('ai_chat_entry_source', 'internal');
    localStorage.setItem('ai_chat_prev_step', nextStep);
    setStepHistory([]);
    setCurrentStep(nextStep);
  }, [currentStep, score, suggestions.length]);


  // 记住用户所在步骤，切换回来可恢复
  useEffect(() => {
    localStorage.setItem('ai_analysis_step', currentStep);
    if (currentStep !== 'resume_select') {
      localStorage.setItem('ai_analysis_has_activity', '1');
    }
  }, [currentStep]);

  // 统一恢复逻辑：优先使用最近一次分析快照（切换页面再回来时）
  useEffect(() => {
    if (currentStep !== 'report') return;
    if (score > 0 || suggestions.length > 0 || report) return;
    const last = loadLastAnalysis();
    if (!last || !last.resumeId) return;

    const snapshotApplied = applyAnalysisSnapshot(last.snapshot);
    if (snapshotApplied) {
      setJdText(last.jdText || '');
      if (last.targetCompany) {
        setTargetCompany(last.targetCompany);
      }
      setAnalysisResumeId(last.resumeId);
      if (!resumeData || String(resumeData.id) !== String(last.resumeId)) {
        DatabaseService.getResume(last.resumeId).then((result) => {
          if (!result.success || !result.data) return;
          const finalResumeData = {
            id: result.data.id,
            ...result.data.resume_data,
            resumeTitle: result.data.title
          };
          if (setResumeData) {
            sourceResumeIdRef.current = finalResumeData.optimizedFromId || finalResumeData.id;
            setResumeData(finalResumeData);
          }
        });
      }
    }
  }, [currentStep, score, suggestions.length, report, resumeData]);

  // 仅保留“最近一次分析快照”的恢复逻辑，移除其它兜底恢复

  // 如果上次停在 analyzing 且没有进行中的请求，回到 JD 输入页
  useEffect(() => {
    const inProgress = localStorage.getItem('ai_analysis_in_progress') === '1';
    if (currentStep === 'analyzing' && !inProgress) {
      setCurrentStep('jd_input');
    }
  }, [currentStep]);

  // 从简历预览页跳转继续面试
  useEffect(() => {
    const shouldOpen = localStorage.getItem('ai_interview_open') === '1';
    const targetId = localStorage.getItem('ai_interview_resume_id');
    if (!shouldOpen || !targetId) return;

    localStorage.removeItem('ai_interview_open');
    localStorage.removeItem('ai_interview_resume_id');

    (async () => {
      const resumeId = targetId;
      const result = await DatabaseService.getResume(resumeId);
      if (result.success && result.data) {
        const finalResumeData = {
          id: result.data.id,
          ...result.data.resume_data,
          resumeTitle: result.data.title
        };
        if (setResumeData) {
          setResumeData(finalResumeData);
        }
        setAnalysisResumeId(result.data.id);
        setOptimizedResumeId(
          finalResumeData.optimizedResumeId ||
          (finalResumeData.optimizationStatus === 'optimized' ? result.data.id : null)
        );
        if (finalResumeData.targetCompany) {
          setTargetCompany(finalResumeData.targetCompany);
        }
        const savedJdText = (finalResumeData.lastJdText || '').trim();
        if (savedJdText) {
          setJdText(savedJdText);
        }
        if (savedJdText) {
          const sessions = finalResumeData.interviewSessions || {};
          const sessionKey = makeJdKey(savedJdText);
          const session = sessions[sessionKey];
          if (session && session.messages?.length) {
            setChatMessages(session.messages as ChatMessage[]);
            setChatInitialized(true);
          } else {
            setChatMessages([]);
            setChatInitialized(false);
          }
        } else {
          setChatMessages([]);
          setChatInitialized(false);
        }
        openChat('preview');
      }
    })();
  }, []);

  // 从预览页跳转到分数页
  useEffect(() => {
    const shouldOpenReport = localStorage.getItem('ai_report_open') === '1';
    const targetId = localStorage.getItem('ai_report_resume_id');
    if (!shouldOpenReport || !targetId) return;

    const payloadRaw = localStorage.getItem('ai_report_resume_payload');
    localStorage.removeItem('ai_report_resume_payload');
    let payload: any = null;
    if (payloadRaw) {
      try {
        payload = JSON.parse(payloadRaw);
      } catch (error) {
        console.warn('Failed to parse ai_report_resume_payload:', error);
        payload = null;
      }
    }

    localStorage.removeItem('ai_report_open');
    localStorage.removeItem('ai_report_resume_id');
    localStorage.setItem('ai_analysis_step', 'report');
    setStepHistory([]);
    setCurrentStep('report');
    setForceReportEntry(true);

    if (payload && String(payload.id) === String(targetId) && payload.resume_data) {
      const finalResumeData = {
        id: payload.id,
        ...payload.resume_data,
        resumeTitle: payload.title || payload.resume_data.resumeTitle || '简历'
      };
      if (setResumeData) {
        sourceResumeIdRef.current = finalResumeData.optimizedFromId || finalResumeData.id;
        setResumeData(finalResumeData);
      }
      setSelectedResumeId(payload.id);
      setAnalysisResumeId(payload.id);
      setOptimizedResumeId(
        finalResumeData.optimizedResumeId ||
        (finalResumeData.optimizationStatus === 'optimized' ? payload.id : null)
      );
      setOriginalResumeData(JSON.parse(JSON.stringify(finalResumeData)));
      if (finalResumeData.targetCompany) {
        setTargetCompany(finalResumeData.targetCompany);
      }
      const restoredJdText = (finalResumeData.lastJdText || '').trim();
      if (restoredJdText) {
        setJdText(restoredJdText);
      }
      applyAnalysisSnapshot(finalResumeData.analysisSnapshot);
      if (finalResumeData.analysisSnapshot) {
        saveLastAnalysis({
          resumeId: payload.id,
          jdText: restoredJdText,
          targetCompany: finalResumeData.targetCompany || '',
          snapshot: finalResumeData.analysisSnapshot,
          updatedAt: finalResumeData.analysisSnapshot.updatedAt || new Date().toISOString()
        });
        setAnalysisResumeId(payload.id);
      }
      navigateToStep('report', true);
      return;
    }

    (async () => {
      const resumeId = targetId;
      const result = await DatabaseService.getResume(resumeId);
      if (result.success && result.data) {
        const finalResumeData = {
          id: result.data.id,
          ...result.data.resume_data,
          resumeTitle: result.data.title
        };
        if (setResumeData) {
          sourceResumeIdRef.current = finalResumeData.optimizedFromId || finalResumeData.id;
          setResumeData(finalResumeData);
        }
        setOptimizedResumeId(
          finalResumeData.optimizedResumeId ||
          (finalResumeData.optimizationStatus === 'optimized' ? result.data.id : null)
        );
        if (finalResumeData.targetCompany) {
          setTargetCompany(finalResumeData.targetCompany);
        }
        const restoredJdText = (finalResumeData.lastJdText || '').trim();
        if (restoredJdText) {
          setJdText(restoredJdText);
        }
        applyAnalysisSnapshot(finalResumeData.analysisSnapshot);
        if (finalResumeData.analysisSnapshot) {
          saveLastAnalysis({
            resumeId: result.data.id,
            jdText: restoredJdText,
            targetCompany: finalResumeData.targetCompany || '',
            snapshot: finalResumeData.analysisSnapshot,
            updatedAt: finalResumeData.analysisSnapshot.updatedAt || new Date().toISOString()
          });
          setAnalysisResumeId(result.data.id);
        }
        navigateToStep('report', true);
      } else {
        handleResumeSelect(resumeId, true);
      }
    })();
  }, []);

  useEffect(() => {
    if (currentStep !== 'jd_input') return;
    if (resumeReadState.status !== 'idle') return;
    if (!resumeData?.id) return;
    const fallbackLabel =
      (resumeData.resumeTitle || '').trim() ||
      ((resumeData.personalInfo?.name || '').trim() ? `${resumeData.personalInfo.name.trim()}的简历` : '当前简历');
    setResumeReadState({
      status: 'success',
      message: `已成功读取《${fallbackLabel}》`
    });
  }, [currentStep, resumeData?.id, resumeData?.resumeTitle, resumeData?.personalInfo?.name, resumeReadState.status]);

  // 当切换到聊天步骤时，先弹出整体总结，然后询问用户是否开始面试
  useEffect(() => {
    if (currentStep === 'chat' && !chatInitialized && chatMessages.length === 0) {
      console.log('Generating chat summary...');
      console.log('Current state:', {
        currentStep,
        suggestionsLength: suggestions.length,
        chatInitialized,
        score,
        resumeData: resumeData?.personalInfo?.name
      });

      // 标记聊天已初始化，避免重复运行
      setChatInitialized(true);

      // 获取用户名字，只使用名字部分，不带姓氏
      let userName = '';
      if (resumeData?.personalInfo?.name) {
        // 提取名字部分，移除姓氏
        const fullName = resumeData.personalInfo.name;
        // 简单处理：如果名字包含空格或中文姓氏，只取最后一个部分
        if (fullName.includes(' ')) {
          // 英文名字，取最后一个单词
          userName = fullName.split(' ').pop() || fullName;
        } else if (fullName.length >= 2) {
          // 中文名字，取后两个字（假设姓氏为单字）
          userName = fullName.slice(-2);
        } else {
          // 单字名字或其他情况，直接使用
          userName = fullName;
        }
      }

      // 先显示问候和面试介绍消息
      setTimeout(() => {
        const greeting = userName ? `${userName}，您好！` : '您好！';
        const summaryMessage = {
          id: 'ai-summary',
          role: 'model' as const,
          text: `${greeting}我是您的 AI 模拟面试官。${jdText ? '我已经阅读了您的简历和目标职位描述，' : '我已经阅读了您的简历，'}接下来将基于这些信息对您进行模拟面试。每题会给出点评、改进要点与参考回复。`
        };
        console.log('Adding summary message:', summaryMessage);
        setChatMessages(prev => (prev.some(m => m.id === summaryMessage.id) ? prev : [...prev, summaryMessage]));

        // 然后询问用户是否准备好开始面试
        setTimeout(() => {
          const askMessage = {
            id: 'ai-ask',
            role: 'model' as const,
            text: '请问您准备好开始模拟面试了吗？您可以回复"准备好了"开始，我会根据您的简历和岗位要求提出面试问题。'
          };
          console.log('Adding ask message:', askMessage);
          setChatMessages(prev => (prev.some(m => m.id === askMessage.id) ? prev : [...prev, askMessage]));
        }, 1500);
      }, 1000);
    }
  }, [currentStep, suggestions, score, resumeData, chatInitialized, jdText, chatMessages.length]);

  const handleSendMessage = async (textOverride?: string) => {
    const textToSend = textOverride || inputMessage;
    if (!textToSend.trim()) return;

    if (isChatPrefill && textToSend === CHAT_PREFILL_TEXT) {
      setIsChatPrefill(false);
    }

    // Add user message
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: textToSend
    };
    setChatMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsSending(true);

    try {
      if (currentStep === 'chat' && pendingNextQuestion) {
        if (isAffirmative(textToSend)) {
          const nextMsg: ChatMessage = {
            id: `ai-next-${Date.now()}`,
            role: 'model',
            text: `下一题：${pendingNextQuestion}`
          };
          const newMessages = [...chatMessages, userMessage, nextMsg];
          setChatMessages(newMessages);
          setPendingNextQuestion(null);
          await persistInterviewSession(newMessages, jdText);
          setIsSending(false);
          return;
        }
        if (isNegative(textToSend)) {
          const holdMsg: ChatMessage = {
            id: `ai-hold-${Date.now()}`,
            role: 'model',
            text: '好的，我们先继续讨论。有需要再告诉我“继续下一题”。'
          };
          const newMessages = [...chatMessages, userMessage, holdMsg];
          setChatMessages(newMessages);
          await persistInterviewSession(newMessages, jdText);
          setIsSending(false);
          return;
        }
      }

      // 优先尝试使用后端 API
      console.log('Trying backend API for chat...');

      const token = await getBackendAuthToken();
      if (!token) {
        throw new Error('请先登录以使用 AI 功能');
      }

      const apiEndpoint = buildApiUrl('/api/ai/chat');

      const masker = createMasker();
      const isInterviewChat = currentStep === 'chat';
      const isQaMode = isInterviewChat && !!pendingNextQuestion && !isAffirmative(textToSend) && !isNegative(textToSend);
      const isStartPhase = chatMessages.length > 0 && (chatMessages[chatMessages.length - 1].id === 'ai-ask' || chatMessages[chatMessages.length - 1].text.includes('准备好'));
      const interviewWrapped = isInterviewChat
        ? (isQaMode
          ? `[INTERVIEW_MODE]\n【答疑阶段：请就候选人问题进行讨论答疑，不要给出下一题或简历优化建议。】\n\n候选人问题：${textToSend}`
          : (isStartPhase && isAffirmative(textToSend)
            ? `[INTERVIEW_MODE]\n【面试开始：候选人已准备好。请根据简历和JD，提出与岗位匹配的第一个专业面试问题。直接提问，不要加任何前缀或标签。】`
            : `[INTERVIEW_MODE]\n【面试官角色保持：请仅进行模拟面试流程。回复请自然流畅，不要使用“点评”、“提问”等标签。内容需包含：1.对回答的简短反馈；2.改进建议（如有）；3.参考回复；4.自然地提出下一题。】\n\n候选人回答：${textToSend}`)
        )
        : textToSend;
      const maskedMessage = masker.maskText(interviewWrapped);
      const maskedResumeData = masker.maskObject(resumeData);
      const maskedChatHistory = chatMessages.map((m) => ({
        ...m,
        text: masker.maskText(m.text)
      }));
      const maskedJdText = masker.maskText(jdText || '');

      console.log('API Endpoint:', apiEndpoint);
      console.log('Request Data:', {
        message: maskedMessage,
        resumeData: maskedResumeData,
        chatHistory: maskedChatHistory,
        score: score,
        suggestions: suggestions
      });

      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token.trim()}`
        },
        body: JSON.stringify({
          message: maskedMessage,
          resumeData: maskedResumeData,
          jobDescription: maskedJdText,  // Send JD for interview context
          chatHistory: maskedChatHistory,
          score: score,
          suggestions: isInterviewChat ? [] : suggestions
        })
      });

      console.log('Response Status:', response.status);

      if (response.ok) {
        const result = await response.json();
        console.log('Backend API success');
        console.log('API Response:', result);

        // 普通聊天响应
        const unmaskedText = masker.unmaskText(result.response || '感谢你的回答，我们继续下一题。');
        const { cleaned, next } = splitNextQuestion(unmaskedText);
        const aiMessage: ChatMessage = {
          id: `ai-${Date.now()}`,
          role: 'model',
          text: cleaned || unmaskedText
        };
        const newMessages = [...chatMessages, userMessage, aiMessage];
        let finalMessages = newMessages;
        if (next) {
          setPendingNextQuestion(next);
          const askNext: ChatMessage = {
            id: `ai-ask-next-${Date.now()}`,
            role: 'model',
            text: '要继续下一题吗？'
          };
          finalMessages = [...newMessages, askNext];
        }
        setChatMessages(finalMessages);
        await persistInterviewSession(finalMessages, jdText);

      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('Backend API failed:', errorData);
        throw new Error(errorData.error || 'Backend API failed');
      }
    } catch (error) {
      console.error('API failed:', error);
      // 显示 Toast 提示，不回退到模拟响应
      alert('AI 连接暂时中断');
    } finally {
      setIsSending(false);
    }
  };

  const getScoreColor = (s: number) => {
    if (s >= 90) return 'text-green-500';
    if (s >= 70) return 'text-primary';
    return 'text-orange-500';
  };

  const parseReferenceReply = (text: string) => {
    const refLabel = '参考回复：';
    const nextLabel = '下一题：';
    const refIndex = text.indexOf(refLabel);
    if (refIndex === -1) return null;
    const afterRef = refIndex + refLabel.length;
    const nextIndex = text.indexOf(nextLabel, afterRef);
    const before = text.slice(0, refIndex).trim();
    const reference = (nextIndex === -1 ? text.slice(afterRef) : text.slice(afterRef, nextIndex)).trim();
    const after = nextIndex === -1 ? '' : text.slice(nextIndex).trim();
    return { before, reference, after };
  };

  const splitNextQuestion = (text: string) => {
    const nextLabel = '下一题：';
    const nextIndex = text.indexOf(nextLabel);
    if (nextIndex === -1) return { cleaned: text, next: null };
    const cleaned = text.slice(0, nextIndex).trim();
    const next = text.slice(nextIndex + nextLabel.length).trim();
    return { cleaned, next: next || null };
  };

  const isAffirmative = (text: string) => {
    const t = text.trim().toLowerCase();
    return ['好', '好的', '可以', '继续', '继续吧', '开始', '开始吧', '行', '嗯', 'ok', 'yes'].some(k => t === k || t.includes(k));
  };

  const isNegative = (text: string) => {
    const t = text.trim().toLowerCase();
    return ['不要', '不', '不想', '先不', '稍后', '等等', '暂停', '不是', 'no'].some(k => t === k || t.includes(k));
  };

  // ================= RENDER STEPS =================
  if (currentStep === 'resume_select') {
    return (
      <div className="flex flex-col min-h-screen bg-background-light dark:bg-background-dark animate-in fade-in duration-300">
        <header className="sticky top-0 z-50 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md border-b border-gray-200 dark:border-white/5">
          <div className="flex items-center justify-between h-14 px-4 relative">
            <button onClick={handleStepBack} className="p-2 -ml-2 rounded-full hover:bg-slate-200 dark:hover:bg-white/10 text-slate-900 dark:text-white">
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <h1 className="text-lg font-bold tracking-tight">AI 智能诊断</h1>
            <div className="w-8"></div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto pb-32">
          <div className="px-4 pt-4 pb-2">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">第一步：选择简历</h2>
          </div>
          <div className="flex flex-col">
            {/* 已优化 */}
            <button
              onClick={() => setIsOptimizedOpen(v => !v)}
              className="w-full flex items-center justify-between px-4 pt-2 text-lg font-bold text-slate-900 dark:text-white"
            >
              <span>已优化</span>
              <span className="material-symbols-outlined text-[20px] text-slate-500 dark:text-slate-400">
                {isOptimizedOpen ? 'expand_less' : 'expand_more'}
              </span>
            </button>
            {isOptimizedOpen && (() => {
              const optimizedResumes = (allResumes || []).filter(r => r.optimizationStatus === 'optimized');
              return optimizedResumes.length > 0 ? (
                optimizedResumes.map((resume) => (
                  <div
                    key={resume.id}
                    onClick={() => handleResumeSelect(resume.id, false)}
                    className="group relative flex items-center gap-4 px-4 py-4 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors cursor-pointer border-b border-gray-100 dark:border-white/5"
                  >
                    <div className="shrink-0 relative">
                      <div className="bg-white dark:bg-slate-700 aspect-[210/297] w-14 rounded-lg shadow-sm border border-slate-200 dark:border-slate-600 overflow-hidden relative">
                        {resume.thumbnail}
                      </div>
                    </div>
                    <div className="flex flex-col flex-1 justify-center min-w-0">
                      <p className="text-slate-900 dark:text-white text-base font-medium leading-normal line-clamp-1 mb-1">{resume.title}</p>
                      <p className="text-slate-500 dark:text-text-secondary text-sm font-normal leading-normal line-clamp-1">
                        上次修改: {new Date(resume.date).toLocaleString('zh-CN', { hour12: false })}
                      </p>
                    </div>
                    <span className="material-symbols-outlined text-slate-400 dark:text-slate-500 group-hover:text-primary transition-colors">arrow_forward_ios</span>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-slate-500 text-sm">
                  暂无已优化简历
                </div>
              );
            })()}

            {/* 未优化 */}
            <button
              onClick={() => setIsUnoptimizedOpen(v => !v)}
              className="w-full flex items-center justify-between px-4 pt-4 text-lg font-bold text-slate-900 dark:text-white"
            >
              <span>未优化</span>
              <span className="material-symbols-outlined text-[20px] text-slate-500 dark:text-slate-400">
                {isUnoptimizedOpen ? 'expand_less' : 'expand_more'}
              </span>
            </button>
            {isUnoptimizedOpen && (() => {
              const unoptimizedResumes = (allResumes || []).filter(r => r.optimizationStatus !== 'optimized');
              return unoptimizedResumes.length > 0 ? (
                unoptimizedResumes.map((resume) => (
                  <div
                    key={resume.id}
                    onClick={() => handleResumeSelect(resume.id, false)}
                    className="group relative flex items-center gap-4 px-4 py-4 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors cursor-pointer border-b border-gray-100 dark:border-white/5"
                  >
                    <div className="shrink-0 relative">
                      <div className="bg-white dark:bg-slate-700 aspect-[210/297] w-14 rounded-lg shadow-sm border border-slate-200 dark:border-slate-600 overflow-hidden relative">
                        {resume.thumbnail}
                      </div>
                    </div>
                    <div className="flex flex-col flex-1 justify-center min-w-0">
                      <p className="text-slate-900 dark:text-white text-base font-medium leading-normal line-clamp-1 mb-1">{resume.title}</p>
                      <p className="text-slate-500 dark:text-text-secondary text-sm font-normal leading-normal line-clamp-1">
                        上次修改: {new Date(resume.date).toLocaleString('zh-CN', { hour12: false })}
                      </p>
                    </div>
                    <span className="material-symbols-outlined text-slate-400 dark:text-slate-500 group-hover:text-primary transition-colors">arrow_forward_ios</span>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-slate-500 text-sm">
                  暂无未优化简历
                </div>
              );
            })()}
          </div>
        </main>
      </div>
    );
  }

  // 2. JD Input
  if (currentStep === 'jd_input') {
    const selectedResumeLabel = (() => {
      const selected = (allResumes || []).find((item) => isSameResumeId(item.id, selectedResumeId));
      if (selected?.title) return selected.title;
      if (resumeData?.resumeTitle) return resumeData.resumeTitle;
      const name = (resumeData?.personalInfo?.name || '').trim();
      if (name) return `${name}的简历`;
      return '当前简历';
    })();
    const statusTone = (() => {
      if (resumeReadState.status === 'success') {
        return {
          bg: 'bg-emerald-50/50 dark:bg-emerald-500/5',
          border: 'border-emerald-100 dark:border-emerald-500/20',
          text: 'text-emerald-700 dark:text-emerald-400',
          icon: 'check_circle',
          badge: '已就绪'
        };
      }
      if (resumeReadState.status === 'loading') {
        return {
          bg: 'bg-blue-50/50 dark:bg-blue-500/5',
          border: 'border-blue-100 dark:border-blue-500/20',
          text: 'text-blue-700 dark:text-blue-400',
          icon: 'sync',
          badge: '读取中'
        };
      }
      if (resumeReadState.status === 'error') {
        return {
          bg: 'bg-rose-50/50 dark:bg-rose-500/5',
          border: 'border-rose-100 dark:border-rose-500/20',
          text: 'text-rose-700 dark:text-rose-400',
          icon: 'error',
          badge: '读取失败'
        };
      }
      return {
        bg: 'bg-slate-50/50 dark:bg-slate-500/5',
        border: 'border-slate-100 dark:border-slate-500/20',
        text: 'text-slate-600 dark:text-slate-400',
        icon: 'info',
        badge: '初始化'
      };
    })();
    const statusMessage =
      resumeReadState.status === 'idle'
        ? `尚未读取简历，请先返回上一步选择简历（当前：${selectedResumeLabel}）`
        : resumeReadState.message;

    return (
      <div className="flex flex-col min-h-screen bg-background-light dark:bg-background-dark animate-in slide-in-from-right duration-300">
        <header className="sticky top-0 z-50 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md border-b border-gray-200 dark:border-white/5">
          <div className="flex items-center justify-between h-14 px-4 relative">
            <button onClick={handleStepBack} className="p-2 -ml-2 rounded-full hover:bg-slate-200 dark:hover:bg-white/10 text-slate-900 dark:text-white">
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <h1 className="text-lg font-bold tracking-tight">第二步：添加职位描述</h1>
            <div className="w-8"></div>
          </div>
        </header>
        <main className="p-4 flex flex-col gap-6">
          <div className={`p-4 rounded-2xl border transition-all duration-300 ${statusTone.bg} ${statusTone.border}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`size-10 rounded-full flex items-center justify-center ${statusTone.bg} ${statusTone.border}`}>
                  <span className={`material-symbols-outlined ${statusTone.text}`}>description</span>
                </div>
                <div>
                  <h4 className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">当前分析简历</h4>
                  <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">{selectedResumeLabel}</p>
                </div>
              </div>
              <div className={`px-2.5 py-1 rounded-full text-[10px] font-bold border flex items-center gap-1.5 ${statusTone.bg} ${statusTone.border} ${statusTone.text}`}>
                <span className={`material-symbols-outlined text-[14px] ${resumeReadState.status === 'loading' ? 'animate-spin' : ''}`}>{statusTone.icon}</span>
                {statusTone.badge}
              </div>
            </div>
            {resumeReadState.status !== 'success' && (
              <p className={`mt-3 text-xs leading-relaxed ${statusTone.text}`}>
                {statusMessage}
              </p>
            )}
          </div>

          <div className="bg-white dark:bg-surface-dark p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/5">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-primary">description</span>
              <h3 className="font-bold text-slate-900 dark:text-white">职位描述 (JD)</h3>
            </div>
            <div className="mb-3">
              <label className="text-xs font-medium text-slate-500 dark:text-text-secondary uppercase tracking-wider">目标公司（可选）</label>
              <input
                value={targetCompany}
                onChange={(e) => setTargetCompany(e.target.value)}
                placeholder="例如：字节跳动 / 腾讯"
                className="mt-2 w-full rounded-xl bg-slate-50 dark:bg-[#111a22] border border-slate-200 dark:border-[#324d67] p-3 text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all text-sm"
                type="text"
              />
            </div>
            <textarea
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              placeholder="请粘贴目标职位的 JD 内容，AI 将为您进行针对性的人岗匹配分析..."
              className="w-full h-40 rounded-xl bg-slate-50 dark:bg-[#111a22] border-0 p-4 text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-primary outline-none resize-none text-sm leading-relaxed"
              maxLength={1000}
            ></textarea>

            {/* 截图上传按钮 */}
            <div className="mt-3">
              <button
                onClick={() => !isUploading && document.getElementById('jd-screenshot-upload')?.click()}
                disabled={isUploading}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-50 dark:hover:bg-[#111a22] transition-all disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isUploading ? (
                  <span className="size-5 border-2 border-slate-400 border-t-primary rounded-full animate-spin"></span>
                ) : (
                  <span className="material-symbols-outlined">image</span>
                )}
                {isUploading ? '上传成功，正在解析...' : '上传JD截图'}
              </button>
              <input
                type="file"
                id="jd-screenshot-upload"
                accept="image/*"
                onChange={handleScreenshotUpload}
                className="hidden"
              />
            </div>

          </div>

          <div className="flex gap-4 mt-2">
            <button
              onClick={() => setCurrentStep('resume_select')}
              className="flex-1 py-3.5 rounded-xl border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 font-bold hover:bg-slate-50 dark:hover:bg-white/5 active:scale-[0.98] transition-all"
            >
              上一步
            </button>
            <button
              onClick={handleStartAnalysisClick}
              className="flex-[2] py-3.5 rounded-xl bg-primary text-white font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-600 active:scale-[0.98] transition-all"
            >
              开始分析
            </button>
          </div>

          {showJdEmptyModal && (
            <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 px-6">
              <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-[#324d67] shadow-xl p-6">
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 mb-2">
                  <span className="material-symbols-outlined">warning</span>
                  <h3 className="text-base font-semibold">未填写职位描述</h3>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  当前未填写 JD，分析结果将基于通用简历优化逻辑，无法进行岗位定向匹配。是否继续？
                </p>
                <div className="mt-5 flex gap-3">
                  <button
                    onClick={() => setShowJdEmptyModal(false)}
                    className="flex-1 rounded-xl border border-slate-300 dark:border-slate-600 py-2.5 text-slate-700 dark:text-slate-200 font-medium hover:bg-slate-50 dark:hover:bg-white/5 transition-all"
                  >
                    去填写JD
                  </button>
                  <button
                    onClick={() => {
                      setShowJdEmptyModal(false);
                      startAnalysis();
                    }}
                    className="flex-1 rounded-xl bg-primary text-white py-2.5 font-semibold hover:bg-blue-600 transition-all"
                  >
                    继续分析
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    );
  }

  // 3. Analyzing
  if (currentStep === 'analyzing') {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center bg-background-light dark:bg-background-dark">
        <div className="relative size-28 mb-8">
          <div className="absolute inset-0 rounded-full border-4 border-slate-200 dark:border-white/10"></div>
          <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center">
              <span className="material-symbols-outlined text-4xl text-primary animate-pulse mb-1">compare_arrows</span>
              {hasJdInput() && <span className="text-[10px] font-bold text-primary uppercase">JD Match</span>}
            </div>
          </div>
        </div>
        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
          {hasJdInput() ? '正在进行人岗匹配...' : '正在深度诊断简历...'}
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center max-w-xs leading-relaxed">
          {hasJdInput()
            ? 'AI 正在对比您的简历与目标职位描述，分析关键词覆盖率与核心能力差距。'
            : 'AI 正在检查您的简历内容完整性、格式规范以及语言表达的专业度。'}
        </p>
      </div>
    );
  }

  // 4. Report View (Simplified, focus on Chat Entry)
  if (currentStep === 'report') {
    const hasAcceptedSuggestion = suggestions.some(s => s.status === 'accepted');

    return (
      <div className="flex flex-col min-h-screen bg-background-light dark:bg-background-dark animate-in fade-in duration-300 relative">
        <header className="sticky top-0 z-40 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md border-b border-gray-200 dark:border-white/5">
          <div className="flex items-center justify-between h-14 px-4 relative">
            <button onClick={handleStepBack} className="p-2 -ml-2 rounded-full hover:bg-slate-200 dark:hover:bg-white/10 text-slate-900 dark:text-white">
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <h1 className="text-lg font-bold tracking-tight">诊断报告</h1>
            <div className="w-8"></div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4">
          {/* Score Card with Breakdown */}
          <div className="bg-white dark:bg-surface-dark rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-white/5 mb-6 relative overflow-hidden">
            <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${score >= 80 ? 'from-green-400 to-emerald-600' : 'from-orange-400 to-red-500'}`}></div>

            {/* Total Score */}
            <div className="text-center mb-6">
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3">
                {hasJdInput() ? '人岗匹配度' : '简历综合评分'}
              </p>
              <div className={`text-7xl font-black tracking-tight transition-all duration-500 ${getScoreColor(originalScore || score)}`}>
                {score}
                <span className="text-2xl text-slate-400 font-normal ml-1">/100</span>
              </div>
            </div>

            {/* Score Breakdown */}
            {report?.scoreBreakdown && (
              <div className="grid gap-3 pt-4 border-t border-slate-100 dark:border-white/5">
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-slate-600 dark:text-slate-300">经验匹配</span>
                    <span className="text-slate-900 dark:text-white">{report.scoreBreakdown.experience}分</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 dark:bg-black/20 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${report.scoreBreakdown.experience}%` }}></div>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-slate-600 dark:text-slate-300">技能相关</span>
                    <span className="text-slate-900 dark:text-white">{report.scoreBreakdown.skills}分</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 dark:bg-black/20 rounded-full overflow-hidden">
                    <div className="h-full bg-purple-500 rounded-full" style={{ width: `${report.scoreBreakdown.skills}%` }}></div>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-slate-600 dark:text-slate-300">格式规范</span>
                    <span className="text-slate-900 dark:text-white">{report.scoreBreakdown.format}分</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 dark:bg-black/20 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full" style={{ width: `${report.scoreBreakdown.format}%` }}></div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* AI Analysis Summary - NEW POSITION */}
          {report?.summary && (
            <div className="bg-blue-50/50 dark:bg-blue-900/10 rounded-2xl p-5 border border-blue-100 dark:border-blue-900/20 mb-6">
              <h3 className="flex items-center gap-2 font-bold text-blue-800 dark:text-blue-400 text-base mb-2">
                <span className="material-symbols-outlined text-[20px]">psychology</span>
                AI 深度诊断总结
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {report.summary}
              </p>
            </div>
          )}

          {/* AI Optimization Suggestions - Editable */}
          {suggestions.filter(s => s.status === 'pending').length > 0 && (
            <div className="mb-6">
              <h3 className="flex items-center gap-2 font-bold text-slate-800 dark:text-white text-lg mb-4">
                <span className="material-symbols-outlined text-primary">auto_fix_high</span>
                AI 优化建议 ({suggestions.filter(s => s.status === 'pending').length})
              </h3>
              <div className="space-y-4">
                {suggestions.filter(s => s.status === 'pending').map((suggestion) => (
                  <div key={suggestion.id} className="bg-white dark:bg-surface-dark rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden shadow-sm">
                    {/* Header */}
                    <div className="px-4 py-3 bg-slate-50 dark:bg-white/5 border-b border-slate-100 dark:border-white/5">
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-xs font-bold text-primary uppercase tracking-wider">{suggestion.title}</span>
                        <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                          {getSuggestionModuleLabel(suggestion)}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-300">{suggestion.reason}</p>

                    </div>

                    {/* Original and Suggested Content - Stacked for better mobile view */}
                    <div className="flex flex-col divide-y divide-slate-100 dark:divide-white/5">
                      {/* Original */}
                      <div className="p-4 bg-red-50/30 dark:bg-red-900/5">
                        <p className="text-xs font-bold text-red-400 mb-2 uppercase">修改前</p>
                        <div className="text-sm text-slate-500 bg-white/50 dark:bg-black/20 p-3 rounded-lg border border-red-100 dark:border-red-900/20 min-h-[80px]">
                          {getDisplayOriginalValue(suggestion) || <span className="italic text-slate-400">无内容</span>}
                        </div>
                      </div>

                      {/* Suggested (Editable) */}
                      <div className="p-4 bg-green-50/30 dark:bg-green-900/5">
                        <p className="text-xs font-bold text-green-500 mb-2 uppercase flex justify-between items-center">
                          修改建议 (可编辑)
                          <span className="material-symbols-outlined text-[14px]">
                            {suggestion.targetSection === 'skills' ? 'extension' : 'edit'}
                          </span>
                        </p>
                        {suggestion.targetSection === 'skills' ? (
                          <div className="p-3 bg-white dark:bg-black/20 rounded-lg border border-green-200 dark:border-green-900/30">
                            <div className="flex flex-wrap gap-2 min-h-[44px]">
                              {toSkillList(suggestion.suggestedValue).map((skill: string, idx: number) => (
                                <span key={idx} className="flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded-md text-xs font-medium border border-primary/20">
                                  {skill}
                                  <button
                                    onClick={() => {
                                      setSuggestions(prev => prev.map(s => {
                                        if (s.id !== suggestion.id) return s;
                                        const list = toSkillList(s.suggestedValue);
                                        list.splice(idx, 1);
                                        return { ...s, suggestedValue: list };
                                      }));
                                    }}
                                    className="text-primary/70 hover:text-primary"
                                    aria-label="remove-skill"
                                    type="button"
                                  >
                                    <span className="material-symbols-outlined text-[12px]">close</span>
                                  </button>
                                </span>
                              ))}
                              {(!suggestion.suggestedValue || (Array.isArray(suggestion.suggestedValue) && suggestion.suggestedValue.length === 0)) && (
                                <span className="text-slate-400 italic text-xs">建议补充相关技能</span>
                              )}
                            </div>
                            <div className="mt-3 flex items-center gap-2">
                              <input
                                type="text"
                                placeholder="新增技能，回车添加"
                                className="flex-1 text-xs text-slate-800 dark:text-slate-200 bg-white/80 dark:bg-black/30 px-3 py-2 rounded-md border border-slate-200 dark:border-white/10 focus:ring-2 focus:ring-green-500/30 outline-none"
                                onKeyDown={(e) => {
                                  if (e.key !== 'Enter') return;
                                  const value = e.currentTarget.value.trim();
                                  if (!value) return;
                                  setSuggestions(prev => prev.map(s => {
                                    if (s.id !== suggestion.id) return s;
                                    const list = toSkillList(s.suggestedValue);
                                    if (!list.includes(value)) list.push(value);
                                    return { ...s, suggestedValue: toSkillList(list) };
                                  }));
                                  e.currentTarget.value = '';
                                }}
                              />
                              <button
                                type="button"
                                className="px-3 py-2 text-xs font-semibold text-white bg-primary rounded-md hover:bg-primary/90"
                                onClick={(e) => {
                                  const input = (e.currentTarget.previousElementSibling as HTMLInputElement | null);
                                  if (!input) return;
                                  const value = input.value.trim();
                                  if (!value) return;
                                  setSuggestions(prev => prev.map(s => {
                                    if (s.id !== suggestion.id) return s;
                                    const list = toSkillList(s.suggestedValue);
                                    if (!list.includes(value)) list.push(value);
                                    return { ...s, suggestedValue: toSkillList(list) };
                                  }));
                                  input.value = '';
                                }}
                              >
                                添加
                              </button>
                            </div>
                          </div>
                        ) : (
                          <textarea
                            value={Array.isArray(suggestion.suggestedValue) ? suggestion.suggestedValue.join(', ') : suggestion.suggestedValue}
                            onChange={(e) => {
                              setSuggestions(prev => prev.map(s =>
                                s.id === suggestion.id ? { ...s, suggestedValue: e.target.value } : s
                              ));
                            }}
                            className="w-full text-sm text-slate-800 dark:text-slate-200 bg-white dark:bg-black/20 p-3 rounded-lg border border-green-200 dark:border-green-900/30 min-h-[120px] focus:ring-2 focus:ring-green-500/30 outline-none resize-y transition-all"
                          />
                        )}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="p-3 flex items-center justify-between bg-slate-50 dark:bg-white/5 border-t border-slate-100 dark:border-white/5">
                      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span>这条建议有帮助吗？</span>
                        <button
                          onClick={() => persistSuggestionFeedback(suggestion, 'up')}
                          className={`inline-flex items-center justify-center size-6 rounded-full border transition-colors ${suggestion.rating === 'up'
                            ? 'border-green-500 text-green-600 bg-green-50 dark:bg-green-900/20'
                            : 'border-slate-200 dark:border-white/10 text-slate-400 hover:text-green-600 hover:border-green-400'
                            }`}
                          aria-label="点赞"
                        >
                          <span className="material-symbols-outlined text-[16px]">thumb_up</span>
                        </button>
                        <button
                          onClick={() => persistSuggestionFeedback(suggestion, 'down')}
                          className={`inline-flex items-center justify-center size-6 rounded-full border transition-colors ${suggestion.rating === 'down'
                            ? 'border-rose-500 text-rose-600 bg-rose-50 dark:bg-rose-900/20'
                            : 'border-slate-200 dark:border-white/10 text-slate-400 hover:text-rose-600 hover:border-rose-400'
                            }`}
                          aria-label="点踩"
                        >
                          <span className="material-symbols-outlined text-[16px]">thumb_down</span>
                        </button>
                      </div>
                      <div className="flex gap-3">
                        <button
                          onClick={() => {
                            setSuggestions(prev => prev.map(s => s.id === suggestion.id ? { ...s, status: 'ignored' as const } : s));
                          }}
                          className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 font-medium transition-colors"
                        >
                          忽略
                        </button>
                        <button
                          onClick={() => handleAcceptSuggestionInChat(suggestion)}
                          className="px-6 py-2 text-sm bg-primary hover:bg-blue-600 text-white font-bold rounded-lg shadow-sm shadow-blue-500/20 active:scale-95 transition-all flex items-center gap-2"
                        >
                          <span className="material-symbols-outlined text-[18px]">check</span>
                          采纳优化
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}



          {/* Export PDF & Analyze Other Buttons - Arranged side-by-side */}
          <div className="mb-40 flex gap-3">
            <button
              onClick={handleExportPDF}
              disabled={!hasAcceptedSuggestion}
              className={`flex-1 flex items-center justify-center gap-2 h-14 rounded-xl shadow-lg transition-all transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${!hasAcceptedSuggestion
                ? 'bg-slate-300 dark:bg-slate-800 text-slate-500'
                : 'bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 dark:hover:bg-slate-600 text-white'
                }`}
            >
              <span className="material-symbols-outlined text-[20px]">download</span>
              <span className="text-sm font-bold tracking-wide">前往预览导出</span>
            </button>
            <button
              onClick={handleAnalyzeOtherResume}
              className="flex-1 flex items-center justify-center gap-2 h-14 rounded-xl shadow-lg bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 dark:hover:bg-slate-600 text-white transition-all active:scale-[0.98]"
            >
              <span className="material-symbols-outlined text-[20px]">restart_alt</span>
              <span className="text-sm font-bold tracking-wide">分析其他简历</span>
            </button>

          </div>
        </main>

        {/* Fixed AI Advisor Button - Above Navigation Bar */}
        <div className="fixed bottom-[48px] left-0 right-0 px-4 py-3 bg-white/95 dark:bg-[#101922]/95 backdrop-blur-md border-t border-slate-200 dark:border-white/10 z-[40]">
          <button
            onClick={() => openChat('internal')}
            className="w-full flex items-center justify-between px-5 py-3 bg-gradient-to-r from-primary to-blue-600 text-white rounded-xl shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="relative size-10 rounded-full overflow-hidden border-2 border-white/30 bg-white">
                <img src="https://api.dicebear.com/9.x/avataaars/svg?seed=Felix" alt="AI Advisor" className="w-full h-full object-cover" />
                <span className="absolute bottom-0 right-0 size-2.5 bg-green-500 rounded-full border-2 border-white"></span>
              </div>
              <div className="text-left">
                <p className="text-sm font-bold">AI 模拟面试官</p>
                <p className="text-xs text-blue-100">点击开始模拟面试</p>
              </div>
            </div>
            <div className="size-9 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition-colors">
              <span className="material-symbols-outlined text-xl">arrow_forward</span>
            </div>
          </button>
        </div>
      </div>
    );
  }

  // 5. Chat Page (Full Screen with Interactive Cards)
  if (currentStep === 'chat') {
    return (
      <div className="fixed inset-0 z-[100] bg-slate-50 dark:bg-[#0b1219] flex flex-col animate-in slide-in-from-right duration-300">
        {/* Chat Header */}
        <div className="flex items-center justify-between p-4 bg-white/80 dark:bg-[#1c2936]/80 backdrop-blur-md border-b border-slate-200 dark:border-white/5 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <button onClick={handleStepBack} className="p-1 -ml-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10">
              <span className="material-symbols-outlined text-slate-900 dark:text-white">arrow_back</span>
            </button>
            <div className="size-10 rounded-full border border-slate-200 dark:border-slate-700 overflow-hidden bg-white">
              <img src="https://api.dicebear.com/9.x/avataaars/svg?seed=Felix" alt="AI Agent" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white leading-tight">AI 模拟面试官</h3>
              <div className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-green-500 animate-pulse"></span>
                <span className="text-xs text-slate-500 dark:text-slate-400">在线</span>
              </div>
            </div>
          </div>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5 bg-slate-50 dark:bg-[#0b1219] pb-24">
          {chatMessages.map((msg) => (
            <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} w-full`}>
                {msg.role === 'model' && (
                  <div className="size-8 rounded-full border border-slate-200 dark:border-slate-700 overflow-hidden bg-white shrink-0 mr-2 mt-1 shadow-sm">
                    <img src="https://api.dicebear.com/9.x/avataaars/svg?seed=Felix" alt="AI Agent" />
                  </div>
                )}
                <div className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${msg.role === 'user'
                  ? 'bg-primary text-white rounded-br-none'
                  : 'bg-slate-100 dark:bg-[#1c2936] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-white/5 rounded-bl-none'
                  }`}>
                  {/* 普通消息显示，移除建议弹窗 */}
                  {msg.role === 'model' ? (
                    (() => {
                      const parsed = parseReferenceReply(msg.text);
                      if (!parsed) return <div>{msg.text}</div>;
                      const isExpanded = !!expandedReferences[msg.id];
                      return (
                        <div className="space-y-2">
                          {parsed.before && <div>{parsed.before}</div>}
                          <button
                            onClick={() => setExpandedReferences(prev => ({ ...prev, [msg.id]: !isExpanded }))}
                            className="text-xs font-medium text-primary hover:text-primary/80"
                          >
                            {isExpanded ? '收起参考回复' : '查看参考回复'}
                          </button>
                          {isExpanded && (
                            <div className="text-sm text-slate-700 dark:text-slate-200 bg-white/60 dark:bg-white/5 rounded-lg p-2">
                              {parsed.reference}
                            </div>
                          )}
                          {parsed.after && <div>{parsed.after}</div>}
                        </div>
                      );
                    })()
                  ) : (
                    <div>{msg.text}</div>
                  )}
                </div>
              </div>
            </div>
          ))}
          {isSending && (
            <div className="flex justify-start">
              <div className="size-8 rounded-full border border-slate-200 dark:border-slate-700 overflow-hidden bg-white shrink-0 mr-2 mt-1 shadow-sm">
                <img src="https://api.dicebear.com/9.x/avataaars/svg?seed=Felix" alt="AI Agent" />
              </div>
              <div className="bg-white dark:bg-[#1c2936] rounded-2xl rounded-bl-none px-4 py-3 border border-slate-200 dark:border-white/5 shadow-sm">
                <div className="flex gap-1.5">
                  <span className="size-1.5 bg-slate-400 rounded-full animate-bounce"></span>
                  <span className="size-1.5 bg-slate-400 rounded-full animate-bounce delay-100"></span>
                  <span className="size-1.5 bg-slate-400 rounded-full animate-bounce delay-200"></span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area - Fixed at bottom, browser handles keyboard via interactive-widget */}
        <div
          className="fixed left-0 right-0 bottom-0 z-[110] px-4 py-2 bg-slate-50 dark:bg-[#1c2936] border-t border-slate-200 dark:border-white/5"
          style={{
            paddingBottom: 'max(8px, env(safe-area-inset-bottom))'
          }}
        >

          {/* Prompt Starters - Inside input container */}


          {/* Input controls */}
          <div className="flex gap-2 items-end max-w-md mx-auto">
            <textarea
              value={inputMessage}
              onChange={(e) => {
                if (isChatPrefill) setIsChatPrefill(false);
                setInputMessage(e.target.value);
              }}
              onBlur={() => {
                if (!inputMessage.trim()) {
                  setInputMessage(CHAT_PREFILL_TEXT);
                  setIsChatPrefill(true);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (!isSending) handleSendMessage();
                }
              }}
              placeholder="输入您的问题..."
              className={`flex-1 bg-slate-100 dark:bg-[#111a22] border-0 rounded-2xl px-4 py-3 placeholder:text-slate-400 focus:ring-2 focus:ring-primary outline-none transition-all resize-none ${isChatPrefill ? 'text-slate-500 dark:text-slate-500' : 'text-slate-900 dark:text-white'}`}
              rows={1}
              style={{ minHeight: '46px', maxHeight: '120px', lineHeight: '22px' }}
            />
            <button
              onClick={() => handleSendMessage()}
              disabled={!inputMessage.trim() || isSending}
              className="size-11 rounded-full bg-primary text-white flex items-center justify-center hover:bg-blue-600 disabled:opacity-50 transition-all shadow-md shrink-0"
            >
              <span className="material-symbols-outlined text-[20px]">send</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default AiAnalysis;

