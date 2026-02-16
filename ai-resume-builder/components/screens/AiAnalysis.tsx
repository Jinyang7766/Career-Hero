import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ScreenProps, ResumeData, View } from '../../types';
import { DatabaseService } from '../../src/database-service';
import { supabase } from '../../src/supabase-client';
import { toSkillList } from '../../src/skill-utils';
import { AICacheService } from '../../src/ai-cache-service';
import { buildApiUrl } from '../../src/api-config';
import { useLocation, useNavigate } from 'react-router-dom';
import ChatPage from './ai-analysis/ChatPage';
import { useAppContext } from '../../src/app-context';
import ResumeSelectPage from './ai-analysis/pages/ResumeSelectPage';
import JdInputPage from './ai-analysis/pages/JdInputPage';
import ReportPage from './ai-analysis/pages/ReportPage';
import { buildResumeTitle } from '../../src/resume-utils';
import { useChatViewport } from './ai-analysis/hooks/useChatViewport';
import { useInterviewVoice } from './ai-analysis/hooks/useInterviewVoice';
import { useInterviewSessionStore } from './ai-analysis/hooks/useInterviewSessionStore';
import { useAiAnalysisLifecycle } from './ai-analysis/hooks/useAiAnalysisLifecycle';
import { useResumeSelection } from './ai-analysis/hooks/useResumeSelection';
import { normalizeScoreBreakdown, resolveDisplayScore } from './ai-analysis/analysis-mappers';
import {
  isAffirmative,
  isEndInterviewCommand,
  parseReferenceReply,
  splitNextQuestion,
  stripMarkdownTableSeparators
} from './ai-analysis/chat-text';

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
  audioUrl?: string;
  audioMime?: string;
  audioDuration?: number;
  // Immediately show a voice bubble on release (without any "sending..." text) until audioUrl is ready.
  audioPending?: boolean;
  suggestion?: Suggestion;
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

const AiAnalysis: React.FC<ScreenProps> = () => {
  const { navigateToView, resumeData, setResumeData, allResumes, loadUserResumes, goBack, setIsNavHidden } = useAppContext();
  const navigate = useNavigate();
  const location = useLocation();

  const AI_AVATAR_URL = '/ai-avatar.png';
  const AI_AVATAR_FALLBACK =
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Hiroshi&top=shortHair&clothing=blazerAndShirt';
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
  const isGenderRelatedSuggestion = (suggestion: any) => {
    if (!suggestion) return false;
    const keywordPattern = /(性别|gender|sex|男性|女性|男生|女生|女士|先生|male|female|man|woman)/i;
    if (typeof suggestion === 'string') return keywordPattern.test(suggestion);

    const targetField = String(suggestion.targetField || '').trim().toLowerCase();
    if (targetField === 'gender' || targetField === 'sex') return true;

    const targetSection = String(suggestion.targetSection || '').trim().toLowerCase();
    if (targetSection === 'gender' || targetSection === 'sex') return true;

    const combinedText = [
      suggestion.title,
      suggestion.reason,
      suggestion.targetField,
      suggestion.targetSection,
      Array.isArray(suggestion.suggestedValue)
        ? suggestion.suggestedValue.join(' ')
        : suggestion.suggestedValue,
      suggestion.originalValue
    ]
      .map((item) => String(item || ''))
      .join(' ');
    return keywordPattern.test(combinedText);
  };
  // Skill normalization moved to `src/skill-utils.ts` so resume import and suggestion generation stay consistent.

  const inferTargetSection = (raw: any): Suggestion['targetSection'] => {
    const field = (raw?.targetField || '').toString().toLowerCase();
    if (['email', 'phone', 'name', 'title', 'jobtitle', 'job_title', 'position', 'gender', 'location', 'age'].includes(field)) {
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
  // Derive initial step from URL path to prevent flash (localStorage may conflict with URL).
  const [currentStep, setCurrentStep] = useState<Step>(() => {
    const path = (window.location.pathname || '').toLowerCase();
    if (path.startsWith('/ai-analysis')) {
      const rest = path.slice('/ai-analysis'.length).replace(/^\/+/, '');
      const sub = (rest.split('/').filter(Boolean)[0] || '');
      if (sub === 'jd') return 'jd_input';
      if (sub === 'analyzing') return 'analyzing';
      if (sub === 'report') return 'report';
      if (sub === 'chat') return 'chat';
      if (sub === 'comparison') return 'comparison';
    }
    // Base route /ai-analysis or non-matching: always start at resume_select
    return 'resume_select';
  });
  const [selectedResumeId, setSelectedResumeId] = useState<string | number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const sourceResumeIdRef = useRef<string | number | null>(null);
  const [stepHistory, setStepHistory] = useState<Step[]>([]);

  useEffect(() => {
    if (setIsNavHidden) {
      setIsNavHidden(currentStep === 'chat');
    }
    return () => {
      if (setIsNavHidden) setIsNavHidden(false);
    };
  }, [currentStep, setIsNavHidden]);
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

  // Keep URL in sync when currentStep changes (outward sync only).
  // IMPORTANT: Do NOT include location.pathname in deps — otherwise navigating
  // AWAY from AI Analysis (e.g. to /dashboard) would trigger this effect, which
  // would force-navigate back to /ai-analysis, creating an infinite redirect loop.
  useEffect(() => {
    // Guard: only sync if we're still on an /ai-analysis path.
    // When the user navigates away, the component may briefly remain mounted;
    // we must not hijack the new route.
    const currentPath = window.location.pathname.toLowerCase();
    if (!currentPath.startsWith('/ai-analysis')) return;

    const base = '/ai-analysis';
    const targetPath = (() => {
      switch (currentStep) {
        case 'resume_select': return base;
        case 'jd_input': return `${base}/jd`;
        case 'analyzing': return `${base}/analyzing`;
        case 'report': return selectedResumeId ? `${base}/report/${selectedResumeId}` : `${base}/report`;
        case 'chat': return `${base}/chat`;
        case 'comparison': return selectedResumeId ? `${base}/comparison/${selectedResumeId}` : `${base}/comparison`;
        default: return base;
      }
    })();
    if (currentPath !== targetPath.toLowerCase()) {
      navigate(targetPath, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, selectedResumeId]);

  // Handle deep-link: extract resume ID from URL on mount (for report/comparison sub-routes).
  useEffect(() => {
    const path = (window.location.pathname || '').toLowerCase();
    if (!path.startsWith('/ai-analysis')) return;
    const rest = path.slice('/ai-analysis'.length).replace(/^\/+/, '');
    const parts = rest ? rest.split('/').filter(Boolean) : [];
    const sub = parts[0] || '';
    const id = parts[1] || '';
    if ((sub === 'report' || sub === 'comparison') && id) {
      setSelectedResumeId(id);
      sourceResumeIdRef.current = id;
      setAnalysisResumeId(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      // Always restore by current resume + current JD to avoid cross-session leakage.
      restoreInterviewSession();
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
  const prevStepRef = useRef<Step | null>(null);

  // UX: when re-entering the JD input step, do not carry over target company from previous sessions.
  useEffect(() => {
    if (currentStep === 'jd_input' && prevStepRef.current !== 'jd_input') {
      setTargetCompany('');
    }
    prevStepRef.current = currentStep;
  }, [currentStep]);

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
  const chatMessagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => {
    chatMessagesRef.current = chatMessages;
  }, [chatMessages]);
  const [inputMessage, setInputMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const sendingCountRef = useRef(0);
  const beginSending = () => {
    sendingCountRef.current += 1;
    setIsSending(true);
  };
  const endSending = () => {
    sendingCountRef.current = Math.max(0, sendingCountRef.current - 1);
    setIsSending(sendingCountRef.current > 0);
  };


  const [isInterviewEntry, setIsInterviewEntry] = useState(false);
  const [forceReportEntry, setForceReportEntry] = useState(false);
  const [expandedReferences, setExpandedReferences] = useState<Record<string, boolean>>({});
  const {
    messagesEndRef,
    messagesContainerRef,
    inputBarRef,
    keyboardOffset,
    isKeyboardOpen,
    inputBarHeight,
    onMessagesScroll: handleMessagesScroll
  } = useChatViewport({ currentStep, chatMessages, isSending });
  const [chatInitialized, setChatInitialized] = useState(false);
  const chatIntroScheduledRef = useRef(false);
  const {
    saveLastAnalysis,
    loadLastAnalysis,
    clearLastAnalysis,
    makeJdKey,
    restoreInterviewSession,
    persistInterviewSession,
  } = useInterviewSessionStore({
    resumeData,
    setResumeData: setResumeData as any,
    jdText,
    setJdText,
    targetCompany,
    setTargetCompany,
    setChatMessages: setChatMessages as any,
    setChatInitialized,
  });
  const toastTimerRef = useRef<number | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'info' | 'success' | 'error' } | null>(null);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const DEFAULT_AVATAR = 'https://lh3.googleusercontent.com/aida-public/AB6AXuC8s4f5uzu0hh4pwqKSmSjqt1tMtDC7n86Mb_kOQe3JucH36AycxncXdZMw9jJo7dQ-PFScoQFPuYgyT_qD07UXSgKmtVmdQVOdO-3sGpsztdokYd994UDKhEaykjYLL0WA5Okx_2Ju5iRxWi4dBZQqSSUOc8uqeZpCYOOg30xh1_QW5-Aarlcq_ExUfD8HROn0Jl2UtS443smhWUTXEeZwUSJ_Y9plJ4iDcmWl4UWee3n6u4ojl5SG_Amz2_hnMxziRnIgDNWh8xsa';
  const [userAvatar, setUserAvatar] = useState(DEFAULT_AVATAR);

  useEffect(() => {
    const saved = localStorage.getItem('user_avatar');
    if (saved) setUserAvatar(saved);
  }, []);

  // Intentionally keep input usable while AI is replying.

  const WaveformVisualizer = ({ active, cancel }: { active: boolean; cancel: boolean }) => {
    return (
      <div className="flex items-center justify-center gap-[3px] h-8 overflow-hidden">
        {visualizerData.map((val, i) => {
          // If canceled, make bars very small
          const height = cancel ? 4 : (active ? Math.max(4, val / 1.5) : 4);
          return (
            <div
              key={i}
              className={`w-1 rounded-full transition-all duration-75 bg-white`}
              style={{
                height: `${height}px`,
                opacity: cancel ? 0.3 : (active ? 1 : 0.3),
              }}
            />
          );
        })}
      </div>
    );
  };

  const showToast = (msg: string, type: 'info' | 'success' | 'error' = 'info', ms: number = 2200) => {
    const text = String(msg || '').trim();
    if (!text) return;
    setToast({ msg: text, type });
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, ms);
  };

  const ToastOverlay = () => {
    if (!toast) return null;
    const tone = "bg-red-500/80 backdrop-blur-md text-white border-red-400/30";
    return (
      <div className="fixed left-1/2 top-16 -translate-x-1/2 z-[220] px-4 pointer-events-none">
        <div className={`pointer-events-auto flex items-center gap-2.5 rounded-full px-4 py-2 shadow-xl shadow-red-500/20 border ${tone} max-w-[90vw]`}>
          <span className="material-symbols-outlined text-[18px] shrink-0 opacity-80">notifications</span>
          <div className="text-[14px] font-bold whitespace-nowrap overflow-hidden text-ellipsis">{toast.msg}</div>
        </div>
      </div>
    );
  };

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
  const ANALYSIS_USER_KEY = 'ai_analysis_user_id';
  const INPROGRESS_AT_KEY = 'ai_analysis_in_progress_at';
  const INPROGRESS_SID_KEY = 'ai_analysis_in_progress_sid';
  const SESSION_SID_KEY = 'ai_analysis_session_sid';
  const analysisUserIdRef = useRef<string | null>(null);
  const sessionSidRef = useRef<string | null>(null);

  // Tracks the currently running analysis so we can cancel hung fetches (common after app/tab backgrounding)
  // and ignore late results from an aborted run.
  const analysisRunIdRef = useRef<string | null>(null);
  const analysisAbortRef = useRef<AbortController | null>(null);

  const setAnalysisInProgress = (value: boolean) => {
    if (value) {
      localStorage.setItem('ai_analysis_in_progress', '1');
      localStorage.setItem(INPROGRESS_AT_KEY, String(Date.now()));
      if (sessionSidRef.current) {
        localStorage.setItem(INPROGRESS_SID_KEY, sessionSidRef.current);
      }
    } else {
      localStorage.removeItem('ai_analysis_in_progress');
      localStorage.removeItem(INPROGRESS_AT_KEY);
      localStorage.removeItem(INPROGRESS_SID_KEY);
    }
  };

  // Session-scoped id used to detect stale "in progress" flags after reload/tab close.
  useEffect(() => {
    try {
      const existing = sessionStorage.getItem(SESSION_SID_KEY);
      const sid = existing || `${Date.now()}_${Math.random().toString(16).slice(2)}`;
      sessionStorage.setItem(SESSION_SID_KEY, sid);
      sessionSidRef.current = sid;
    } catch {
      sessionSidRef.current = null;
    }
  }, []);

  // Prevent cross-account leakage: localStorage is shared across sessions, so reset analysis UI state
  // when the logged-in user changes (e.g. user registers a new account in the same browser).
  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const uid = user?.id || null;
        analysisUserIdRef.current = uid;

        const storedUid = localStorage.getItem(ANALYSIS_USER_KEY);
        if (uid && storedUid && storedUid !== uid) {
          // Clear only AI-analysis related keys.
          [
            'ai_analysis_step',
            'ai_analysis_in_progress',
            INPROGRESS_AT_KEY,
            'ai_analysis_resume_id',
            LAST_ANALYSIS_KEY,
            ANALYSIS_COMPLETED_KEY,
            'ai_analysis_entry_source',
            'ai_analysis_has_activity',
            'ai_chat_prev_step',
            'ai_chat_entry_source'
          ].forEach((k) => localStorage.removeItem(k));

          setStepHistory([]);
          setChatEntrySource(null);
          setLastChatStep(null);
          setCurrentStep('resume_select');
        }

        if (uid) {
          localStorage.setItem(ANALYSIS_USER_KEY, uid);
        }
      } catch (error) {
        console.warn('Failed to validate analysis storage against current user:', error);
      }
    })();
  }, []);

  const isAnalysisStillInProgress = () => {
    const flag = localStorage.getItem('ai_analysis_in_progress') === '1';
    if (!flag) return false;

    // If the session differs (page reloaded / new tab), treat as stale and clear.
    const storedSid = localStorage.getItem(INPROGRESS_SID_KEY);
    if (storedSid && sessionSidRef.current && storedSid !== sessionSidRef.current) {
      localStorage.removeItem('ai_analysis_in_progress');
      localStorage.removeItem(INPROGRESS_AT_KEY);
      localStorage.removeItem(INPROGRESS_SID_KEY);
      return false;
    }

    const atRaw = localStorage.getItem(INPROGRESS_AT_KEY);
    const at = atRaw ? Number(atRaw) : NaN;
    // If we don't have a timestamp, it's almost certainly a stale legacy flag.
    if (!Number.isFinite(at)) {
      localStorage.removeItem('ai_analysis_in_progress');
      localStorage.removeItem(INPROGRESS_AT_KEY);
      localStorage.removeItem(INPROGRESS_SID_KEY);
      return false;
    }
    // If stuck for too long (tab closed/crash), auto-clear to avoid permanent "analyzing" state.
    const MAX_MS = 3 * 60 * 1000;
    if (Date.now() - at > MAX_MS) {
      localStorage.removeItem('ai_analysis_in_progress');
      localStorage.removeItem(INPROGRESS_AT_KEY);
      localStorage.removeItem(INPROGRESS_SID_KEY);
      return false;
    }
    return true;
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
    const isSkillSuggestion = (item: Suggestion) => {
      const normalized = normalizeTargetSection(item.targetSection);
      if (normalized === 'skills') return true;
      // Some older/edge suggestions may carry targetField=skill(s) but an incorrect targetSection.
      return inferTargetSection(item) === 'skills';
    };
    const skillIndices = items
      .map((item, idx) => ({ item, idx }))
      .filter(({ item }) => isSkillSuggestion(item));
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
      targetField: 'skills',
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
  const { resumeReadState, handleResumeSelect } = useResumeSelection({
    allResumes: allResumes as any,
    resumeData,
    setResumeData: setResumeData as any,
    currentStep,
    setSelectedResumeId,
    sourceResumeIdRef: sourceResumeIdRef as any,
    setAnalysisResumeId,
    setJdText,
    setTargetCompany,
    navigateToStep: navigateToStep as any,
    setOptimizedResumeId,
    applyAnalysisSnapshot,
    saveLastAnalysis,
    showToast,
    isSameResumeId,
  });

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
      const newTitle = buildResumeTitle(baseTitle, baseResumeData, jdText, true, targetCompany);
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
  // --- Handlers ---

  const generateRealAnalysis = async (runId: string) => {
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
        showToast('登录已过期，请重新登录', 'error');
        window.location.href = '/login'; // 或者你的登录路由
        return null;
      }

      console.log('Using authenticated token for AI analyze request');

      const controller = new AbortController();
      analysisAbortRef.current = controller;
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
    } finally {
      // Only clear the abort ref if we're still on the same run.
      if (analysisRunIdRef.current === runId) {
        analysisAbortRef.current = null;
      }
    }
  };

  const cancelInFlightAnalysis = useCallback((message?: string) => {
    analysisRunIdRef.current = null;
    if (analysisAbortRef.current) {
      try { analysisAbortRef.current.abort(); } catch { /* ignore */ }
    }
    analysisAbortRef.current = null;
    setAnalysisInProgress(false);
    if (message) {
      showToast(message, 'error', 2600);
    }
    setCurrentStep('jd_input');
  }, []);

  const startAnalysis = async () => {
    // 检查 resumeData 是否存在
    if (!resumeData) {
      console.error('startAnalysis - resumeData is null or undefined');
      alert('无法进行 AI 分析：没有找到简历数据');
      return;
    }

    // 记录当前 resumeData 的内容
    console.log('startAnalysis - Resume data:', resumeData);

    // If a previous run is still around (double click / quick nav), cancel it first.
    if (analysisRunIdRef.current) {
      cancelInFlightAnalysis();
    }
    const runId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    analysisRunIdRef.current = runId;

    // Reset Chat State for new analysis
    setChatMessages([]);
    setChatInitialized(false);

    // Snapshot original data for comparison later
    setOriginalResumeData(JSON.parse(JSON.stringify(resumeData)));

    setAnalysisInProgress(true);
    navigateToStep('analyzing');

    try {
      // 直接调用真实AI分析，不回退到模拟数据
      const aiAnalysisResult = await generateRealAnalysis(runId);
      if (analysisRunIdRef.current !== runId) return;

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
          if (isGenderRelatedSuggestion(suggestion)) return;
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
      if (analysisRunIdRef.current !== runId) return;
      console.error('AI analysis failed:', error);
      // 显示错误提示，不回退到模拟数据
      showToast(`AI 分析失败：${(error as any)?.message || '网络连接异常，请稍后重试'}`, 'error', 2600);
      navigateToStep('jd_input');
    } finally {
      if (analysisRunIdRef.current === runId) {
        analysisRunIdRef.current = null;
        setAnalysisInProgress(false);
      }
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
        const newTitle = buildResumeTitle(baseTitle, nextResumeData, jdText, true, targetCompany);
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
        showToast(`采纳失败：${(error as any)?.message || '请稍后重试'}`, 'error');
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
    navigateToView(View.PREVIEW);
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

  const INTERVIEW_ANSWER_LIMIT_SUFFIX = '请将回答控制在3分钟内';
  const SELF_INTRO_REMINDER = '自我介绍时间为1分钟';

  const isSelfIntroQuestion = (q: string) => {
    const t = String(q || '').trim();
    if (!t) return false;
    return /自我介绍|介绍一下你自己|简单介绍一下自己|请介绍一下你自己/.test(t);
  };

  const formatInterviewQuestion = (q: string) => {
    let t = String(q || '').trim();
    if (!t) return t;

    const isSelf = isSelfIntroQuestion(t);
    const hasSelf = t.includes(SELF_INTRO_REMINDER) || t.includes('自我介绍建议控制在1分钟') || t.includes('自我介绍时间为1分钟');

    // Self-intro: only remind 1 minute; do NOT append the generic 3-minute suffix.
    if (isSelf) {
      t = t.replaceAll(INTERVIEW_ANSWER_LIMIT_SUFFIX, '').trim();
      if (!hasSelf) t = `${t}\n${SELF_INTRO_REMINDER}`;
      return t.trim();
    }

    const hasLimit = t.includes(INTERVIEW_ANSWER_LIMIT_SUFFIX);
    if (!hasLimit) t = `${t}\n${INTERVIEW_ANSWER_LIMIT_SUFFIX}`;
    return t;
  };

  // 当步骤发生变化时，重置聊天初始化状态
  useEffect(() => {
    if (currentStep !== 'chat') {
      chatIntroScheduledRef.current = false;
      setChatInitialized(false);
    }
  }, [currentStep]);

  // 进入聊天页时，先给出问候和面试介绍，再询问是否开始（仅首次且无历史消息）
  useEffect(() => {
    if (currentStep !== 'chat') return;
    if (chatIntroScheduledRef.current) return;
    if (chatMessagesRef.current.length !== 0) return;

    chatIntroScheduledRef.current = true;
    setChatInitialized(true);

    let userName = '';
    if (resumeData?.personalInfo?.name) {
      const fullName = resumeData.personalInfo.name;
      if (fullName.includes(' ')) {
        userName = fullName.split(' ').pop() || fullName;
      } else if (fullName.length >= 2) {
        userName = fullName.slice(-2);
      } else {
        userName = fullName;
      }
    }

    const t1 = window.setTimeout(() => {
      const greeting = userName ? `${userName}，您好！` : '您好！';
      const summaryMessage: ChatMessage = {
        id: 'ai-summary',
        role: 'model',
        text: `${greeting}我是您的 AI 模拟面试官。${jdText ? '我已经阅读了您的简历和目标职位描述，' : '我已经阅读了您的简历，'}接下来将基于这些信息对您进行模拟面试。每题会给出点评、改进要点与参考回复。`
      };
      setChatMessages(prev => (prev.some(m => m.id === summaryMessage.id) ? prev : [...prev, summaryMessage]));
    }, 1000);

    const t2 = window.setTimeout(() => {
      const askMessage: ChatMessage = {
        id: 'ai-ask',
        role: 'model',
        text: '请问您准备好开始模拟面试了吗？您可以随时告诉我开始，我会根据您的简历和岗位要求提出面试问题。'
      };
      setChatMessages(prev => (prev.some(m => m.id === askMessage.id) ? prev : [...prev, askMessage]));
    }, 2500);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [currentStep, jdText, resumeData?.personalInfo?.name]);

  useAiAnalysisLifecycle({
    currentStep,
    chatEntrySource,
    score,
    suggestionsLength: suggestions.length,
    setChatEntrySource,
    setLastChatStep,
    setStepHistory,
    setCurrentStep,
    selectedResumeId,
    resumeData,
    navigate,
    locationPathname: location.pathname,
  });



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
    if (currentStep !== 'analyzing') return;

    // Fetch can hang after app/tab backgrounding (especially on mobile/iOS). When the user returns,
    // detect a hung run and cancel it so the UI doesn't get stuck indefinitely.
    const HUNG_MS = 90 * 1000;

    const getStartedAt = () => {
      const raw = localStorage.getItem(INPROGRESS_AT_KEY);
      const at = raw ? Number(raw) : NaN;
      return Number.isFinite(at) ? at : null;
    };

    const check = () => {
      const inProgress = isAnalysisStillInProgress();
      if (!inProgress) {
        setCurrentStep('jd_input');
        return;
      }

      const at = getStartedAt();
      if (!at) return;
      const elapsed = Date.now() - at;
      if (elapsed > HUNG_MS) {
        cancelInFlightAnalysis('切换到后台后分析超时，请返回重试。');
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') check();
    };
    const onFocus = () => check();

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    const intervalId = window.setInterval(check, 5000);
    check();

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
      window.clearInterval(intervalId);
    };
  }, [currentStep, cancelInFlightAnalysis]);

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

  const blobToBase64 = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const res = String(reader.result || '');
        const idx = res.indexOf('base64,');
        resolve(idx >= 0 ? res.slice(idx + 7) : res);
      };
      reader.onerror = () => reject(new Error('read failed'));
      reader.readAsDataURL(blob);
    });

  const generateInterviewSummary = async (baseMessages: ChatMessage[]) => {
    const token = await getBackendAuthToken();
    if (!token) throw new Error('请先登录以使用 AI 功能');

    const apiEndpoint = buildApiUrl('/api/ai/chat');
    const masker = createMasker();
    const maskedResumeData = masker.maskObject(resumeData);
    const maskedJdText = masker.maskText(jdText || '');
    const maskedChatHistory = (baseMessages || []).map((m) => ({
      ...m,
      text: masker.maskText(m.text || '')
    }));

    const summaryPrompt = masker.maskText(
      `[INTERVIEW_SUMMARY]\n请基于候选人简历、职位描述（JD）与完整对话记录，输出一份“面试综合分析”。\n` +
      `要求：\n` +
      `- 用中文输出。\n` +
      `- 不要提出下一题。\n` +
      `- 重点结合：回答质量（结构、深度、证据、数据/影响）、简历内容匹配度、JD匹配度。\n` +
      `- 输出结构：\n` +
      `1) 综合评价（3-5句）\n` +
      `2) 表现亮点（3-6条）\n` +
      `3) 需要加强的地方（5-8条，每条包含：问题 -> 如何改进 -> 建议练习/准备素材）\n` +
      `4) JD 匹配度与缺口（分点说明）\n` +
      `5) 简历可改进点（3-6条，针对表达与证据补强）\n` +
      `6) 1-2 周训练计划（按天/按主题）\n`
    );

    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token.trim()}`
      },
      body: JSON.stringify({
        mode: 'interview_summary',
        message: summaryPrompt,
        audio: null,
        resumeData: maskedResumeData,
        jobDescription: maskedJdText,
        chatHistory: maskedChatHistory,
        score: score,
        suggestions: []
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData?.error || '总结生成失败');
    }

    const result = await response.json().catch(() => ({} as any));
    const unmaskedText = masker.unmaskText(result?.response || '');
    return String(unmaskedText || '').trim();
  };

  const handleSendMessage = async (
    textOverride?: string,
    audioOverride?: { blob: Blob; url: string; mime: string } | null,
    opts?: { skipAddUserMessage?: boolean; existingUserMessageId?: string }
  ) => {
    const textToSend = (textOverride ?? inputMessage ?? '').toString();
    const hasText = !!textToSend.trim();
    const audioObj = audioOverride || null;
    const hasAudio = !!audioObj?.blob;
    if (!hasText && !hasAudio) return;
    // Voice send is driven by MediaRecorder.onstop, which may run right after the UI releases the hold gesture.
    if (isRecording && !textOverride && !opts?.skipAddUserMessage) return;

    const getExistingUserMessage = () => {
      const id = opts?.existingUserMessageId;
      if (!id) return null;
      const found = chatMessagesRef.current.find(m => m.id === id);
      return found && found.role === 'user' ? found : null;
    };

    // Add user message unless caller says it already exists in chat history.
    const userMessage: ChatMessage = (opts?.skipAddUserMessage && getExistingUserMessage())
      ? (getExistingUserMessage() as ChatMessage)
      : {
        id: `user-${Date.now()}`,
        role: 'user',
        text: hasText ? textToSend : '',
        audioUrl: hasAudio ? audioObj!.url : undefined,
        audioMime: hasAudio ? audioObj!.mime : undefined,
        audioDuration: hasAudio ? (audioOverride as any)?.duration : undefined,
      };

    const baseMessages = opts?.skipAddUserMessage ? chatMessagesRef.current : [...chatMessagesRef.current, userMessage];
    if (!opts?.skipAddUserMessage) {
      chatMessagesRef.current = baseMessages;
      setChatMessages(baseMessages);
      setInputMessage('');
    }

    beginSending();

    try {
      // End interview command: generate a comprehensive summary instead of continuing Q&A.
      if (!opts?.skipAddUserMessage && currentStep === 'chat' && hasText && isEndInterviewCommand(textToSend)) {
        const summaryRaw = await generateInterviewSummary(baseMessages);
        const summary = stripMarkdownTableSeparators(summaryRaw);
        const aiMessage: ChatMessage = {
          id: `ai-summary-${Date.now()}`,
          role: 'model',
          text: summary || '已结束面试，但总结生成失败，请稍后重试。'
        };
        const finalMessages = [...baseMessages, aiMessage];
        chatMessagesRef.current = finalMessages;
        setChatMessages(finalMessages);
        await persistInterviewSession(finalMessages, jdText);
        return;
      }

      console.log('Trying backend API for chat...');

      const token = await getBackendAuthToken();
      if (!token) {
        throw new Error('请先登录以使用 AI 功能');
      }

      const apiEndpoint = buildApiUrl('/api/ai/chat');

      const masker = createMasker();
      const isInterviewChat = currentStep === 'chat';
      const cleanTextForWrap = hasText ? textToSend : (hasAudio ? '（语音回答，见音频附件）' : '');
      const lastMsgBeforeUser = (() => {
        const last = baseMessages[baseMessages.length - 1];
        if (last && last.id === userMessage.id && baseMessages.length >= 2) return baseMessages[baseMessages.length - 2];
        return last;
      })();
      const isStartPhase =
        !!lastMsgBeforeUser &&
        (lastMsgBeforeUser.id === 'ai-ask' || lastMsgBeforeUser.text.includes('准备好'));

      const interviewWrapped = isInterviewChat
        ? (isStartPhase && isAffirmative(cleanTextForWrap)
          ? `[INTERVIEW_MODE]\n【面试开始：候选人已准备好。请先让候选人做自我介绍，并提醒：自我介绍时间为1分钟。随后进入正常面试提问。】`
          : `[INTERVIEW_MODE]\n【面试官角色保持：请仅进行模拟面试流程。回复请自然流畅，不要使用“点评”、“提问”等标签。输出为纯文本，不要使用任何 Markdown 标记，尤其不要出现 * 号。内容需包含：1.对回答的简短反馈；2.改进建议（如有）；3.参考回复；4.自然地提出下一题。并且：下一题必须另起一行，以“下一题：”开头输出（不要把下一题放进参考回复里）。】\n\n候选人回答：${cleanTextForWrap}`)
        : (hasText ? textToSend : (hasAudio ? '（语音）' : ''));

      const maskedMessage = masker.maskText(interviewWrapped);
      const maskedResumeData = masker.maskObject(resumeData);
      // Keep history excluding the current user message; "message" already contains the latest input.
      const historyForBackend = baseMessages.filter(m => m.id !== userMessage.id);
      const maskedChatHistory = historyForBackend.map((m) => ({
        ...m,
        text: masker.maskText(m.text)
      }));
      const maskedJdText = masker.maskText(jdText || '');

      const audioPayload = hasAudio
        ? (() => {
          const durRaw = (audioOverride as any)?.duration ?? userMessage.audioDuration;
          const dur = Number(durRaw);
          const payload: any = {
            mime_type: audioObj!.mime,
            data: null as any,
          };
          if (Number.isFinite(dur) && dur > 0) payload.duration_sec = Math.round(dur);
          return payload;
        })()
        : null;

      if (audioPayload) {
        audioPayload.data = await blobToBase64(audioObj!.blob);
      }

      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token.trim()}`
        },
        body: JSON.stringify({
          message: maskedMessage,
          audio: audioPayload,
          resumeData: maskedResumeData,
          jobDescription: maskedJdText,
          chatHistory: maskedChatHistory,
          score: score,
          suggestions: isInterviewChat ? [] : suggestions
        })
      });

      if (response.ok) {
        const result = await response.json();
        const unmaskedText = masker.unmaskText(result.response || '感谢你的回答，我们继续下一题。');
        const safeText = String(unmaskedText || '').replace(/\*/g, '').trim();
        const { cleaned, next } = splitNextQuestion(safeText);
        const aiMessage: ChatMessage = {
          id: `ai-${Date.now()}`,
          role: 'model',
          text: (cleaned || safeText).trim()
        };
        let finalMessages: ChatMessage[] = [...baseMessages, aiMessage];
        if (next) {
          const formattedQ = formatInterviewQuestion(next);
          const nextMsg: ChatMessage = {
            id: `ai-next-${Date.now()}`,
            role: 'model',
            text: isSelfIntroQuestion(formattedQ) ? formattedQ : `下一题：${formattedQ}`
          };
          finalMessages = [...finalMessages, nextMsg];
        }
        chatMessagesRef.current = finalMessages;
        setChatMessages(finalMessages);
        await persistInterviewSession(finalMessages, jdText);
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('Backend API failed:', errorData);
        throw new Error(errorData.error || 'Backend API failed');
      }
    } catch (error) {
      console.error('API failed:', error);
      // WeChat-style: voice send failed should not leave traces.
      if (hasAudio && !hasText && !opts?.skipAddUserMessage) {
        const filtered = chatMessagesRef.current.filter(m => m.id !== userMessage.id);
        chatMessagesRef.current = filtered;
        setChatMessages(filtered);
        if (audioObj?.url) {
          try { URL.revokeObjectURL(audioObj.url); } catch { }
        }
      }
      alert('AI 连接暂时中断');
    } finally {
      endSending();
    }
  };

  const {
    audioSupported,
    isRecording,
    audioError,
    setAudioError,
    inputMode,
    textareaRef,
    holdTalkBtnRef,
    holdCancel,
    visualizerData,
    transcribingByMsgId,
    toggleChatInputMode,
    onHoldPointerDown,
    onHoldPointerMove,
    onHoldPointerUp,
    onHoldPointerCancel,
    hasVoiceBlobForMsg,
    transcribeExistingVoiceMessage,
  } = useInterviewVoice({
    currentStep,
    chatMessagesRef: chatMessagesRef as any,
    setChatMessages: setChatMessages as any,
    handleSendMessage: handleSendMessage as any,
    showToast,
    getBackendAuthToken,
    blobToBase64,
  });

  const getScoreColor = (s: number) => {
    if (s >= 90) return 'text-green-500';
    if (s >= 70) return 'text-primary';
    return 'text-orange-500';
  };

  // ================= RENDER STEPS =================
  if (currentStep === 'resume_select') {
    return (
      <ResumeSelectPage
        allResumes={allResumes}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        isOptimizedOpen={isOptimizedOpen}
        setIsOptimizedOpen={setIsOptimizedOpen}
        isUnoptimizedOpen={isUnoptimizedOpen}
        setIsUnoptimizedOpen={setIsUnoptimizedOpen}
        onBack={handleStepBack}
        onSelectResume={(resumeId) => handleResumeSelect(resumeId, false)}
      />
    );
  }
  // 2. JD Input
  if (currentStep === 'jd_input') {
    return (
      <JdInputPage
        allResumes={allResumes}
        selectedResumeId={selectedResumeId}
        isSameResumeId={isSameResumeId}
        resumeData={resumeData}
        resumeReadState={resumeReadState}
        targetCompany={targetCompany}
        setTargetCompany={setTargetCompany}
        jdText={jdText}
        setJdText={setJdText}
        isUploading={isUploading}
        onScreenshotUpload={handleScreenshotUpload}
        onBack={handleStepBack}
        onPrev={() => setCurrentStep('resume_select')}
        onStart={handleStartAnalysisClick}
        showJdEmptyModal={showJdEmptyModal}
        setShowJdEmptyModal={setShowJdEmptyModal}
        startAnalysis={startAnalysis}
      />
    );
  }
  // 3. Analyzing
  if (currentStep === 'analyzing') {
    return (
      <ReportPage
        mode="analyzing"
        hasJdInput={hasJdInput}
        handleStepBack={handleStepBack}
        score={score}
        originalScore={originalScore}
        report={report}
        suggestions={suggestions as any[]}
        setSuggestions={setSuggestions as any}
        getScoreColor={getScoreColor}
        getSuggestionModuleLabel={getSuggestionModuleLabel}
        getDisplayOriginalValue={getDisplayOriginalValue}
        persistSuggestionFeedback={persistSuggestionFeedback as any}
        handleAcceptSuggestionInChat={handleAcceptSuggestionInChat as any}
        handleAnalyzeOtherResume={handleAnalyzeOtherResume}
        handleExportPDF={handleExportPDF}
        openChat={openChat}
      />
    );
  }
  // 4. Report View (Simplified, focus on Chat Entry)
  if (currentStep === 'report') {
    return (
      <ReportPage
        mode="report"
        hasJdInput={hasJdInput}
        handleStepBack={handleStepBack}
        score={score}
        originalScore={originalScore}
        report={report}
        suggestions={suggestions as any[]}
        setSuggestions={setSuggestions as any}
        getScoreColor={getScoreColor}
        getSuggestionModuleLabel={getSuggestionModuleLabel}
        getDisplayOriginalValue={getDisplayOriginalValue}
        persistSuggestionFeedback={persistSuggestionFeedback as any}
        handleAcceptSuggestionInChat={handleAcceptSuggestionInChat as any}
        handleAnalyzeOtherResume={handleAnalyzeOtherResume}
        handleExportPDF={handleExportPDF}
        openChat={openChat}
      />
    );
  }
  const endInterviewFromChat = () => { void handleSendMessage('结束面试', null); };

  // 5. Chat Page (Full Screen with Interactive Cards)
  if (currentStep === 'chat') {
    return (
      <ChatPage
        ToastOverlay={ToastOverlay}
        WaveformVisualizer={WaveformVisualizer}
        handleStepBack={handleStepBack}
        onEndInterview={endInterviewFromChat}
        userAvatar={userAvatar}
        chatMessages={chatMessages}
        isSending={isSending}
        messagesEndRef={messagesEndRef}
        messagesContainerRef={messagesContainerRef}
        onMessagesScroll={handleMessagesScroll}
        expandedReferences={expandedReferences}
        setExpandedReferences={setExpandedReferences}
        parseReferenceReply={parseReferenceReply}
        audioPlayerRef={audioPlayerRef}
        playingAudioId={playingAudioId}
        setPlayingAudioId={setPlayingAudioId}
        hasVoiceBlob={hasVoiceBlobForMsg}
        transcribingByMsgId={transcribingByMsgId}
        transcribeExistingVoiceMessage={transcribeExistingVoiceMessage}
        keyboardOffset={keyboardOffset}
        inputBarHeight={inputBarHeight}
        inputBarRef={inputBarRef}
        isKeyboardOpen={isKeyboardOpen}
        audioError={audioError}
        setAudioError={setAudioError}
        inputMode={inputMode}
        isRecording={isRecording}
        audioSupported={audioSupported}
        holdCancel={holdCancel}
        toggleMode={toggleChatInputMode}
        textareaRef={textareaRef}
        inputMessage={inputMessage}
        setInputMessage={setInputMessage}
        handleSendMessage={() => { void handleSendMessage(); }}
        holdTalkBtnRef={holdTalkBtnRef}
        onHoldPointerDown={onHoldPointerDown}
        onHoldPointerMove={onHoldPointerMove}
        onHoldPointerUp={onHoldPointerUp}
        onHoldPointerCancel={onHoldPointerCancel}
      />
    );
  }

  return null;
};

export default AiAnalysis;



