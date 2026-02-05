import React, { useState, useEffect, useRef } from 'react';
import { View, ScreenProps, ResumeSummary, ResumeData } from '../../types';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { DatabaseService } from '../../src/database-service';
import { supabase } from '../../src/supabase-client';

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

const AiAnalysis: React.FC<ScreenProps> = ({ resumeData, setResumeData, allResumes }) => {
  // Navigation State
  const [currentStep, setCurrentStep] = useState<Step>('resume_select');
  const [selectedResumeId, setSelectedResumeId] = useState<number | null>(null);

  // Visual Viewport State
  const [viewportHeight, setViewportHeight] = useState(window.innerHeight);
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  // Data State
  const [originalResumeData, setOriginalResumeData] = useState<ResumeData | null>(null);
  const [jdText, setJdText] = useState('');

  // Analysis Result State
  const [originalScore, setOriginalScore] = useState(0);
  const [score, setScore] = useState(0);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  // Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/ai/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token.trim()}` // 增加 trim() 防止空格导致 401
        },
        body: JSON.stringify({
          resumeData: resumeData,
          jobDescription: jdText
        })
      });

      // 重点：如果后端返回 401，一定要抛出错误
      if (response.status === 401) {
          throw new Error('鉴权失败，服务器不认这个 Token');
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'AI分析请求失败');
      }

      const result = await response.json();
      console.log('Backend AI analysis result:', result);
      
      // 确保 result.score 存在
      const backendScore = result.score || 0;
      
      // 转换后端返回的数据格式为前端需要的格式
      const analysisResult = {
        summary: result.summary || 'AI分析完成',
        strengths: result.strengths || [],
        weaknesses: result.weaknesses || [],
        missingKeywords: result.missingKeywords, // 直接使用后端返回的数据
        score: backendScore, // 保存原始分数
        scoreBreakdown: {
          experience: Math.round(backendScore * 0.4), // 假设经验占40%
          skills: Math.round(backendScore * 0.4),     // 技能占40%
          format: Math.round(backendScore * 0.2)      // 格式占20%
        },
        suggestions: result.suggestions // 直接使用后端返回的建议
      };
      
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
    
    // Snapshot original data for comparison later
    setOriginalResumeData(JSON.parse(JSON.stringify(resumeData)));

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
        setSuggestions(newSuggestions);
        setReport(newReport);
        
        
          
        
        setCurrentStep('report');
      }
    } catch (error) {
      console.error('AI analysis failed:', error);
      // 显示错误提示，不回退到模拟数据
      alert(`AI 分析失败：${error.message || '网络连接异常，请稍后重试'}`);
      setCurrentStep('jd_input');
    }
  };

  const updateScore = (points: number) => {
    setScore(prev => Math.min(prev + points, 100));
  };

  const handleAcceptSuggestionInChat = async (suggestion: Suggestion) => {
    try {
      if (!setResumeData || !resumeData) return;

      console.log('handleAcceptSuggestionInChat called with suggestion:', suggestion);

      // Apply data change silently
      setResumeData(prev => {
          console.log('Current resume data before update:', prev);
          const newData = { ...prev };

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
                  return prev;
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
                      return prev;
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
      });

      // Update suggestions state
      setSuggestions(prev => {
          const updatedSuggestions = prev.map(s => s.id === suggestion.id ? { ...s, status: 'accepted' } : s);
          console.log('Updated suggestions:', updatedSuggestions);
          return updatedSuggestions;
      });
      
      // Update chat message to show accepted state
      setChatMessages(prev => {
          const updatedMessages = prev.map(msg => 
            msg.suggestion?.id === suggestion.id 
              ? { ...msg, suggestion: { ...msg.suggestion!, status: 'accepted' } } 
              : msg
          );
          console.log('Updated chat messages:', updatedMessages);
          return updatedMessages;
      });

      updateScore(5);

      // 数据持久化：将最新数据同步到 Supabase 数据库
      try {
        // 获取当前用户
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        
        if (userError || !user) {
          console.error('User not authenticated:', userError);
          return;
        }

        if (resumeData.id) {
          // 如果有简历 ID，使用 update 方法
          // 注意：根据 DatabaseService 的实现，我们需要传递包含 resume_data 字段的对象
          const updateResult = await DatabaseService.updateResume(resumeData.id, {
            resume_data: resumeData,
            updated_at: new Date().toISOString()
          });
          if (updateResult.success) {
            console.log('Resume updated successfully:', updateResult);
          } else {
            console.error('Failed to update resume:', updateResult.error);
          }
        } else {
          // 如果没有简历 ID，使用 createResume 方法
          const createResult = await DatabaseService.createResume(user.id, '优化后的简历', resumeData);
          if (createResult.success) {
            console.log('Resume created successfully:', createResult);
          } else {
            console.error('Failed to create resume:', createResult.error);
          }
        }
      } catch (dbError) {
        console.error('Database error in handleAcceptSuggestionInChat:', dbError);
        // 数据库错误不影响前端操作，只记录日志
      }

      // AI Follow up with conversation instead of automatic suggestion
      setTimeout(() => {
          console.log('Executing follow-up logic after acceptance');
          // 直接获取最新的 suggestions 状态
          const remaining = suggestions.filter(s => s.id !== suggestion.id && s.status === 'pending');
          console.log('Remaining pending suggestions:', remaining);
          if (remaining.length > 0) {
              const followUpMsg: ChatMessage = {
                  id: `ai-follow-${Date.now()}`,
                  role: 'model',
                  text: '✅ 修改已应用！我还有其他建议可以帮助您进一步优化简历。您想继续优化其他部分吗？'
              };
              console.log('Adding follow-up message:', followUpMsg);
              setChatMessages(prev => [...prev, followUpMsg]);
          } else {
               const doneMsg = {
                   id: 'ai-done',
                   role: 'model',
                   text: '🎉 太棒了！所有核心建议都已处理完毕。您可以点击右上角的“完成”按钮查看优化前后的对比。'
               };
               console.log('Adding done message:', doneMsg);
               setChatMessages(prev => [...prev, doneMsg]);
          }
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
    setSuggestions(prev => prev.map(s => s.id === suggestionId ? { ...s, status: 'ignored' } : s));
    
    setChatMessages(prev => prev.map(msg => 
        msg.suggestion?.id === suggestionId 
          ? { ...msg, suggestion: { ...msg.suggestion!, status: 'ignored' } } 
          : msg
    ));

    // AI Follow up with conversation instead of automatic suggestion
    setTimeout(() => {
        setChatMessages(prev => [...prev, {
            id: `ai-ignore-${Date.now()}`,
            role: 'model',
            text: '没问题，保留原样。我还有其他建议可以帮助您优化简历，您想继续讨论其他部分吗？'
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
        if (sanitized.id) delete sanitized.id;
        return sanitized;
      };
      
      const sanitizedResumeData = sanitizeData(resumeData);
      
      // 调用后端 PDF 导出接口
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'}/api/export-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          resumeData: sanitizedResumeData
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

  // --- Visual Viewport Logic ---
  useEffect(() => {
    const handleVisualViewportChange = () => {
      if (window.visualViewport) {
        // 计算键盘弹起带来的底部偏移
        const offset = window.innerHeight - window.visualViewport.height;
        setKeyboardOffset(offset);
        setViewportHeight(window.visualViewport.height);
      }
    };
    window.visualViewport?.addEventListener('resize', handleVisualViewportChange);
    window.visualViewport?.addEventListener('scroll', handleVisualViewportChange);
    return () => {
      window.visualViewport?.removeEventListener('resize', handleVisualViewportChange);
      window.visualViewport?.removeEventListener('scroll', handleVisualViewportChange);
    };
  }, []);

  // --- Chat Logic ---
  const scrollToBottom = () => {
    // 当消息更新或键盘高度变化时，强制置底
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ 
        behavior: keyboardOffset > 0 ? "auto" : "smooth", // 键盘弹出时立即跳转，不平滑滚动
        block: "end" 
      });
    }
  };

  useEffect(() => {
    if (currentStep === 'chat') {
      scrollToBottom();
    }
  }, [chatMessages, isSending, keyboardOffset]);

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

  // 当切换到聊天步骤时，先弹出整体总结，然后询问用户是否开始优化
  useEffect(() => {
    if (currentStep === 'chat' && suggestions.length > 0 && !chatInitialized) {
      // 标记聊天已初始化，避免重复运行
      setChatInitialized(true);
      
      // 获取用户名字
      const userName = resumeData?.personalInfo?.name || '您好';
      
      // 先显示问候和总结性消息
      setTimeout(() => {
        setChatMessages(prev => [...prev, {
          id: `ai-summary-${Date.now()}`,
          role: 'model',
          text: `${userName}，您好！根据分析，您的简历整体评分 ${score}/100 分，我为您准备了 ${suggestions.filter(s => s.status === 'pending').length} 条具体的优化建议。`
        }]);
        
        // 然后询问用户是否要开始优化
        setTimeout(() => {
          setChatMessages(prev => [...prev, {
            id: `ai-ask-${Date.now()}`,
            role: 'model',
            text: '您想要开始逐一优化这些问题吗？我会按照重要性顺序为您提供具体的修改建议，帮助您提升简历质量。'
          }]);
        }, 1500);
      }, 1000);
    }
  }, [currentStep, suggestions, score, resumeData]);

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
      
      // 检查是否需要生成新简历
      const lowerText = textToSend.toLowerCase();
      const shouldGenerateResume = lowerText.includes('生成简历') || lowerText.includes('创建简历') || lowerText.includes('完成优化') || lowerText.includes('最终简历');
      
      const apiEndpoint = shouldGenerateResume 
        ? `${import.meta.env.VITE_API_BASE_URL}/api/ai/generate-resume` 
        : `${import.meta.env.VITE_API_BASE_URL}/api/ai/chat`;
      
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          message: textToSend,
          resumeData: resumeData,
          chatHistory: chatMessages,
          score: score,
          suggestions: suggestions
        })
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Backend API success');
        
        if (shouldGenerateResume && result.resumeData) {
          // 清理生成的简历数据，确保不包含任何AI建议或标记
          const cleanedResumeData = {
            ...result.resumeData,
            // 确保所有必要字段都存在且格式正确
            personalInfo: result.resumeData.personalInfo || {},
            workExps: result.resumeData.workExps || [],
            educations: result.resumeData.educations || [],
            projects: result.resumeData.projects || [],
            skills: result.resumeData.skills || [],
            summary: result.resumeData.summary || ''
          };
          
          // 为工作经历、教育背景和项目添加ID字段（如果不存在）
          cleanedResumeData.workExps = cleanedResumeData.workExps.map((exp: any, index: number) => ({
            ...exp,
            id: exp.id || index + 1
          }));
          
          cleanedResumeData.educations = cleanedResumeData.educations.map((edu: any, index: number) => ({
            ...edu,
            id: edu.id || index + 1
          }));
          
          cleanedResumeData.projects = cleanedResumeData.projects.map((proj: any, index: number) => ({
            ...proj,
            id: proj.id || index + 1
          }));
          
          // 更新简历数据为AI生成的版本
          if (setResumeData) {
            setResumeData(prev => ({
              ...prev,
              ...cleanedResumeData
            }));
          }
          
          // 显示生成成功消息
          const aiMessage: ChatMessage = {
            id: `ai-${Date.now()}`,
            role: 'model',
            text: '✅ 已根据我们的对话内容生成了一份完整的优化简历。您可以点击右上角的"完成优化"按钮查看最终结果并导出PDF。'
          };
          setChatMessages(prev => [...prev, aiMessage]);
        } else {
          // 普通聊天响应
          const aiMessage: ChatMessage = {
            id: `ai-${Date.now()}`,
            role: 'model',
            text: result.response || '感谢您的咨询，我会继续为您提供优化建议。'
          };
          setChatMessages(prev => [...prev, aiMessage]);
        }
      } else {
        throw new Error('Backend API failed');
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

  // ================= RENDER STEPS =================
  if (currentStep === 'resume_select') {
    return (
      <div className="flex flex-col min-h-screen bg-background-light dark:bg-background-dark animate-in fade-in duration-300">
        <header className="sticky top-0 z-50 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md border-b border-gray-200 dark:border-white/5">
            <div className="flex items-center justify-center h-14 px-4 relative">
            <h1 className="text-lg font-bold tracking-tight">AI 智能诊断</h1>
            </div>
        </header>
        <main className="p-4">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">第一步：选择简历</h2>
            <div className="grid gap-4">
                {(allResumes || []).map((resume) => (
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
                        <span className="material-symbols-outlined text-primary">arrow_forward_ios</span>
                    </div>
                ))}
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
                ></textarea>
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
                <div className={`text-7xl font-black tracking-tight mb-2 transition-all duration-500 ${getScoreColor(score)}`}>
                    {score}
                    <span className="text-2xl text-slate-400 font-normal ml-1">/100</span>
                </div>
                <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed px-2">
                    {report?.summary}
                </p>
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
                </div>
            )}
        </div>

        {/* Detailed Analysis */}
        {report && (
            <div className="grid gap-4 mb-8">
                <div className="bg-green-50 dark:bg-green-900/10 rounded-xl p-4 border border-green-100 dark:border-green-900/30">
                    <h4 className="flex items-center gap-2 font-bold text-green-800 dark:text-green-400 mb-2">
                        <span className="material-symbols-outlined text-lg">thumb_up</span> 优势亮点
                    </h4>
                    <ul className="list-disc list-inside text-sm text-green-700 dark:text-green-300/80 space-y-1">
                        {report.strengths.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                </div>
                
                {hasJdInput() && report.missingKeywords.length > 0 && (
                    <div className="bg-orange-50 dark:bg-orange-900/10 rounded-xl p-4 border border-orange-100 dark:border-orange-900/30">
                        <h4 className="flex items-center gap-2 font-bold text-orange-800 dark:text-orange-400 mb-2">
                            <span className="material-symbols-outlined text-lg">warning</span> 缺失关键词
                        </h4>
                        <div className="flex flex-wrap gap-2">
                            {report.missingKeywords.map((k, i) => (
                                <span key={i} className="px-2 py-1 bg-white dark:bg-orange-900/40 rounded text-xs font-medium text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800">
                                    {k}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        )}

        <div className="text-center py-8">
            <span className="material-symbols-outlined text-5xl text-primary/30 mb-2">chat_spark</span>
            <p className="text-slate-500 dark:text-slate-400 text-sm max-w-[200px] mx-auto">
                AI 顾问已准备好为您提供具体的修改建议。
            </p>
        </div>

        {/* Prominent Chat Entry Button - Moved to end of report content */}
        <div className="px-4 pb-32">
            <button 
              onClick={() => setCurrentStep('chat')}
              className="w-full flex items-center justify-between px-6 py-4 bg-gradient-to-r from-primary to-blue-600 text-white rounded-2xl shadow-xl shadow-blue-500/20 active:scale-[0.98] transition-all group"
            >
                <div className="flex items-center gap-4">
                    <div className="relative size-12 rounded-full overflow-hidden border-2 border-white/30 bg-white">
                      <img src="https://api.dicebear.com/9.x/avataaars/svg?seed=Felix" alt="AI Headhunter" className="w-full h-full object-cover" />
                      <span className="absolute bottom-0 right-0 size-3 bg-green-500 rounded-full border-2 border-white"></span>
                    </div>
                    <div className="text-left">
                        <p className="text-base font-bold flex items-center gap-1">
                            咨询 AI 猎头顾问
                        </p>
                        <p className="text-xs text-blue-100">开始逐一优化简历问题...</p>
                    </div>
                </div>
                <div className="size-10 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition-colors">
                    <span className="material-symbols-outlined">arrow_forward</span>
                </div>
            </button>
        </div>
      </main>
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
                        <h3 className="font-bold text-slate-900 dark:text-white leading-tight">AI 猎头顾问</h3>
                        <div className="flex items-center gap-1.5">
                            <span className="size-1.5 rounded-full bg-green-500 animate-pulse"></span>
                            <span className="text-xs text-slate-500 dark:text-slate-400">在线</span>
                        </div>
                    </div>
                </div>
                <button 
                    onClick={async () => {
                        // 首先生成最终简历
                        await handleSendMessage('生成最终优化简历');
                        // 延迟切换到对比页面，确保生成完成
                        setTimeout(() => {
                            setCurrentStep('comparison');
                        }, 2000);
                    }}
                    className="text-sm font-bold text-primary hover:text-blue-600 px-3 py-1.5 bg-primary/10 rounded-lg"
                >
                    完成优化
                </button>
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
                        <div className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                            msg.role === 'user' 
                                ? 'bg-primary text-white rounded-br-none' 
                                : 'bg-slate-100 dark:bg-[#1c2936] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-white/5 rounded-bl-none'
                        }`}>
                            {/* 普通消息显示，移除建议弹窗 */}
                            <div>{msg.text}</div>
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

      {/* Input Area - Fixed at bottom */}
      <div 
        className="fixed left-0 right-0 z-[110] px-4 py-2 bg-slate-50 dark:bg-[#1c2936] border-t border-slate-200 dark:border-white/5"
        style={{ 
          bottom: `${keyboardOffset}px`, // 动态贴合键盘顶部
          paddingBottom: keyboardOffset > 0 ? '8px' : 'max(1.5rem, env(safe-area-inset-bottom))',
          transition: 'bottom 0.1s ease-out' // 增加微小过渡，防止抖动
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

  // 6. Comparison & Export
  if (currentStep === 'comparison') {
    return (
        <div className="flex flex-col min-h-screen bg-background-light dark:bg-background-dark animate-in fade-in duration-300">
            <header className="sticky top-0 z-50 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md border-b border-gray-200 dark:border-white/5">
                <div className="flex items-center justify-between h-14 px-4 relative">
                    <button onClick={() => setCurrentStep('chat')} className="p-2 -ml-2 rounded-full hover:bg-slate-200 dark:hover:bg-white/10 text-slate-900 dark:text-white">
                        <span className="material-symbols-outlined">arrow_back</span>
                    </button>
                    <h1 className="text-lg font-bold tracking-tight">优化结果对比</h1>
                    <div className="w-8"></div>
                </div>
            </header>

            <main className="flex-1 p-4 pb-60 overflow-y-auto">
                <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-slate-200 dark:bg-slate-700/50 rounded-lg p-3 text-center">
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">原始评分</p>
                        <p className="text-2xl font-bold text-slate-700 dark:text-slate-300">{originalScore}</p>
                    </div>
                    <div className="bg-green-100 dark:bg-green-900/30 rounded-lg p-3 text-center border border-green-200 dark:border-green-800">
                        <p className="text-xs text-green-600 dark:text-green-400 mb-1">优化后评分</p>
                        <p className="text-2xl font-bold text-green-600 dark:text-green-400">{score}</p>
                    </div>
                </div>

                <div className="space-y-6">
                    {/* Diff Items based on suggestions taken */}
                    {suggestions.filter(s => s.status === 'accepted').map((change, idx) => (
                        <div key={idx} className="bg-white dark:bg-surface-dark rounded-xl border border-gray-200 dark:border-white/5 overflow-hidden">
                             <div className="px-4 py-2 bg-slate-50 dark:bg-white/5 border-b border-gray-100 dark:border-white/5 flex justify-between items-center">
                                 <span className="text-xs font-bold text-slate-500 uppercase">{change.title}</span>
                                 <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">已优化</span>
                             </div>
                             <div className="grid grid-cols-2 divide-x divide-gray-100 dark:divide-white/5">
                                 <div className="p-3">
                                     <p className="text-[10px] text-red-400 font-bold mb-1 uppercase">修改前</p>
                                     <p className="text-xs text-slate-500 line-through decoration-red-300/50">
                                         {change.originalValue || '(未填写)'}
                                     </p>
                                 </div>
                                 <div className="p-3 bg-green-50/30 dark:bg-green-900/10">
                                     <p className="text-[10px] text-green-500 font-bold mb-1 uppercase">修改后</p>
                                     <p className="text-xs text-slate-900 dark:text-white font-medium">
                                        {change.suggestedValue !== undefined && change.suggestedValue !== null ? (
                                            Array.isArray(change.suggestedValue) 
                                                ? change.suggestedValue.join(', ') 
                                                : change.suggestedValue
                                        ) : (
                                            '(未填写)'
                                        )}
                                     </p>
                                 </div>
                             </div>
                        </div>
                    ))}
                    
                    {suggestions.filter(s => s.status === 'accepted').length === 0 && (
                        <div className="text-center py-10 text-slate-400">
                            <p>您没有采纳任何 AI 建议，内容未发生变更。</p>
                        </div>
                    )}
                </div>
            </main>

            <div className="fixed bottom-20 left-0 right-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-white dark:bg-[#101922] border-t border-slate-200 dark:border-white/5 z-[40]">
                <button 
                    onClick={handleExportPDF}
                    disabled={isExporting}
                    className="w-full flex items-center justify-center gap-2 h-14 bg-primary hover:bg-blue-600 active:bg-blue-700 text-white rounded-xl shadow-[0_0_20px_rgba(19,127,236,0.15)] transition-all transform active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
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
        </div>
    );
  }

  return null;
};

export default AiAnalysis;
