import React, { useState, useEffect, useRef } from 'react';
import { ScreenProps, ResumeData } from '../../types';
import { DatabaseService } from '../../src/database-service';
import { supabase } from '../../src/supabase-client';
import { AICacheService } from '../../src/ai-cache-service';

interface Suggestion {
  id: string;
  type: 'optimization' | 'grammar' | 'missing';
  title: string;
  reason: string;
  targetSection: 'personalInfo' | 'workExps' | 'skills' | 'projects' | 'summary';
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

const AiAnalysis: React.FC<ScreenProps> = ({ resumeData, setResumeData, allResumes, loadUserResumes }) => {
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
        result = result.split(token).join(value);
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
  const [selectedResumeId, setSelectedResumeId] = useState<number | null>(null);
  const [resumeTitle, setResumeTitle] = useState('');


  // Data State
  const [originalResumeData, setOriginalResumeData] = useState<ResumeData | null>(null);
  const [jdText, setJdText] = useState('');

  // Analysis Result State
  const [originalScore, setOriginalScore] = useState(0);
  const [score, setScore] = useState(0);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  // Upload State
  const [isUploading, setIsUploading] = useState(false);

  // Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [expandedReferences, setExpandedReferences] = useState<Record<string, boolean>>({});
  const [pendingNextQuestion, setPendingNextQuestion] = useState<string | null>(null);

  // Cache State
  const [isFromCache, setIsFromCache] = useState(false);

  // Optimized Resume Tracking
  const [optimizedResumeId, setOptimizedResumeId] = useState<number | null>(null);
  const [isSelectOptimizedOpen, setIsSelectOptimizedOpen] = useState(true);
  const [isSelectUnoptimizedOpen, setIsSelectUnoptimizedOpen] = useState(true);
  const hasRestoredAnalysisRef = useRef(false);

  const setAnalysisInProgress = (value: boolean) => {
    if (value) {
      localStorage.setItem('ai_analysis_in_progress', '1');
    } else {
      localStorage.removeItem('ai_analysis_in_progress');
    }
  };

  const recordExportHistory = async (filename: string, size: number) => {
    if (!resumeData?.id) return;

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) return;

      const currentHistory = resumeData.exportHistory || [];
      const entry = {
        filename,
        size,
        type: 'PDF' as const,
        exportedAt: new Date().toISOString()
      };
      const updatedResumeData: ResumeData = {
        ...resumeData,
        exportHistory: [entry, ...currentHistory].slice(0, 200)
      };

      if (setResumeData) {
        setResumeData(updatedResumeData);
      }

      await DatabaseService.updateResume(String(resumeData.id), {
        resume_data: updatedResumeData,
        updated_at: new Date().toISOString()
      });
    } catch (err) {
      console.error('Failed to record export history:', err);
    }
  };

  const applySuggestionFeedback = (items: Suggestion[]) => {
    const feedback = resumeData?.aiSuggestionFeedback || {};
    if (!feedback || Object.keys(feedback).length === 0) return items;
    return items.map(item => {
      const entry = feedback[item.id];
      return entry?.rating ? { ...item, rating: entry.rating } : item;
    });
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
    const parts: string[] = [];

    if (direction) {
      parts.push(direction);
    } else if (baseTitle) {
      parts.push(baseTitle);
    } else {
      parts.push('简历');
    }

    if (includeCompany) {
      const companyName = getCompanyNameFromJd(jd);
      if (companyName) {
        parts.push(companyName);
      }
    }

    if (personName) {
      parts.push(personName);
    }

    return parts.join(' - ');
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
      lastJdText: sessionJdText
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

  const handleResumeSelect = async (id: number) => {
    setSelectedResumeId(id);

    // 立即切换到下一步，提高用户体验
    setCurrentStep('jd_input');

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
        // 已经切换到下一步，这里只需要显示错误提示
        alert('请先登录');
        return;
      }

      // Get all user resumes and find the specific one
      const result = await DatabaseService.getUserResumes(user.id);

      if (result.success) {
        console.log('All resumes found:', result.data);

        const resume = result.data.find(r => r.id === id);

        if (resume) {
          console.log('Target resume found:', resume);
          // Set resume title
          setResumeTitle(resume.title);

          // 检查resume_data是否为空
          if (!resume.resume_data) {
            console.error('Resume data is empty: resume_data is null/undefined');
            alert('简历数据为空，请重新创建简历');
            return;
          }

          // 检查resume_data是否为空对象
          if (typeof resume.resume_data === 'object' && Object.keys(resume.resume_data).length === 0) {
            console.error('Resume data is empty object: resume_data is empty object');
            alert('简历数据为空，请重新创建简历');
            return;
          }

          console.log('Resume loaded successfully:', resume);

          // Set the resume data with ID
          if (setResumeData) {
            const finalResumeData = {
              id: resume.id,
              ...resume.resume_data
            };

            console.log('Setting resume data:', finalResumeData);
            setResumeData(finalResumeData);
          }
        } else {
          console.error('Resume not found');
          alert(`简历不存在 (ID: ${id})`);
        }
      } else {
        console.error('Failed to load resumes:', result.error);
        alert(`加载简历失败: ${result.error?.message || '请重试'}`);
      }
    } catch (error) {
      console.error('Error loading resume:', error);
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
        console.log('🎯 Using cached AI analysis result');
        console.log(`📊 Cache stats: ${AICacheService.getHitRate()}% hit rate`);
        setIsFromCache(true);
        return cachedResult;
      }
      setIsFromCache(false);
      // ========== 缓存检查结束 ==========

      // --- 终极 Token 获取逻辑 ---
      // 1. 优先获取自定义登录的 token
      let token = localStorage.getItem('token');

      // 2. 如果没有，解析 supabase_session
      if (!token) {
        const sessionStr = localStorage.getItem('supabase_session');
        if (sessionStr) {
          try {
            const session = JSON.parse(sessionStr);
            token = session.access_token || session.token; // 兼容不同字段名
          } catch (e) {
            console.error('Failed to parse supabase_session');
          }
        }
      }

      if (!token) {
        alert('登录已过期，请重新登录');
        window.location.href = '/login'; // 或者你的登录路由
        return null;
      }
      // --- End ---

      console.log("🚀 发送到后端的 Token 是:", token);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // Increase timeout to 60s

      const masker = createMasker();
      const maskedResumeData = masker.maskObject(resumeData);
      const maskedJdText = masker.maskText(jdText || '');

      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/ai/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token.trim()}` // 增加 trim() 防止空格导致 401
        },
        signal: controller.signal,
        body: JSON.stringify({
          resumeData: maskedResumeData,
          jobDescription: maskedJdText
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

    // 🔴 标记原始简历为“未优化”
    if (resumeData.id) {
      const originalTitle = allResumes?.find(r => r.id === resumeData.id)?.title || '简历';
      const updatedTitle = buildResumeTitle(originalTitle, resumeData, jdText, false);
      DatabaseService.updateResume(String(resumeData.id), {
        title: updatedTitle,
        resume_data: { ...resumeData, optimizationStatus: 'unoptimized' as const, lastJdText: jdText }
      }).then(res => console.log('Original resume marked as unoptimized:', res.success));
    }

    setAnalysisInProgress(true);
    setCurrentStep('analyzing');

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

        backendSuggestions.forEach((suggestion: any, index: number) => {
          // 如果是字符串，转换为对象
          if (typeof suggestion === 'string') {
            newSuggestions.push({
              id: `ai-suggestion-${index}`,
              type: 'optimization',
              title: '优化建议',
              reason: suggestion,
              targetSection: 'skills',
              targetId: undefined,
              targetField: undefined,
              suggestedValue: undefined,
              originalValue: undefined,
              status: 'pending' as const
            });
          } else {
            // 如果是对象，直接使用
            newSuggestions.push({
              id: suggestion.id || `ai-suggestion-${index}`,
              type: suggestion.type || 'optimization',
              title: suggestion.title || '优化建议',
              reason: suggestion.reason || '根据AI分析结果',
              targetSection: suggestion.targetSection || 'skills',
              targetId: suggestion.targetId,
              targetField: suggestion.targetField,
              suggestedValue: suggestion.suggestedValue,
              originalValue: suggestion.originalValue,
              status: 'pending' as const
            });
          }
        });

        const newReport: AnalysisReport = {
          summary: aiAnalysisResult.summary || 'AI分析完成，请查看详细报告。',
          strengths: aiAnalysisResult.strengths || ['结构清晰'],
          weaknesses: aiAnalysisResult.weaknesses || ['需要进一步优化'],
          missingKeywords: aiAnalysisResult.missingKeywords, // 直接使用后端返回的数据
          scoreBreakdown: aiAnalysisResult.scoreBreakdown || {
            experience: 75,
            skills: 80,
            format: 90
          }
        };

        // 使用后端返回的实际分数
        const totalScore = aiAnalysisResult.score || Math.round(
          (newReport.scoreBreakdown.experience + newReport.scoreBreakdown.skills + newReport.scoreBreakdown.format) / 3
        );

        // 保存原始分数
        setOriginalScore(totalScore);
        // 初始化当前分数为原始分数
        setScore(totalScore);
        setSuggestions(applySuggestionFeedback(newSuggestions));
        setReport(newReport);




        setCurrentStep('report');
      }
    } catch (error) {
      console.error('AI analysis failed:', error);
      // 显示错误提示，不回退到模拟数据
      alert(`AI 分析失败：${error.message || '网络连接异常，请稍后重试'}`);
      setCurrentStep('jd_input');
    } finally {
      setAnalysisInProgress(false);
    }
  };

  const updateScore = (points: number) => {
    setScore(prev => Math.min(prev + points, 100));
  };

  const handleAcceptSuggestionInChat = async (suggestion: Suggestion) => {
    try {
      if (!setResumeData || !resumeData) return;

      console.log('handleAcceptSuggestionInChat called with suggestion:', suggestion);

      const applySuggestionToResume = (base: ResumeData) => {
        console.log('Current resume data before update:', base);
        const newData = { ...base };

        // 1. 处理个人信息
        if (suggestion.targetSection === 'personalInfo') {
          newData.personalInfo = {
            ...newData.personalInfo,
            [suggestion.targetField!]: suggestion.suggestedValue
          };
        }
        // 2. 处理工作经历 (增加安全检查)
        else if (suggestion.targetSection === 'workExps') {
          if (Array.isArray(newData.workExps)) {
            newData.workExps = newData.workExps.map(item =>
              item.id === suggestion.targetId
                ? { ...item, [suggestion.targetField!]: suggestion.suggestedValue }
                : item
            );
          }
        }
        // 3. 处理技能 (🔴 重点修复区)
        else if (suggestion.targetSection === 'skills') {
          let safeSkills = suggestion.suggestedValue;

          // 强制转换为数组：如果 AI 给的是字符串 "A, B, C"，转为 ["A", "B", "C"]
          if (typeof safeSkills === 'string') {
            safeSkills = safeSkills.split(/[,，]\s*/).filter(Boolean); // 支持中英文逗号
          }

          // 最后的防线：确保它是数组
          if (Array.isArray(safeSkills)) {
            newData.skills = safeSkills;
          } else {
            console.warn("AI returned invalid skills format:", safeSkills);
            // 如果格式完全不对，保持原样，不崩溃
            return base;
          }
        }
        // 4. 处理项目经历 (增加安全检查)
        else if (suggestion.targetSection === 'projects') {
          // 处理 projects 数组更新
          if (suggestion.targetId) {
            // 更新单个项目
            if (Array.isArray(newData.projects)) {
              newData.projects = newData.projects.map(item => item.id === suggestion.targetId ? { ...item, [suggestion.targetField!]: suggestion.suggestedValue } : item);
            }
          } else {
            // 更新整个 projects 数组
            let safeProjects = suggestion.suggestedValue;
            // 确保它是数组
            if (Array.isArray(safeProjects)) {
              newData.projects = safeProjects;
            } else {
              console.warn("AI returned invalid projects format:", safeProjects);
              // 如果格式完全不对，保持原样，不崩溃
              return base;
            }
          }
        }
        // 5. 处理个人简介
        else if (suggestion.targetSection === 'summary') {
          // 处理 summary 字符串更新
          newData.summary = suggestion.suggestedValue;
        }
        console.log('Updated resume data:', newData);
        return newData;
      };

      const nextResumeData = applySuggestionToResume(resumeData);
      setResumeData(nextResumeData);

      // Update suggestions state
      setSuggestions(prev => {
        const updatedSuggestions = prev.map(s => s.id === suggestion.id ? { ...s, status: 'accepted' as const } : s);
        console.log('Updated suggestions:', updatedSuggestions);
        return updatedSuggestions;
      });

      // Update chat message to show accepted state
      setChatMessages(prev => {
        const updatedMessages = prev.map(msg =>
          msg.suggestion?.id === suggestion.id
            ? { ...msg, suggestion: { ...msg.suggestion!, status: 'accepted' as const } }
            : msg
        );
        console.log('Updated chat messages:', updatedMessages);
        return updatedMessages;
      });

      updateScore(5);

      // 数据持久化：将最新数据同步到 Supabase 数据库
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) return;

        // 确保数据带有“已优化”标记
        const updatedDataWithStatus = {
          ...nextResumeData,
          optimizationStatus: 'optimized' as const,
          lastJdText: jdText
        };

        const originalTitle = allResumes?.find(r => r.id === selectedResumeId)?.title || '简历';
        const newTitle = buildResumeTitle(originalTitle, updatedDataWithStatus, jdText, true);

        if (optimizedResumeId) {
          // 1. 如果本会话已创建过优化副本，则更新它
          await DatabaseService.updateResume(String(optimizedResumeId), {
            resume_data: updatedDataWithStatus,
            title: newTitle,
            updated_at: new Date().toISOString()
          });
          console.log('✅ Real-time update synced to record:', optimizedResumeId);
        } else {
          // 2. 第一次采纳建议，创建全新的“优化版”记录
          const createResult = await DatabaseService.createResume(user.id, newTitle, updatedDataWithStatus);

          if (createResult.success && createResult.data) {
            const newId = createResult.data.id;
            setOptimizedResumeId(newId);
            console.log('🚀 Created new optimized resume record:', newTitle, 'ID:', newId);

            // 关键修改：此时需要更新 resumeData 的 ID 为新创建的 ID
            // 这样确保后续的操作（如再次采纳建议）都是基于新建立的副本，而不是覆盖原简历
            if (setResumeData) {
              setResumeData(prev => ({
                ...prev,
                id: newId,
                optimizationStatus: 'optimized' as const,
                lastJdText: jdText
              }));
            }

            // 可选：触发外部刷新列表
            if (loadUserResumes) loadUserResumes();
          }
        }

        if (optimizedResumeId && loadUserResumes) {
          loadUserResumes();
        }
      } catch (dbError) {
        console.error('Database error in real-time sync:', dbError);
      }

      // AI Follow up with conversation instead of automatic suggestion
      setTimeout(() => {
        console.log('Executing follow-up logic after acceptance');
        // 使用函数式更新来获取最新的 suggestions 状态
        setSuggestions(prevSuggestions => {
          // 计算剩余待处理建议
          const remaining = prevSuggestions.filter(s => s.id !== suggestion.id && s.status === 'pending');
          console.log('Remaining pending suggestions:', remaining);
          if (remaining.length > 0) {
            const followUpMsg: ChatMessage = {
              id: `ai-follow-${Date.now()}`,
              role: 'model',
              text: '收到。我们继续下一题。'
            };
            console.log('Adding follow-up message:', followUpMsg);
            setChatMessages(prev => [...prev, followUpMsg]);
          } else {
            const doneMsg = {
              id: 'ai-done',
              role: 'model' as const,
              text: '好的，我们继续面试。'
            };
            console.log('Adding done message:', doneMsg);
            setChatMessages(prev => [...prev, doneMsg]);
          }
          return prevSuggestions; // 不改变suggestions状态，只是使用它来计算
        });
      }, 800);
    } catch (error) {
      console.error('Error in handleAcceptSuggestionInChat:', error);
      // 不使用 alert，避免中断用户操作
      console.log('Error handled, continuing execution');
      // 确保界面仍然保留在对话框中
      if (currentStep !== 'chat') {
        console.log('Current step is not chat, setting to chat');
        // 这里不应该发生，因为函数只在聊天步骤中调用
      }
    }
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

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      // 清理简历数据，删除不需要的字段
      const sanitizeData = (data: any) => {
        if (!data) return data;
        const sanitized = { ...data };
        // 删除可能导致问题的字段
        const fieldsToRemove = ['id', 'suggestions', 'metadata', 'status', 'optimizationStatus', 'interviewSessions', 'lastJdText'];
        fieldsToRemove.forEach((field) => {
          if (field in sanitized) delete sanitized[field];
        });
        return sanitized;
      };

      const sanitizedResumeData = sanitizeData(resumeData);

      // 确保使用正确的简历标题作为文件名
      // 优先使用 resumeTitle，如果为空则使用 buildResumeTitle 生成，最后 fallback 到姓名
      const effectiveFilename = resumeTitle
        || buildResumeTitle(undefined, resumeData, jdText, true)
        || resumeData?.personalInfo?.name
        || '简历';

      // 调用后端 PDF 导出接口
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'}/api/export-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          resumeData: sanitizedResumeData,
          jdText: jdText,
          filename: effectiveFilename // Pass the title as filename
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || errorData.message || 'PDF 生成失败');
      }

      // 获取 PDF 文件流并下载
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;

      // 从响应头获取文件名，如果没有则使用默认名称
      const contentDisposition = response.headers.get('content-disposition');
      let filename = '简历.pdf';
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      } else {
        // 使用用户姓名生成文件名
        const name = resumeData?.personalInfo?.name || '简历';
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        filename = `${name}_优化简历_${date}.pdf`;
      }

      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      await recordExportHistory(filename, blob.size);

      console.log('✅ PDF 导出成功');
      alert("优化后的简历 PDF 已下载！");

    } catch (error) {
      console.error('❌ PDF 导出失败:', error);
      alert(`PDF 导出失败: ${error.message}`);
    } finally {
      setIsExporting(false);
    }
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

        // 获取token
        let token = localStorage.getItem('token');
        if (!token) {
          const supabaseSession = localStorage.getItem('supabase_session');
          if (supabaseSession) {
            try {
              const session = JSON.parse(supabaseSession);
              token = session.access_token;
            } catch (e) { }
          }
        }

        if (!token) {
          alert('登录已过期，请重新登录');
          setIsUploading(false);
          return;
        }

        // 调用后端API进行OCR识别
        const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/ai/parse-screenshot`, {
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
          if (result.text) {
            setJdText(result.text);
            alert('截图识别成功，已填充到文本框');
          } else {
            alert('截图识别失败，请重试');
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


  // 记住用户所在步骤，切换回来可恢复
  useEffect(() => {
    localStorage.setItem('ai_analysis_step', currentStep);
  }, [currentStep]);

  // 恢复分析结果：从缓存中恢复分数/建议，避免切页后变成 0
  useEffect(() => {
    if (!resumeData) return;
    if (hasRestoredAnalysisRef.current) return;

    const restoredJdText = (jdText || resumeData.lastJdText || '').trim();
    if (!jdText && restoredJdText) {
      setJdText(restoredJdText);
    }

    const shouldRestore = score === 0 && suggestions.length === 0;
    if (!shouldRestore) {
      hasRestoredAnalysisRef.current = true;
      return;
    }

    AICacheService.get(resumeData, restoredJdText).then((cached) => {
      // 无论是否找到缓存，都标记为已尝试恢复，避免重复查询
      hasRestoredAnalysisRef.current = true;

      if (!cached) {
        // 如果没有缓存数据，且处于需要数据的步骤（排除 resume_select, jd_input, 和 analyzing），则重置回第一步
        // 关键修复：排除 'analyzing' 状态，防止正在分析时被强制跳回
        if (currentStep !== 'resume_select' && currentStep !== 'jd_input' && currentStep !== 'analyzing') {
          console.log('No cached analysis data found, resetting step to resume_select');
          setCurrentStep('resume_select');
        }
        return;
      }

      setOriginalScore(cached.score || 0);
      setScore(cached.score || 0);
      setSuggestions(applySuggestionFeedback(cached.suggestions || []));
      setReport({
        summary: cached.summary || '',
        strengths: cached.strengths || [],
        weaknesses: cached.weaknesses || [],
        missingKeywords: cached.missingKeywords || [],
        scoreBreakdown: cached.scoreBreakdown || { experience: 0, skills: 0, format: 0 }
      });

      // 数据恢复完成后，保持当前步骤不变，由 localStorage 初始值或外部跳转逻辑决定步骤
      // 移除原有的强制跳转到 report 的逻辑，以修复从预览页跳转 chat 却落到 report 的问题

      hasRestoredAnalysisRef.current = true;
    });
  }, [resumeData, jdText, score, suggestions.length, currentStep]);

  // 如果处于分析或聊天步骤但没有分数数据，强制返回第一步（兜底策略）
  useEffect(() => {
    if ((currentStep === 'report' || currentStep === 'chat') && score === 0 && suggestions.length === 0 && !isFromCache && hasRestoredAnalysisRef.current) {
      console.log('Detected detailed step without data, resetting to resume_select');
      setCurrentStep('resume_select');
    }
  }, [currentStep, score, suggestions.length, isFromCache]);

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

    if (shouldOpen && resumeData?.id && targetId === String(resumeData.id)) {
      localStorage.removeItem('ai_interview_open');
      localStorage.removeItem('ai_interview_resume_id');

      const savedJdText = resumeData.lastJdText || '';
      if (savedJdText) {
        setJdText(savedJdText);
      }

      const sessions = resumeData.interviewSessions || {};
      const sessionKey = savedJdText ? makeJdKey(savedJdText) : null;
      const session = sessionKey ? sessions[sessionKey] : getLatestInterviewSession(sessions);

      if (session && session.messages?.length) {
        setChatMessages(session.messages as ChatMessage[]);
        setChatInitialized(true);
      } else {
        setChatMessages([]);
        setChatInitialized(false);
      }

      setCurrentStep('chat');
    }
  }, [resumeData?.id]);

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
      let userName = '您好';
      if (resumeData?.personalInfo?.name) {
        // 提取名字部分，移除姓氏
        const fullName = resumeData.personalInfo.name;
        // 简单处理：如果名字包含空格或中文姓氏，只取最后一个部分
        if (fullName.includes(' ')) {
          // 英文名字，取最后一个单词
          userName = fullName.split(' ').pop() || fullName;
        } else if (fullName.length > 2) {
          // 中文名字，取后两个字（假设姓氏为单字）
          userName = fullName.slice(-2);
        } else {
          // 单字名字或其他情况，直接使用
          userName = fullName;
        }
      }

      // 先显示问候和面试介绍消息
      setTimeout(() => {
        const summaryMessage = {
          id: 'ai-summary',
          role: 'model' as const,
          text: `${userName}，您好！我是您的 AI 模拟面试官。${jdText ? '我已经阅读了您的简历和目标职位描述，' : '我已经阅读了您的简历，'}接下来将基于这些信息对您进行模拟面试。每题会给出点评、改进要点与参考回复。`
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

  // 进入对话框时预填“准备好了”
  useEffect(() => {
    if (currentStep === 'chat' && !inputMessage) {
      setInputMessage('准备好了');
    }
  }, [currentStep]);

  const handleSendMessage = async (textOverride?: string) => {
    const textToSend = textOverride || inputMessage;
    if (!textToSend.trim()) return;

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

      // --- 🔴 修改开始 ---
      let token = localStorage.getItem('token');

      if (!token) {
        const supabaseSession = localStorage.getItem('supabase_session');
        if (supabaseSession) {
          try {
            const session = JSON.parse(supabaseSession);
            token = session.access_token;
          } catch (e) { }
        }
      }

      if (!token) {
        throw new Error('请先登录以使用 AI 功能');
      }
      // --- 🟢 修改结束 ---



      const apiEndpoint = `${import.meta.env.VITE_API_BASE_URL}/api/ai/chat`;

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
          <div className="flex items-center justify-center h-14 px-4 relative">
            <h1 className="text-lg font-bold tracking-tight">AI 智能诊断</h1>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 pb-32">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">第一步：选择简历</h2>
          <div className="grid gap-4">
            <button
              onClick={() => setIsSelectOptimizedOpen(v => !v)}
              className="w-full flex items-center justify-between text-lg font-bold text-white"
            >
              <span>已优化</span>
              <span className="material-symbols-outlined text-[20px] text-slate-500 dark:text-slate-400">
                {isSelectOptimizedOpen ? 'expand_less' : 'expand_more'}
              </span>
            </button>
            {isSelectOptimizedOpen && (
              (allResumes || []).filter(r => r.optimizationStatus === 'optimized').length > 0 ? (
                (allResumes || []).filter(r => r.optimizationStatus === 'optimized').map((resume) => (
                  <div
                    key={resume.id}
                    onClick={() => handleResumeSelect(resume.id)}
                    className="flex items-center gap-4 p-4 bg-white dark:bg-surface-dark rounded-xl shadow-sm border border-gray-100 dark:border-white/5 cursor-pointer hover:border-primary transition-all active:scale-[0.99]"
                  >
                    <div className="shrink-0 w-12 h-16 bg-slate-100 dark:bg-slate-700 rounded overflow-hidden relative border border-slate-200 dark:border-slate-600">
                      {resume.thumbnail}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-slate-900 dark:text-white">{resume.title}</h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{resume.date}</p>
                    </div>
                    <span className="material-symbols-outlined text-slate-500 dark:text-slate-400">arrow_forward_ios</span>
                  </div>
                ))
              ) : (
                <div className="p-4 text-center text-slate-500 text-sm bg-white dark:bg-card-dark rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                  暂无已优化简历
                </div>
              )
            )}

            <button
              onClick={() => setIsSelectUnoptimizedOpen(v => !v)}
              className="w-full flex items-center justify-between text-lg font-bold text-white"
            >
              <span>未优化</span>
              <span className="material-symbols-outlined text-[20px] text-slate-500 dark:text-slate-400">
                {isSelectUnoptimizedOpen ? 'expand_less' : 'expand_more'}
              </span>
            </button>
            {isSelectUnoptimizedOpen && (
              (allResumes || []).filter(r => r.optimizationStatus !== 'optimized').length > 0 ? (
                (allResumes || []).filter(r => r.optimizationStatus !== 'optimized').map((resume) => (
                  <div
                    key={resume.id}
                    onClick={() => handleResumeSelect(resume.id)}
                    className="flex items-center gap-4 p-4 bg-white dark:bg-surface-dark rounded-xl shadow-sm border border-gray-100 dark:border-white/5 cursor-pointer hover:border-primary transition-all active:scale-[0.99]"
                  >
                    <div className="shrink-0 w-12 h-16 bg-slate-100 dark:bg-slate-700 rounded overflow-hidden relative border border-slate-200 dark:border-slate-600">
                      {resume.thumbnail}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-slate-900 dark:text-white">{resume.title}</h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{resume.date}</p>
                    </div>
                    <span className="material-symbols-outlined text-slate-500 dark:text-slate-400">arrow_forward_ios</span>
                  </div>
                ))
              ) : (
                <div className="p-4 text-center text-slate-500 text-sm bg-white dark:bg-card-dark rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                  暂无未优化简历
                </div>
              )
            )}
          </div>
        </main>
      </div>
    );
  }

  // 2. JD Input
  if (currentStep === 'jd_input') {
    return (
      <div className="flex flex-col min-h-screen bg-background-light dark:bg-background-dark animate-in slide-in-from-right duration-300">
        <header className="sticky top-0 z-50 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md border-b border-gray-200 dark:border-white/5">
          <div className="flex items-center justify-between h-14 px-4 relative">
            <button onClick={() => setCurrentStep('resume_select')} className="p-2 -ml-2 rounded-full hover:bg-slate-200 dark:hover:bg-white/10 text-slate-900 dark:text-white">
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <h1 className="text-lg font-bold tracking-tight">第二步：添加职位描述</h1>
            <button onClick={startAnalysis} className="text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-primary">跳过</button>
          </div>
        </header>
        <main className="p-4 flex flex-col gap-6">
          <div className="bg-white dark:bg-surface-dark p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/5">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-primary">description</span>
              <h3 className="font-bold text-slate-900 dark:text-white">职位描述 (JD)</h3>
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
                onClick={() => document.getElementById('jd-screenshot-upload')?.click()}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-50 dark:hover:bg-[#111a22] transition-all"
              >
                <span className="material-symbols-outlined">image</span>
                上传JD截图
              </button>
              <input
                type="file"
                id="jd-screenshot-upload"
                accept="image/*"
                onChange={handleScreenshotUpload}
                className="hidden"
              />
            </div>

            {/* 上传状态显示 */}
            {isUploading && (
              <div className="mt-3 text-center text-sm text-slate-500 dark:text-slate-400">
                正在处理截图...
              </div>
            )}
          </div>

          <button
            onClick={startAnalysis}
            disabled={!jdText}
            className="w-full py-3.5 rounded-xl bg-primary text-white font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-600 active:scale-[0.98] transition-all disabled:opacity-50 disabled:shadow-none"
          >
            开始匹配分析
          </button>
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
            <button onClick={() => setCurrentStep('jd_input')} className="p-2 -ml-2 rounded-full hover:bg-slate-200 dark:hover:bg-white/10 text-slate-900 dark:text-white">
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
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-300">{suggestion.reason}</p>
                      <div className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
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
                    </div>

                    {/* Original and Suggested Content - Stacked for better mobile view */}
                    <div className="flex flex-col divide-y divide-slate-100 dark:divide-white/5">
                      {/* Original */}
                      <div className="p-4 bg-red-50/30 dark:bg-red-900/5">
                        <p className="text-xs font-bold text-red-400 mb-2 uppercase">修改前</p>
                        <div className="text-sm text-slate-500 bg-white/50 dark:bg-black/20 p-3 rounded-lg border border-red-100 dark:border-red-900/20 min-h-[80px]">
                          {suggestion.originalValue || <span className="italic text-slate-400">无内容</span>}
                        </div>
                      </div>

                      {/* Suggested (Editable) */}
                      <div className="p-4 bg-green-50/30 dark:bg-green-900/5">
                        <p className="text-xs font-bold text-green-500 mb-2 uppercase flex justify-between items-center">
                          修改后 (可编辑)
                          <span className="material-symbols-outlined text-[14px]">edit</span>
                        </p>
                        <textarea
                          value={Array.isArray(suggestion.suggestedValue) ? suggestion.suggestedValue.join(', ') : suggestion.suggestedValue}
                          onChange={(e) => {
                            setSuggestions(prev => prev.map(s =>
                              s.id === suggestion.id ? { ...s, suggestedValue: e.target.value } : s
                            ));
                          }}
                          className="w-full text-sm text-slate-800 dark:text-slate-200 bg-white dark:bg-black/20 p-3 rounded-lg border border-green-200 dark:border-green-900/30 min-h-[120px] focus:ring-2 focus:ring-green-500/30 outline-none resize-y transition-all"
                        />
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="p-3 flex justify-end gap-3 bg-slate-50 dark:bg-white/5 border-t border-slate-100 dark:border-white/5">
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
                ))}
              </div>
            </div>
          )}



          {/* Export PDF Button - After suggestions */}
          <div className="mb-52 space-y-3">
            <button
              onClick={handleExportPDF}
              disabled={isExporting || !hasAcceptedSuggestion}
              className={`w-full flex items-center justify-center gap-3 h-14 rounded-xl shadow-lg transition-all transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${!hasAcceptedSuggestion
                ? 'bg-slate-300 dark:bg-slate-800 text-slate-500'
                : 'bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 dark:hover:bg-slate-600 text-white'
                }`}
            >
              {isExporting ? (
                <>
                  <span className="size-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  <span className="text-base font-bold tracking-wide">生成 PDF 中...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[24px]">download</span>
                  <span className="text-base font-bold tracking-wide">导出优化后简历 PDF</span>
                </>
              )}
            </button>

          </div>
        </main>

        {/* Fixed AI Advisor Button - Above Navigation Bar */}
        <div className="fixed bottom-20 left-0 right-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-white/95 dark:bg-[#101922]/95 backdrop-blur-md border-t border-slate-200 dark:border-white/10 z-[40]">
          <button
            onClick={() => setCurrentStep('chat')}
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
            <button onClick={() => setCurrentStep('report')} className="p-1 -ml-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10">
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
        <div className="flex-1 overflow-y-auto p-4 space-y-5 bg-slate-50 dark:bg-[#0b1219] pb-32">
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
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (!isSending) handleSendMessage();
                }
              }}
              placeholder="输入您的问题..."
              className="flex-1 bg-slate-100 dark:bg-[#111a22] border-0 rounded-2xl px-4 py-2 text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-primary outline-none transition-all resize-none"
              rows={1}
              style={{ minHeight: '48px', maxHeight: '120px' }}
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
