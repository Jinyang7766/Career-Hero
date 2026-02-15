import React, { useState, useEffect, useRef } from 'react';
import { ScreenProps, ResumeData, View } from '../../types';
import { DatabaseService } from '../../src/database-service';
import { supabase } from '../../src/supabase-client';
import { toSkillList } from '../../src/skill-utils';
import { AICacheService } from '../../src/ai-cache-service';
import { buildApiUrl } from '../../src/api-config';
import ChatPage from './ai-analysis/ChatPage';

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
type ResumeReadState = {
  status: 'idle' | 'loading' | 'success' | 'error';
  message: string;
};

const AiAnalysis: React.FC<ScreenProps> = ({ setCurrentView, resumeData, setResumeData, allResumes, loadUserResumes, goBack, setIsNavHidden }) => {
  const AI_AVATAR_URL = '/ai-avatar.png';
  const AI_AVATAR_FALLBACK =
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Hiroshi&top=shortHair&clothing=blazerAndShirt';

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
  // Skill normalization moved to `src/skill-utils.ts` so resume import and suggestion generation stay consistent.

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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputBarRef = useRef<HTMLDivElement>(null);
  const [expandedReferences, setExpandedReferences] = useState<Record<string, boolean>>({});
  const [pendingNextQuestion, setPendingNextQuestion] = useState<string | null>(null);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [inputBarHeight, setInputBarHeight] = useState(76);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordChunksRef = useRef<BlobPart[]>([]);
  const [audioSupported, setAudioSupported] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const isRecordingRef = useRef(false);
  const setRecording = (v: boolean) => {
    isRecordingRef.current = v;
    setIsRecording(v);
  };
  const [audioError, setAudioError] = useState<string>('');
  const [inputMode, setInputMode] = useState<'text' | 'voice'>('text');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const holdStartRef = useRef<{ x: number; y: number } | null>(null);
  // Track whether the user is still holding the "press to talk" button.
  const holdActiveRef = useRef(false);
  const holdPointerIdRef = useRef<number | null>(null);
  const holdMaxTimerRef = useRef<number | null>(null);
  const holdTalkBtnRef = useRef<HTMLButtonElement | null>(null);
  const holdSessionRef = useRef(0);
  const [holdCancel, setHoldCancel] = useState(false);
  const holdCancelRef = useRef(false);
  const holdStartTimeRef = useRef<number>(0);
  const holdAwaitAudioSendRef = useRef(false);
  const voicePendingUserMsgIdRef = useRef<string | null>(null);
  const voiceBlobByMsgIdRef = useRef<Map<string, { blob: Blob; mime: string }>>(new Map());
  const voiceSilenceByMsgIdRef = useRef<Map<string, boolean>>(new Map());
  const [transcribingByMsgId, setTranscribingByMsgId] = useState<Record<string, boolean>>({});
  const [chatInitialized, setChatInitialized] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const voiceMeterStreamRef = useRef<MediaStream | null>(null);
  const voiceMeterOwnsStreamRef = useRef(false);
  const audioRafRef = useRef<number | null>(null);
  const fakeMeterTimerRef = useRef<number | null>(null);
  const [visualizerData, setVisualizerData] = useState<number[]>(new Array(24).fill(4));
  // Peak level during the current hold session, used for fast silence detection (no decode).
  const holdVoicePeakRef = useRef(0);
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

  const voiceDebugEnabled = () => {
    try { return localStorage.getItem('voice_debug') === '1'; } catch { return false; }
  };

  const transcribeAudioOnBackend = async (audioObj: { blob: Blob; url: string; mime: string }) => {
    const token = await getBackendAuthToken();
    if (!token) throw new Error('请先登录以使用 AI 功能');

    const apiEndpoint = buildApiUrl('/api/ai/transcribe');
    const audioPayload = {
      mime_type: audioObj.mime,
      data: await blobToBase64(audioObj.blob),
    };

    const resp = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token.trim()}`
      },
      body: JSON.stringify({ audio: audioPayload, lang: 'zh-CN' })
    });

    const json = await resp.json().catch(() => ({} as any));
    if (!resp.ok) {
      throw new Error(json?.error || '转写失败');
    }
    if (!json?.success) {
      throw new Error(json?.error || '转写失败');
    }
    return String(json?.text || '').trim();
  };

  const isAudioLikelySilent = async (blob: Blob): Promise<boolean | null> => {
    // Returns:
    // - true: very likely silence
    // - false: likely has meaningful audio energy
    // - null: can't determine (format decode not supported etc.)
    try {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;

      const buf = await blob.arrayBuffer();
      const ctx: AudioContext = new AC();
      try { await (ctx as any).resume?.(); } catch { }

      // Some browsers require the buffer to be detached from the original.
      const audioBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
        try {
          const ab = buf.slice(0);
          ctx.decodeAudioData(
            ab,
            (decoded) => resolve(decoded),
            (err) => reject(err)
          );
        } catch (e) {
          reject(e);
        }
      });

      const ch = audioBuffer.numberOfChannels || 1;
      const len = audioBuffer.length || 0;
      if (!len) {
        try { ctx.close(); } catch { }
        return true;
      }

      // Compute RMS and peak across channels with light subsampling for speed.
      const step = Math.max(1, Math.floor(len / 48000)); // ~1s worth of samples max
      let sumSq = 0;
      let count = 0;
      let peak = 0;
      for (let c = 0; c < ch; c++) {
        const data = audioBuffer.getChannelData(c);
        for (let i = 0; i < len; i += step) {
          const v = data[i] || 0;
          const av = Math.abs(v);
          if (av > peak) peak = av;
          sumSq += v * v;
          count++;
        }
      }
      const rms = Math.sqrt(sumSq / Math.max(1, count));

      try { ctx.close(); } catch { }

      // Heuristics:
      // - Very low RMS and low peak => likely silence (or near silence).
      // Keep thresholds conservative to avoid false "silent" on quiet speech, especially on mobile.
      const silent = (rms < 0.003) && (peak < 0.02);
      return silent;
    } catch {
      return null;
    }
  };

  const transcribeExistingVoiceMessage = async (msgId: string) => {
    if (transcribingByMsgId[msgId]) return;
    const audio = voiceBlobByMsgIdRef.current.get(msgId);
    if (!audio?.blob) {
      showToast('该语音无法转写（可能已过期），请重新发送', 'info');
      return;
    }

    // Frontend silence detection: if likely silent, do not call backend AI transcribe.
    const cachedSilent = voiceSilenceByMsgIdRef.current.get(msgId);
    if (cachedSilent === true) {
      showToast('未识别到语音内容', 'info');
      return;
    }
    if (cachedSilent === undefined) {
      const verdict = await isAudioLikelySilent(audio.blob);
      if (verdict === true) {
        try { voiceSilenceByMsgIdRef.current.set(msgId, true); } catch { }
        showToast('未识别到语音内容', 'info');
        return;
      }
      if (verdict === false) {
        try { voiceSilenceByMsgIdRef.current.set(msgId, false); } catch { }
      }
      // verdict === null => can't determine, fall through to backend.
    }

    setTranscribingByMsgId(prev => ({ ...prev, [msgId]: true }));
    try {
      const text = await transcribeAudioOnBackend({ blob: audio.blob, url: '', mime: audio.mime });
      if (!text) {
        showToast('未识别到语音内容', 'info');
        return;
      }
      const updated = chatMessagesRef.current.map(m => (
        m.id === msgId ? { ...m, text } : m
      ));
      chatMessagesRef.current = updated;
      setChatMessages(updated);
    } catch (e) {
      const msg =
        (e && typeof e === 'object' && 'message' in (e as any) && String((e as any).message || '').trim())
          ? String((e as any).message).trim()
          : '转写失败，请稍后重试';
      showToast(msg, 'error');
      if (voiceDebugEnabled()) console.debug('[voice] transcribeExistingVoiceMessage failed', e);
    } finally {
      setTranscribingByMsgId(prev => {
        const next = { ...prev };
        delete next[msgId];
        return next;
      });
    }
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
  const ANALYSIS_USER_KEY = 'ai_analysis_user_id';
  const INPROGRESS_AT_KEY = 'ai_analysis_in_progress_at';
  const INPROGRESS_SID_KEY = 'ai_analysis_in_progress_sid';
  const SESSION_SID_KEY = 'ai_analysis_session_sid';
  const analysisUserIdRef = useRef<string | null>(null);
  const sessionSidRef = useRef<string | null>(null);
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

  const hasInterviewHistoryForCurrentResumeAndJd = () => {
    const sessionJdText = (jdText ?? resumeData?.lastJdText ?? '').trim();
    if (!sessionJdText) return false;
    const sessionKey = makeJdKey(sessionJdText);
    const session = resumeData?.interviewSessions?.[sessionKey];
    return !!(session && Array.isArray(session.messages) && session.messages.length > 0);
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
        showToast('请先登录', 'error');
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
          showToast(`加载简历失败: ${result.error?.message || '请重试'}`, 'error');
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
        showToast(`简历不存在 (ID: ${id})`, 'error');
        return;
      }

      console.log('Target resume found:', resume);

      if (!resume.resume_data) {
        console.error('Resume data is empty: resume_data is null/undefined');
        setResumeReadState({
          status: 'error',
          message: '读取失败：简历内容为空'
        });
        showToast('简历数据为空，请重新创建简历', 'error');
        return;
      }

      if (typeof resume.resume_data === 'object' && Object.keys(resume.resume_data).length === 0) {
        console.error('Resume data is empty object: resume_data is empty object');
        setResumeReadState({
          status: 'error',
          message: '读取失败：简历内容为空对象'
        });
        showToast('简历数据为空，请重新创建简历', 'error');
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
      showToast('加载简历失败，请检查网络连接', 'error');
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
        showToast('登录已过期，请重新登录', 'error');
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
      showToast(`AI 分析失败：${(error as any)?.message || '网络连接异常，请稍后重试'}`, 'error', 2600);
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

  // Mobile keyboard handling: translate the fixed input bar above the keyboard and keep
  // enough bottom padding for message list so the latest message isn't covered.
  // Also track keyboard open/close reliably across all devices.
  useEffect(() => {
    if (currentStep !== 'chat') return;

    const vv = (window as any).visualViewport as VisualViewport | undefined;

    // Baseline height captured once when the chat screen mounts (keyboard closed).
    const baselineHeight = vv ? vv.height : window.innerHeight;

    const compute = () => {
      if (!vv) { setKeyboardOffset(0); return; }
      // Some Android builds report offsetTop=0 and don't reflect keyboard overlap.
      const overlap = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
      const heightDelta = Math.max(0, window.innerHeight - vv.height);
      const inferred = Math.max(overlap, heightDelta);
      setKeyboardOffset(inferred);

      // Keyboard detection: viewport shrunk >100px from baseline => keyboard likely open.
      // 100px threshold safely ignores address-bar (~60px) but catches any keyboard (>200px).
      const shrinkage = baselineHeight - vv.height;
      setIsKeyboardOpen(shrinkage > 100);
    };

    // Fallback: use focusin/focusout for devices where visualViewport is unreliable.
    const onFocusIn = (e: FocusEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') setIsKeyboardOpen(true);
    };
    const onFocusOut = (e: FocusEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') {
        // Delay so tapping another input doesn't briefly flash the disclaimer.
        setTimeout(() => {
          if (document.activeElement?.tagName?.toLowerCase() !== 'input' &&
            document.activeElement?.tagName?.toLowerCase() !== 'textarea') {
            setIsKeyboardOpen(false);
          }
        }, 120);
      }
    };

    compute();
    if (vv) {
      vv.addEventListener('resize', compute);
      vv.addEventListener('scroll', compute);
    }
    window.addEventListener('resize', compute);
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('focusout', onFocusOut, true);

    return () => {
      if (vv) {
        vv.removeEventListener('resize', compute);
        vv.removeEventListener('scroll', compute);
      }
      window.removeEventListener('resize', compute);
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('focusout', onFocusOut, true);
    };
  }, [currentStep]);

  // Track input bar height (textarea grows), so paddingBottom stays correct.
  useEffect(() => {
    if (currentStep !== 'chat') return;
    const el = inputBarRef.current;
    if (!el) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      setInputBarHeight(Math.max(60, Math.round(rect.height)));
    };

    update();
    const ResizeObs = (window as any).ResizeObserver as any;
    if (!ResizeObs) {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }

    const ro = new ResizeObs(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [currentStep]);

  // When keyboard opens/closes, keep the latest message visible.
  useEffect(() => {
    if (currentStep !== 'chat') return;
    scrollToBottom();
  }, [keyboardOffset, inputBarHeight, currentStep]);

  // Voice input: we record audio (MediaRecorder) and send it to the backend chat endpoint.
  // The LLM will listen to the audio and reply directly. Transcription is user-triggered via "转文字".
  useEffect(() => {
    const ok =
      typeof window !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) &&
      !!((window as any).MediaRecorder);
    setAudioSupported(ok);
  }, []);

  const cleanupVoiceMeter = () => {
    if (fakeMeterTimerRef.current) {
      try { window.clearInterval(fakeMeterTimerRef.current); } catch { }
      fakeMeterTimerRef.current = null;
    }
    if (audioRafRef.current) {
      try { cancelAnimationFrame(audioRafRef.current); } catch { }
      audioRafRef.current = null;
    }
    if (voiceMeterStreamRef.current && voiceMeterOwnsStreamRef.current) {
      try { voiceMeterStreamRef.current.getTracks().forEach(t => t.stop()); } catch { }
    }
    voiceMeterStreamRef.current = null;
    voiceMeterOwnsStreamRef.current = false;
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch { }
      audioCtxRef.current = null;
    }
    setVisualizerData(new Array(24).fill(4));
  };

  const startVoiceMeter = async (streamOverride?: MediaStream) => {
    cleanupVoiceMeter();

    if (!streamOverride) return;

    try {
      voiceMeterStreamRef.current = streamOverride;
      voiceMeterOwnsStreamRef.current = false;
      holdVoicePeakRef.current = 0;

      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      audioCtxRef.current = ctx;
      try { await ctx.resume?.(); } catch { }

      const source = ctx.createMediaStreamSource(streamOverride);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let lastUpdate = 0;

      const loop = (now: number) => {
        try {
          analyser.getByteFrequencyData(dataArray);
          if (now - lastUpdate > 50) {
            lastUpdate = now;
            // Track a rough peak to detect "almost silent" holds.
            let maxByte = 0;
            for (let i = 0; i < dataArray.length; i++) {
              const v = dataArray[i] || 0;
              if (v > maxByte) maxByte = v;
            }
            const peak = maxByte / 255;
            if (peak > holdVoicePeakRef.current) holdVoicePeakRef.current = peak;
            const newData: number[] = [];
            const step = Math.floor(dataArray.length / 12);
            for (let i = 0; i < 12; i++) {
              const val = dataArray[i * step] || 0;
              newData.push(4 + (val / 255) * 44);
            }
            const mirrored = [...[...newData].reverse(), ...newData];
            setVisualizerData(mirrored);
          }
        } catch { }
        audioRafRef.current = requestAnimationFrame(loop);
      };
      audioRafRef.current = requestAnimationFrame(loop);
    } catch (e) {
      console.warn('Voice meter failed:', e);
    }
  };

  const pickRecorderMime = () => {
    const MR: any = typeof window !== 'undefined' ? (window as any).MediaRecorder : null;
    const isSupported = (t: string) => {
      try { return !!MR?.isTypeSupported?.(t); } catch { return false; }
    };
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
    ];
    for (const c of candidates) {
      if (isSupported(c)) return c;
    }
    return '';
  };

  const startAudioRecorder = async (token: number) => {
    // Capture audio and send to backend (LLM listens to the audio).

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      // Reuse recorder stream for real waveform (no extra mic request).
      startVoiceMeter(stream);

      const mime = pickRecorderMime();
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      mediaRecorderRef.current = rec;
      recordChunksRef.current = [];

      rec.ondataavailable = (e: any) => {
        try {
          if (e?.data && e.data.size > 0) recordChunksRef.current.push(e.data);
        } catch { }
      };

      rec.onstop = () => {
        if (holdAudioDiscardRef.current) {
          holdAudioDiscardRef.current = false;
          try { mediaStreamRef.current?.getTracks().forEach(t => t.stop()); } catch { }
          mediaStreamRef.current = null;
          mediaRecorderRef.current = null;
          recordChunksRef.current = [];
          return;
        }

        let blob: Blob | null = null;
        try {
          const chunks = recordChunksRef.current;
          blob = new Blob(chunks, { type: mime || 'audio/webm' });
        } catch { }

        try { mediaStreamRef.current?.getTracks().forEach(t => t.stop()); } catch { }
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
        recordChunksRef.current = [];

        if (!blob || !blob.size) {
          if (voiceDebugEnabled()) console.debug('[voice] audio recorder stopped: empty blob');
          // If we already inserted a placeholder bubble, clean it up to avoid a stuck "pending" UI.
          try {
            const pendingId = voicePendingUserMsgIdRef.current;
            voicePendingUserMsgIdRef.current = null;
            holdAwaitAudioSendRef.current = false;
            if (pendingId) {
              const filtered = chatMessagesRef.current.filter(m => m.id !== pendingId);
              chatMessagesRef.current = filtered;
              setChatMessages(filtered);
            }
          } catch { }
          showToast('录音失败，请重试', 'error');
          return;
        }

        if (voiceDebugEnabled()) {
          console.debug('[voice] audio recorder stopped', {
            token,
            size: blob.size,
            mime: blob.type || mime || 'audio/webm',
            peak: holdVoicePeakRef.current,
          });
        }

        const userMsgId = voicePendingUserMsgIdRef.current;
        if (!userMsgId) return;

        voicePendingUserMsgIdRef.current = null;
        const duration = Math.max(1, Math.round((Date.now() - holdStartTimeRef.current) / 1000));

        // If the hold is likely silent, don't send audio to backend; instead show an AI chat hint.
        // Use a fast peak heuristic first; optionally confirm with decode-based check for low peaks.
        (async () => {
          const peak = holdVoicePeakRef.current;
          let silentVerdict: boolean | null = null;
          // Do NOT hard-block based on the live meter peak alone: on some mobile browsers AudioContext
          // may be suspended, producing a near-zero peak even when the recorder captured valid audio.
          // Only block if we can confirm silence by decoding the recorded blob.
          if (peak < 0.08) silentVerdict = await isAudioLikelySilent(blob);

          if (silentVerdict === true) {
            try { voiceSilenceByMsgIdRef.current.set(userMsgId, true); } catch { }
            // Remove user placeholder voice bubble.
            const filtered = chatMessagesRef.current.filter(m => m.id !== userMsgId);
            const aiMsg: ChatMessage = {
              id: `ai-${Date.now()}`,
              role: 'model',
              text: '未识别到语音内容。请检查：是否已允许麦克风权限、是否连接了蓝牙耳机、是否有其他应用占用麦克风。'
            };
            const next = [...filtered, aiMsg];
            chatMessagesRef.current = next;
            setChatMessages(next);
            holdAwaitAudioSendRef.current = false;
            return;
          }

          // Not silent (or undetermined): proceed to attach audio + allow manual "转文字".
          const url = URL.createObjectURL(blob);
          const audioObj = { blob, url, mime: blob.type || mime || 'audio/webm' };

          // Persist blob for "transcribe" button later (scheme A: update same message text on demand).
          try { voiceBlobByMsgIdRef.current.set(userMsgId, { blob: audioObj.blob, mime: audioObj.mime }); } catch { }
          try { voiceSilenceByMsgIdRef.current.set(userMsgId, false); } catch { }

          // Attach audio to the placeholder message and send immediately as an audio message.
          const updated = chatMessagesRef.current.map(m => (
            m.id === userMsgId
              // Keep a minimal text marker so chatHistory contains this turn (LLM already listened to the audio).
              ? { ...m, text: '（语音）', audioPending: false, audioUrl: audioObj.url, audioMime: audioObj.mime, audioDuration: duration }
              : m
          ));
          chatMessagesRef.current = updated;
          setChatMessages(updated);

          if (holdAwaitAudioSendRef.current) {
            holdAwaitAudioSendRef.current = false;
            try {
              await handleSendMessage('', { ...audioObj, duration } as any, { skipAddUserMessage: true, existingUserMessageId: userMsgId });
            } catch { }
          }
        })();
      };

      rec.onerror = (e: any) => {
        if (voiceDebugEnabled()) console.debug('[voice] audio recorder error', e);
      };

      // Collect small chunks to avoid losing data on some devices.
      try { rec.start(120); } catch { rec.start(); }
    } catch (e: any) {
      const name = String(e?.name || '').toLowerCase();
      if (name.includes('notallowed') || name.includes('permission')) {
        setAudioError('无法使用麦克风：请在浏览器权限中允许麦克风访问');
      } else {
        setAudioError('麦克风启动失败，请重试');
      }
      setRecording(false);
      cleanupVoiceMeter();
      if (voiceDebugEnabled()) console.debug('[voice] startAudioRecorder failed', e);
    }
  };

  const holdAudioDiscardRef = useRef(false);
  const stopAudioRecorder = (discard: boolean) => {
    const rec = mediaRecorderRef.current;
    if (!rec) return;
    holdAudioDiscardRef.current = !!discard;
    if (discard) {
      // Just stop and drop anything recorded.
      holdAwaitAudioSendRef.current = false;
    }
    // Best-effort flush to reduce perceived delay on release.
    try { (rec as any).requestData?.(); } catch { }
    try { rec.stop(); } catch { }
  };

  // Avoid sending accidental taps as voice messages.
  const MIN_VOICE_HOLD_MS = 600;
  const MAX_VOICE_HOLD_MS = 3 * 60 * 1000;

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

  const clearHoldMaxTimer = () => {
    if (holdMaxTimerRef.current) {
      try { window.clearTimeout(holdMaxTimerRef.current); } catch { }
      holdMaxTimerRef.current = null;
    }
  };

  // SpeechRecognition STT flow removed: we always send audio to LLM, and transcription is manual ("转文字").

  const setMode = (mode: 'text' | 'voice') => {
    setInputMode(mode);
    setAudioError('');
    // Hide keyboard when switching to voice; focus when switching back to text.
    if (mode === 'voice') {
      try { textareaRef.current?.blur(); } catch { }
    } else {
      setTimeout(() => {
        try { textareaRef.current?.focus(); } catch { }
      }, 0);
    }
  };

  // 当步骤发生变化时，重置聊天初始化状态
  useEffect(() => {
    if (currentStep !== 'chat') {
      setChatInitialized(false);
    }
  }, [currentStep]);



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
    const inProgress = isAnalysisStillInProgress();
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
            text: '请问您准备好开始模拟面试了吗？您可以随时告诉我开始，我会根据您的简历和岗位要求提出面试问题。'
          };
          console.log('Adding ask message:', askMessage);
          setChatMessages(prev => (prev.some(m => m.id === askMessage.id) ? prev : [...prev, askMessage]));
        }, 1500);
      }, 1000);
    }
  }, [currentStep, suggestions, score, resumeData, chatInitialized, jdText, chatMessages.length]);

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

  const isEndInterviewCommand = (text: string) => {
    const t = String(text || '').trim().toLowerCase();
    if (!t) return false;
    const hits = [
      '结束面试',
      '面试结束',
      '结束',
      '结束了',
      '结束吧',
      'stop',
      'end',
      'finish',
    ];
    return hits.some(k => t === k || t.includes(k));
  };

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
        setPendingNextQuestion(null);
        const summary = await generateInterviewSummary(baseMessages);
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

      if (currentStep === 'chat' && pendingNextQuestion) {
        if (isAffirmative(textToSend)) {
          const formattedQ = formatInterviewQuestion(pendingNextQuestion);
          const nextMsg: ChatMessage = {
            id: `ai-next-${Date.now()}`,
            role: 'model',
            text: `下一题：${formattedQ}`
          };
          const newMessages = [...baseMessages, nextMsg];
          chatMessagesRef.current = newMessages;
          setChatMessages(newMessages);
          setPendingNextQuestion(null);
          await persistInterviewSession(newMessages, jdText);
          endSending();
          return;
        }
        if (isNegative(textToSend)) {
          const holdMsg: ChatMessage = {
            id: `ai-hold-${Date.now()}`,
            role: 'model',
            text: '好的，我们先继续讨论。有需要再告诉我“继续下一题”。'
          };
          const newMessages = [...baseMessages, holdMsg];
          chatMessagesRef.current = newMessages;
          setChatMessages(newMessages);
          await persistInterviewSession(newMessages, jdText);
          endSending();
          return;
        }
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
      const isQaMode = isInterviewChat && !!pendingNextQuestion && !isAffirmative(cleanTextForWrap) && !isNegative(cleanTextForWrap);
      const lastMsgBeforeUser = (() => {
        const last = baseMessages[baseMessages.length - 1];
        if (last && last.id === userMessage.id && baseMessages.length >= 2) return baseMessages[baseMessages.length - 2];
        return last;
      })();
      const isStartPhase =
        !!lastMsgBeforeUser &&
        (lastMsgBeforeUser.id === 'ai-ask' || lastMsgBeforeUser.text.includes('准备好'));

      const interviewWrapped = isInterviewChat
        ? (isQaMode
          ? `[INTERVIEW_MODE]\n【答疑阶段：请就候选人问题进行讨论答疑，不要给出下一题或简历优化建议。】\n\n候选人问题：${cleanTextForWrap}`
          : (isStartPhase && isAffirmative(cleanTextForWrap)
            ? `[INTERVIEW_MODE]\n【面试开始：候选人已准备好。请先让候选人做自我介绍，并提醒：自我介绍时间为1分钟。随后进入正常面试提问。】`
            : `[INTERVIEW_MODE]\n【面试官角色保持：请仅进行模拟面试流程。回复请自然流畅，不要使用“点评”、“提问”等标签。内容需包含：1.对回答的简短反馈；2.改进建议（如有）；3.参考回复；4.自然地提出下一题。】\n\n候选人回答：${cleanTextForWrap}`)
        )
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
        ? {
          mime_type: audioObj!.mime,
          data: await blobToBase64(audioObj!.blob),
        }
        : null;

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
        const { cleaned, next } = splitNextQuestion(unmaskedText);
        const aiMessage: ChatMessage = {
          id: `ai-${Date.now()}`,
          role: 'model',
          text: cleaned || unmaskedText
        };
        const newMessages = [...baseMessages, aiMessage];
        let finalMessages = newMessages;
        if (next) {
          setPendingNextQuestion(formatInterviewQuestion(next));
          const askNext: ChatMessage = {
            id: `ai-ask-next-${Date.now()}`,
            role: 'model',
            text: '要继续下一题吗？'
          };
          finalMessages = [...newMessages, askNext];
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
    let cleaned = text.slice(0, nextIndex).trim();
    // Remove trailing incomplete brackets like 【 or [
    cleaned = cleaned.replace(/[【\[（]\s*$/, '').trim();
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
    const filteredResumesSelection = (allResumes || []).filter(resume =>
      resume.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const renderSelectionList = (resumes: typeof allResumes) => (
      <div className="px-4 mt-1">
        <div className="bg-white dark:bg-surface-dark rounded-2xl overflow-hidden shadow-sm border border-gray-100 dark:border-white/5 divide-y divide-gray-100 dark:divide-white/5">
          {resumes!.map((resume) => (
            <div
              key={resume.id}
              onClick={() => handleResumeSelect(resume.id, false)}
              className="group relative flex items-center gap-4 px-4 py-3.5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors cursor-pointer"
            >
              <div className="shrink-0 relative">
                <div className="bg-white dark:bg-slate-700 aspect-[210/297] w-10 h-[56px] rounded-lg shadow-sm border border-slate-200 dark:border-slate-600 overflow-hidden relative">
                  {resume.thumbnail}
                </div>
              </div>
              <div className="flex flex-col flex-1 justify-center min-w-0">
                <p className="text-slate-900 dark:text-white text-sm font-bold truncate leading-tight mb-1">{resume.title}</p>
                <p className="text-slate-500 dark:text-slate-500 text-[12px] font-medium leading-normal line-clamp-1">
                  上次修改: {new Date(resume.date).toLocaleString('zh-CN', { hour12: false })}
                </p>
              </div>
              <button className="shrink-0 size-9 flex items-center justify-center rounded-full text-slate-300 hover:text-slate-600 dark:text-slate-600 dark:hover:text-white transition-colors">
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>more_vert</span>
              </button>
            </div>
          ))}
        </div>
      </div>
    );

    return (
      <div className="flex flex-col min-h-screen bg-background-light dark:bg-background-dark animate-in fade-in duration-300">
        <header className="sticky top-0 z-50 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md border-b border-slate-200/50 dark:border-white/5 shrink-0">
          <div className="flex items-center justify-between h-14 px-4 relative">
            <button
              onClick={handleStepBack}
              className="flex items-center justify-center size-10 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-slate-900 dark:text-white z-10"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>arrow_back</span>
            </button>
            <h1 className="absolute inset-0 flex items-center justify-center text-lg font-bold leading-tight tracking-[-0.015em] text-slate-900 dark:text-white pointer-events-none">
              选择简历
            </h1>
            <div className="flex w-10 justify-end z-10">
              <button
                onClick={() => setCurrentView(View.TEMPLATES)}
                className="flex size-10 items-center justify-center rounded-full text-primary hover:bg-primary/10 transition-colors"
              >
                <span className="material-symbols-outlined" style={{ fontSize: '28px' }}>add</span>
              </button>
            </div>
          </div>
        </header>

        <div className="px-4 py-3 bg-background-light dark:bg-background-dark shrink-0">
          <div className="relative group">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400 group-focus-within:text-primary transition-colors" style={{ fontSize: '20px' }}>search</span>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-200/50 dark:bg-white/5 text-sm text-slate-900 dark:text-white rounded-xl py-2.5 pl-10 pr-4 outline-none border border-transparent focus:border-primary/20 focus:ring-4 focus:ring-primary/5 placeholder-slate-500 dark:placeholder-slate-400 transition-all"
              placeholder="搜索简历名称..."
              type="text"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>close</span>
              </button>
            )}
          </div>
        </div>

        <main className="flex-1 overflow-y-auto pb-32 no-scrollbar">
          <div className="flex flex-col gap-2">
            {filteredResumesSelection.length === 0 && (
              <div className="flex flex-col items-center justify-center pt-20 px-4 text-center">
                <span className="material-symbols-outlined text-slate-300 dark:text-slate-600 text-6xl mb-4">search_off</span>
                <p className="text-slate-900 dark:text-white font-medium mb-1">未找到相关简历</p>
                <p className="text-slate-500 dark:text-slate-400 text-sm">尝试搜索其他关键词</p>
              </div>
            )}

            {filteredResumesSelection.length > 0 && (
              <>
                {/* 已优化 */}
                <div className="flex flex-col pt-2 bg-transparent">
                  <button
                    onClick={() => setIsOptimizedOpen(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-2 group"
                  >
                    <h3 className="ml-4 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">已优化</h3>
                    <span className="material-symbols-outlined text-[20px] text-slate-300 dark:text-slate-600 transition-transform duration-300 mr-4" style={{ transform: isOptimizedOpen ? 'none' : 'rotate(-90deg)' }}>
                      expand_more
                    </span>
                  </button>
                  {isOptimizedOpen && (() => {
                    const optimizedResumes = filteredResumesSelection.filter(r => r.optimizationStatus === 'optimized');
                    return optimizedResumes.length > 0 ? (
                      renderSelectionList(optimizedResumes)
                    ) : (
                      <div className="mx-8 my-2 p-3 text-center text-slate-400 text-xs italic bg-slate-50/50 dark:bg-white/5 rounded-xl border border-dashed border-slate-200 dark:border-white/5">
                        暂无已优化简历
                      </div>
                    );
                  })()}
                </div>

                {/* 未优化 */}
                <div className="flex flex-col pt-2 bg-transparent">
                  <button
                    onClick={() => setIsUnoptimizedOpen(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-2 group"
                  >
                    <h3 className="ml-4 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">未优化</h3>
                    <span className="material-symbols-outlined text-[20px] text-slate-300 dark:text-slate-600 transition-transform duration-300 mr-4" style={{ transform: isUnoptimizedOpen ? 'none' : 'rotate(-90deg)' }}>
                      expand_more
                    </span>
                  </button>
                  {isUnoptimizedOpen && (() => {
                    const unoptimizedResumes = filteredResumesSelection.filter(r => r.optimizationStatus !== 'optimized');
                    return unoptimizedResumes.length > 0 ? (
                      renderSelectionList(unoptimizedResumes)
                    ) : (
                      <div className="mx-8 my-2 p-3 text-center text-slate-400 text-xs italic bg-slate-50/50 dark:bg-white/5 rounded-xl border border-dashed border-slate-200 dark:border-white/5">
                        暂无未优化简历
                      </div>
                    );
                  })()}
                </div>
              </>
            )}
          </div>

          {filteredResumesSelection.length > 0 && (
            <div className="h-12 flex items-center justify-center mt-4">
              <p className="text-xs text-slate-400 dark:text-slate-600">
                {filteredResumesSelection.length === (allResumes?.length || 0) ? '已加载全部内容' : `显示 ${filteredResumesSelection.length} 条结果`}
              </p>
            </div>
          )}
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
            <h1 className="text-lg font-bold tracking-tight">添加职位描述</h1>
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
                <div className="flex flex-col">
                  <h4 className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">当前分析简历</h4>
                  <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5 line-clamp-1">{selectedResumeLabel}</p>
                </div>
              </div>
              <div className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1 shrink-0 ${statusTone.bg} ${statusTone.border} ${statusTone.text}`}>
                <span className={`material-symbols-outlined text-[14px] ${resumeReadState.status === 'loading' ? 'animate-spin' : ''}`}>{statusTone.icon}</span>
                <span className="whitespace-nowrap">{statusTone.badge}</span>
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
                  <span className="size-4 border-2 border-slate-400 border-t-primary rounded-full animate-spin"></span>
                ) : (
                  <span className="material-symbols-outlined text-[20px]">image</span>
                )}
                <span className="text-sm">{isUploading ? '正在解析...' : '上传JD截图'}</span>
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

          <div className="flex gap-3 mt-2">
            <button
              onClick={() => setCurrentStep('resume_select')}
              className="flex-1 py-3 rounded-xl border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 text-sm font-bold hover:bg-slate-50 dark:hover:bg-white/5 active:scale-[0.98] transition-all"
            >
              上一步
            </button>
            <button
              onClick={handleStartAnalysisClick}
              className="flex-[2] py-3 rounded-xl bg-primary text-white text-sm font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-600 active:scale-[0.98] transition-all"
            >
              开始分析
            </button>
          </div>

          {showJdEmptyModal && (
            <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm px-6">
              <div className="w-full max-w-sm rounded-[32px] bg-red-500/90 backdrop-blur-xl border border-red-400/30 shadow-2xl p-8 text-white animate-in zoom-in-95 duration-200">
                <div className="flex flex-col items-center text-center gap-4">
                  <div className="size-16 rounded-full bg-white/20 flex items-center justify-center mb-2">
                    <span className="material-symbols-outlined text-white text-[32px]">warning</span>
                  </div>
                  <p className="text-base text-white/95 leading-relaxed font-bold px-2">
                    您未填写 JD，无法进行岗位定向匹配。是否坚持继续通用分析？
                  </p>
                </div>
                <div className="mt-8 flex flex-col gap-3">
                  <button
                    onClick={() => {
                      setShowJdEmptyModal(false);
                      startAnalysis();
                    }}
                    className="w-full rounded-2xl bg-white text-red-600 py-3.5 font-bold hover:bg-white/90 active:scale-[0.98] transition-all shadow-lg"
                  >
                    坚持继续分析
                  </button>
                  <button
                    onClick={() => setShowJdEmptyModal(false)}
                    className="w-full rounded-2xl bg-black/20 text-white/90 py-3.5 font-bold hover:bg-black/30 active:scale-[0.98] transition-all border border-white/10"
                  >
                    返回填写 JD
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
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
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
            <h1 className="text-base font-bold tracking-tight">诊断报告</h1>
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
              <h3 className="flex items-center gap-2 font-bold text-slate-800 dark:text-white text-base mb-1">
                <span className="material-symbols-outlined text-primary">auto_fix_high</span>
                AI 优化建议 ({suggestions.filter(s => s.status === 'pending').length})
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-4 ml-7">
                提示：AI 可能会根据行业模型润色细节，请注意核实关键数据。
              </p>
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
                                placeholder=""
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
                    <div className="p-3 flex flex-wrap items-center justify-between gap-3 bg-slate-50 dark:bg-white/5 border-t border-slate-100 dark:border-white/5">
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 min-w-0">
                        <span className="truncate">有帮助吗？</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => persistSuggestionFeedback(suggestion, 'up')}
                            className={`inline-flex items-center justify-center size-7 rounded-full border transition-colors ${suggestion.rating === 'up'
                              ? 'border-green-500 text-green-600 bg-green-50 dark:bg-green-900/20'
                              : 'border-slate-200 dark:border-white/10 text-slate-400 hover:text-green-600 hover:border-green-400'
                              }`}
                            aria-label="点赞"
                          >
                            <span className="material-symbols-outlined text-[16px]">thumb_up</span>
                          </button>
                          <button
                            onClick={() => persistSuggestionFeedback(suggestion, 'down')}
                            className={`inline-flex items-center justify-center size-7 rounded-full border transition-colors ${suggestion.rating === 'down'
                              ? 'border-rose-500 text-rose-600 bg-rose-50 dark:bg-rose-900/20'
                              : 'border-slate-200 dark:border-white/10 text-slate-400 hover:text-rose-600 hover:border-rose-400'
                              }`}
                            aria-label="点踩"
                          >
                            <span className="material-symbols-outlined text-[16px]">thumb_down</span>
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-auto">
                        <button
                          onClick={() => {
                            setSuggestions(prev => prev.map(s => s.id === suggestion.id ? { ...s, status: 'ignored' as const } : s));
                          }}
                          className="px-3 py-2 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 font-medium transition-colors"
                        >
                          忽略
                        </button>
                        <button
                          onClick={() => handleAcceptSuggestionInChat(suggestion)}
                          className="px-4 py-2 text-xs bg-primary hover:bg-blue-600 text-white font-bold rounded-lg shadow-sm shadow-blue-500/20 active:scale-95 transition-all flex items-center gap-1.5 whitespace-nowrap"
                        >
                          <span className="material-symbols-outlined text-[16px]">check</span>
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
              onClick={handleAnalyzeOtherResume}
              className="flex-1 flex items-center justify-center gap-2 h-12 rounded-xl shadow-lg bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 dark:hover:bg-slate-600 text-white transition-all active:scale-[0.98]"
            >
              <span className="material-symbols-outlined text-[18px]">restart_alt</span>
              <span className="text-[13px] font-bold tracking-wide">分析其他简历</span>
            </button>
            <button
              onClick={handleExportPDF}
              disabled={!hasAcceptedSuggestion}
              className={`flex-1 flex items-center justify-center gap-2 h-12 rounded-xl shadow-lg transition-all transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${!hasAcceptedSuggestion
                ? 'bg-slate-300 dark:bg-slate-800 text-slate-500'
                : 'bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 dark:hover:bg-slate-600 text-white'
                }`}
            >
              <span className="material-symbols-outlined text-[18px]">download</span>
              <span className="text-[13px] font-bold tracking-wide">前往预览导出</span>
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
              <div className="relative size-10 rounded-full overflow-hidden">
                <img
                  src={AI_AVATAR_URL}
                  onError={(e) => { (e.currentTarget as HTMLImageElement).src = AI_AVATAR_FALLBACK; }}
                  alt="AI Advisor"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="text-left">
                <p className="text-[13px] font-bold">AI 模拟面试官</p>
                <p className="text-[10px] text-blue-100 italic opacity-80">点击开始模拟面试</p>
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

  const toggleChatInputMode = () => setMode(inputMode === 'text' ? 'voice' : 'text');
  const endInterviewFromChat = () => { void handleSendMessage('结束面试', null); };
  const hasVoiceBlobForMsg = (msgId: string) => !!voiceBlobByMsgIdRef.current.get(msgId)?.blob;

  const onHoldPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setMode('voice');
    try { (e.currentTarget as any).setPointerCapture?.(e.pointerId); } catch { }
    holdActiveRef.current = true;
    holdPointerIdRef.current = e.pointerId;
    clearHoldMaxTimer();
    holdSessionRef.current += 1;
    const token = holdSessionRef.current;
    holdAwaitAudioSendRef.current = false;
    voicePendingUserMsgIdRef.current = null;
    holdStartRef.current = { x: e.clientX, y: e.clientY };
    holdStartTimeRef.current = Date.now();
    holdCancelRef.current = false;
    holdVoicePeakRef.current = 0;
    setHoldCancel(false);
    setAudioError('');
    setRecording(true);
    startAudioRecorder(token);

    // Max duration: auto-send after 3 minutes even if the user keeps holding.
    holdMaxTimerRef.current = window.setTimeout(() => {
      if (!holdActiveRef.current) return;

      holdActiveRef.current = false;
      holdStartRef.current = null;
      holdCancelRef.current = false;
      setHoldCancel(false);

      const heldMs = Date.now() - (holdStartTimeRef.current || Date.now());
      if (heldMs < MIN_VOICE_HOLD_MS) {
        voicePendingUserMsgIdRef.current = null;
        holdAwaitAudioSendRef.current = false;
        stopAudioRecorder(true);
        setRecording(false);
        cleanupVoiceMeter();
        showToast('按键时间太短，请按住说话', 'info');
        return;
      }

      const userMsgId = `user-voice-${Date.now()}`;
      voicePendingUserMsgIdRef.current = userMsgId;
      const duration = Math.max(1, Math.round((Date.now() - holdStartTimeRef.current) / 1000));
      const placeholder: ChatMessage = { id: userMsgId, role: 'user', text: '', audioPending: true, audioDuration: duration };
      const next = [...chatMessagesRef.current, placeholder];
      chatMessagesRef.current = next;
      setChatMessages(next);

      holdAwaitAudioSendRef.current = true;
      stopAudioRecorder(false);
      setRecording(false);
      cleanupVoiceMeter();
      showToast('已达到3分钟上限，已自动发送', 'info');

      try {
        const pid = holdPointerIdRef.current;
        if (pid !== null) holdTalkBtnRef.current?.releasePointerCapture?.(pid);
      } catch { }
      holdPointerIdRef.current = null;
      clearHoldMaxTimer();
    }, MAX_VOICE_HOLD_MS);
  };

  const onHoldPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!holdStartRef.current) return;

    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const insideX = e.clientX >= rect.left && e.clientX <= rect.right;
    const insideY = e.clientY >= rect.top && e.clientY <= rect.bottom;
    const startY = holdStartRef.current.y;
    const dy = startY - e.clientY;
    const screenDy = typeof window !== 'undefined' ? window.innerHeight / 3 : 240;
    const cancelThreshold = Math.max(120, Math.floor(screenDy));
    const cancel = (insideX && insideY) ? false : (dy > cancelThreshold);
    if (cancel !== holdCancelRef.current) {
      holdCancelRef.current = cancel;
      setHoldCancel(cancel);
    }
  };

  const onHoldPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    try { (e.currentTarget as any).releasePointerCapture?.(e.pointerId); } catch { }
    clearHoldMaxTimer();
    holdPointerIdRef.current = null;
    if (!holdActiveRef.current) return;
    const cancel = holdCancelRef.current;
    holdActiveRef.current = false;
    holdStartRef.current = null;
    holdCancelRef.current = false;
    setHoldCancel(false);
    if (cancel) {
      voicePendingUserMsgIdRef.current = null;
      stopAudioRecorder(true);
    } else {
      const heldMs = Date.now() - (holdStartTimeRef.current || Date.now());
      if (heldMs < MIN_VOICE_HOLD_MS) {
        voicePendingUserMsgIdRef.current = null;
        holdAwaitAudioSendRef.current = false;
        stopAudioRecorder(true);
        setRecording(false);
        cleanupVoiceMeter();
        showToast('按键时间太短，请按住说话', 'info');
        return;
      }
      const userMsgId = `user-voice-${Date.now()}`;
      voicePendingUserMsgIdRef.current = userMsgId;
      const duration = Math.max(1, Math.round((Date.now() - holdStartTimeRef.current) / 1000));
      const placeholder: ChatMessage = { id: userMsgId, role: 'user', text: '', audioPending: true, audioDuration: duration };
      const next = [...chatMessagesRef.current, placeholder];
      chatMessagesRef.current = next;
      setChatMessages(next);

      holdAwaitAudioSendRef.current = true;
      stopAudioRecorder(false);
    }
    setRecording(false);
    cleanupVoiceMeter();
  };

  const onHoldPointerCancel = (e: React.PointerEvent<HTMLButtonElement>) => {
    try { (e.currentTarget as any).releasePointerCapture?.(e.pointerId); } catch { }
    clearHoldMaxTimer();
    holdPointerIdRef.current = null;
    holdActiveRef.current = false;
    holdStartRef.current = null;
    holdCancelRef.current = false;
    setHoldCancel(false);
    voicePendingUserMsgIdRef.current = null;
    stopAudioRecorder(true);
    setRecording(false);
    cleanupVoiceMeter();
  };

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


