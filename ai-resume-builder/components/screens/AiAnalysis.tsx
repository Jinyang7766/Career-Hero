import React, { useState, useEffect, useRef } from 'react';
import { View, ScreenProps, ResumeSummary, ResumeData } from '../../types';
import { GoogleGenAI } from "@google/genai";
import { AIService } from '../../src/ai-service';

interface Suggestion {
  id: string;
  type: 'optimization' | 'grammar' | 'missing';
  title: string;
  reason: string;
  targetSection: 'personalInfo' | 'workExps' | 'skills';
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
  
  // Data State
  const [originalResumeData, setOriginalResumeData] = useState<ResumeData | null>(null);
  const [jdText, setJdText] = useState('');
  const [jdImage, setJdImage] = useState<string | null>(null);
  
  // Analysis Result State
  const [score, setScore] = useState(0);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  
  // Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Handlers ---

  const handleResumeSelect = (id: number) => {
    setSelectedResumeId(id);
    setCurrentStep('jd_input');
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setJdImage(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const startAnalysis = () => {
    // Snapshot original data for comparison later
    if (resumeData) {
        setOriginalResumeData(JSON.parse(JSON.stringify(resumeData)));
    }

    setCurrentStep('analyzing');
    
    // Simulate Analysis Delay & Logic
    setTimeout(() => {
      if (!resumeData) return;

      const hasJD = jdText.length > 0 || jdImage !== null;
      let calculatedScore = hasJD ? 62 : 70; 

      const newSuggestions: Suggestion[] = [];
      const newReport: AnalysisReport = {
        summary: hasJD 
          ? '您的简历与目标职位匹配度一般。虽然教育背景符合，但在具体项目经验和工具技能上与 JD 描述存在一定差距。'
          : '您的简历整体结构清晰，但在工作经历的量化描述上略显不足。',
        strengths: ['教育背景优异', '工作年限符合要求'],
        weaknesses: ['项目描述缺乏数据支撑', '部分核心技能未提及'],
        missingKeywords: [],
        scoreBreakdown: {
            experience: hasJD ? 60 : 70,
            skills: hasJD ? 55 : 80,
            format: 95
        }
      };

      // 1. Logic based on JD (Simulated)
      if (hasJD) {
        newReport.missingKeywords = ['A/B Testing', 'User Research', 'Agile'];
        
        newSuggestions.push({
          id: 'jd-keyword-1',
          type: 'missing',
          title: '技能关键词补充',
          reason: '目标职位多次提到 "A/B Testing" 和 "User Research"，AI 建议将这些高频词加入您的技能列表。',
          targetSection: 'skills',
          suggestedValue: [...resumeData.skills, 'A/B Testing', 'User Research'],
          status: 'pending'
        });
        
        calculatedScore += 5; 
      }

      // 2. Generic Logic (Existing)
      if (resumeData.personalInfo.title && !resumeData.personalInfo.title.includes('资深') && !resumeData.personalInfo.title.includes('Senior')) {
        newSuggestions.push({
          id: 'opt-title',
          type: 'optimization',
          title: '职位头衔优化',
          reason: '添加级别描述（如“资深”、“高级”）可以让招聘者更快了解您的经验水平。',
          targetSection: 'personalInfo',
          targetField: 'title',
          originalValue: resumeData.personalInfo.title,
          suggestedValue: `资深${resumeData.personalInfo.title}`,
          status: 'pending'
        });
      }

      resumeData.workExps.forEach(exp => {
        if (!exp.description || exp.description.length < 20) {
          newSuggestions.push({
            id: `miss-exp-${exp.id}`,
            type: 'missing',
            title: '工作经历描述扩充',
            reason: `"${exp.title}" 的经历描述过于简单。AI 根据 STAR 法则为您生成了优化版本。`,
            targetSection: 'workExps',
            targetId: exp.id,
            targetField: 'description',
            originalValue: exp.description,
            suggestedValue: '负责主导核心产品的用户界面设计与交互体验优化，通过用户研究和数据分析，提升了产品易用性，使转化率提升了 15%。协同开发团队建立设计规范系统，提高了 30% 的团队协作效率。',
            status: 'pending'
          });
        }
      });

      setScore(calculatedScore);
      setSuggestions(newSuggestions);
      setReport(newReport);
      
      // Init Chat with specific logic
      // We don't dump all suggestions at once, the user guides the flow.
      setChatMessages([{ 
        id: 'init-1',
        role: 'model', 
        text: '您好，我是您的专属 AI 猎头顾问。分析报告已生成。我发现您的简历有几个关键点可以优化，这能显著提升通过率。我们要现在开始逐一修改吗？' 
      }]);

      setCurrentStep('report');
    }, 2000);
  };

  const updateScore = (points: number) => {
    setScore(prev => Math.min(prev + points, 100));
  };

  const handleAcceptSuggestionInChat = (suggestion: Suggestion) => {
    if (!setResumeData || !resumeData) return;

    // Apply data change
    setResumeData(prev => {
        const newData = { ...prev };
        if (suggestion.targetSection === 'personalInfo') {
            newData.personalInfo = { ...newData.personalInfo, [suggestion.targetField!]: suggestion.suggestedValue };
        } else if (suggestion.targetSection === 'workExps') {
            newData.workExps = newData.workExps.map(item => item.id === suggestion.targetId ? { ...item, [suggestion.targetField!]: suggestion.suggestedValue } : item);
        } else if (suggestion.targetSection === 'skills') {
            newData.skills = suggestion.suggestedValue;
        }
        return newData;
    });

    // Update suggestions state
    setSuggestions(prev => prev.map(s => s.id === suggestion.id ? { ...s, status: 'accepted' } : s));
    
    // Update chat message to show accepted state
    setChatMessages(prev => prev.map(msg => 
      msg.suggestion?.id === suggestion.id 
        ? { ...msg, suggestion: { ...msg.suggestion!, status: 'accepted' } } 
        : msg
    ));

    updateScore(5);

    // AI Follow up automatically after acceptance
    setTimeout(() => {
        const remaining = suggestions.filter(s => s.id !== suggestion.id && s.status === 'pending');
        if (remaining.length > 0) {
            const nextSug = remaining[0];
            const nextMsg: ChatMessage = {
                id: `ai-sug-${nextSug.id}`,
                role: 'model',
                text: '好的，已更新！接下来，我建议优化这个部分：',
                suggestion: nextSug
            };
            setChatMessages(prev => [...prev, nextMsg]);
        } else {
             setChatMessages(prev => [...prev, {
                 id: 'ai-done',
                 role: 'model',
                 text: '太棒了！所有核心建议都已处理完毕。您可以点击右上角的“完成”按钮查看优化前后的对比。'
             }]);
        }
    }, 800);
  };

  const handleIgnoreSuggestionInChat = (suggestionId: string) => {
    setSuggestions(prev => prev.map(s => s.id === suggestionId ? { ...s, status: 'ignored' } : s));
    
    setChatMessages(prev => prev.map(msg => 
        msg.suggestion?.id === suggestionId 
          ? { ...msg, suggestion: { ...msg.suggestion!, status: 'ignored' } } 
          : msg
    ));

    // AI Follow up
    setTimeout(() => {
        setChatMessages(prev => [...prev, {
            id: `ai-ignore-${Date.now()}`,
            role: 'model',
            text: '没问题，保留原样。我们看下一个建议？'
        }]);
        
        // Push next suggestion if available
        const remaining = suggestions.filter(s => s.id !== suggestionId && s.status === 'pending');
        if (remaining.length > 0) {
             // ... logic to push next suggestion similar to accept ...
             // For simplicity in this demo, user can ask "Next" or we push it.
             const nextSug = remaining[0];
             setChatMessages(prev => [...prev, {
                 id: `ai-sug-${nextSug.id}`,
                 role: 'model',
                 text: '这是下一个优化点：',
                 suggestion: nextSug
             }]);
        }
    }, 600);
  };

  const handleExportPDF = () => {
    setIsExporting(true);
    setTimeout(() => {
        setIsExporting(false);
        alert("优化后的简历 PDF 已下载！");
    }, 2000);
  };

  const hasJdInput = () => jdText.length > 0 || jdImage !== null;

  // --- Chat Logic ---

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (currentStep === 'chat') {
      scrollToBottom();
    }
  }, [chatMessages, currentStep]);

  const handleSendMessage = async (textOverride?: string) => {
    const textToSend = textOverride || inputMessage;
    if (!textToSend.trim()) return;

    setChatMessages(prev => [...prev, { id: `user-${Date.now()}`, role: 'user', text: textToSend }]);
    setInputMessage('');
    setIsSending(true);

    let aiText = "";

    try {
      // 优先尝试使用Serverless API
      console.log('Trying Serverless API first...');
      const serverlessResult = await AIService.sendMessage(textToSend, resumeData, score, suggestions);
      
      if (serverlessResult.success) {
        console.log('Serverless API success');
        setChatMessages(prev => [...prev, { id: `ai-${Date.now()}`, role: 'model', text: serverlessResult.text }]);
        setIsSending(false);
        return;
      } else {
        console.log('Serverless API failed, falling back to direct Gemini API:', serverlessResult.error);
      }

      // Fallback to direct Gemini API
      console.log('Using direct Gemini API as fallback...');
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      
      // 安全检查：确保API Key存在且有效
      if (!apiKey) {
        console.log('No API key found, using mock responses');
        await new Promise(r => setTimeout(r, 1000));
        
        // Mock Interaction logic with professional recruitment strategies
        if (textToSend.includes('开始') || textToSend.includes('优化')) {
            const firstPending = suggestions.find(s => s.status === 'pending');
            if (firstPending) {
                // Instead of text, we return a message attached with a suggestion object
                setChatMessages(prev => [...prev, {
                    id: `ai-sug-${firstPending.id}`,
                    role: 'model',
                    text: '好的，我们先解决这个问题：',
                    suggestion: firstPending
                }]);
                setIsSending(false);
                return;
            }
            aiText = `✨ **优化建议**
1. 📊 **量化数据**：将"负责销售"改为"月均销售额提升20%"。
2. 🔑 **关键词**：补充JD中的核心技能词。

要为您生成改写示例吗？`;
        } else {
            aiText = `💡 **专业建议**
1. 🎯 **聚焦重点**：删除与目标职位无关的兼职经历。
2. 📝 **排版优化**：技能部分建议使用列表展示。

您想看修改后的预览吗？`;
        }
      } else {
        // API Key exists, proceed with API calls
        console.log('API Key configured:', !!apiKey);
        
        // 验证API密钥格式
        if (!apiKey.startsWith('AIza')) {
          console.error('Invalid API key format. Gemini API keys should start with "AIza"');
          throw new Error('API密钥格式无效，请检查您的Gemini API密钥');
        }
        
        console.log('Initializing Google GenAI...');
        const ai = new GoogleGenAI({ apiKey });
        
        const resumeDetails = `
Resume Details:
- Name: ${resumeData?.personalInfo.name || 'N/A'}
- Title: ${resumeData?.personalInfo.title || 'N/A'}
- Email: ${resumeData?.personalInfo.email || 'N/A'}
- Phone: ${resumeData?.personalInfo.phone || 'N/A'}
- Gender: ${resumeData?.gender || 'N/A'}
- Work Experience: ${resumeData?.workExps.length} positions
  ${resumeData?.workExps.map((exp, i) => `  ${i+1}. ${exp.title} at ${exp.subtitle} (${exp.date})`).join('\n')}
- Education: ${resumeData?.educations.length} degrees
  ${resumeData?.educations.map((edu, i) => `  ${i+1}. ${edu.title} at ${edu.subtitle} (${edu.date})`).join('\n')}
- Projects: ${resumeData?.projects.length} projects
  ${resumeData?.projects.map((proj, i) => `  ${i+1}. ${proj.title} (${proj.date})`).join('\n')}
- Skills: ${resumeData?.skills.join(', ') || 'None'}
- Current Score: ${score}/100
- Pending Suggestions: ${suggestions.filter(s => s.status === 'pending').map(s => s.title).join(', ')}
`;

        // 1. 定义极其严格的 Prompt
        const prompt = `你是一名专业简历顾问。
原则：字数严格控制在100字内。严禁废话。
格式：Markdown。
结构：
1. 简短结论
2. 两个具体优化点 (Emoji开头)
3. 一个引导性提问`;

        console.log('Sending request to Gemini API...');
        try {
          const response = await ai.models.generateContent({
               model: 'gemini-1.5-flash',
               contents: [{ role: 'user', parts: [{ text: prompt + `\n\n用户输入: ${textToSend}\n简历概要: ${resumeDetails}` }] }]
          });
          aiText = response.text || "";
          console.log('Gemini API response received');
        } catch (apiError) {
          console.error('Gemini API Error:', apiError);
          console.error('Error details:', {
            message: apiError.message,
            status: apiError.status,
            statusText: apiError.statusText,
            stack: apiError.stack
          });
          
          // If API fails, try fallback model
          if (apiError.message?.includes('403') || apiError.message?.includes('permission') || apiError.message?.includes('model') || apiError.message?.includes('not found')) {
            console.log('Trying fallback model: gemini-1.5-flash');
            try {
              const response = await ai.models.generateContent({
                   model: 'gemini-1.5-flash',
                   contents: [{ role: 'user', parts: [{ text: prompt }] }]
              });
              aiText = response.text || "";
              console.log('Gemini API response received with fallback model');
            } catch (fallbackError) {
              console.error('Fallback model also failed:', fallbackError);
              throw fallbackError;
            }
          } else {
            throw apiError;
          }
        }
      }

      setChatMessages(prev => [...prev, { id: `ai-${Date.now()}`, role: 'model', text: aiText }]);
    } catch (error) {
      console.error("Chat error:", error);
      console.error("Error details:", error.message);
      
      let errorMessage = `网络连接异常：${error.message || '请稍后再试。'}`;
      
      // Provide specific solutions for common errors
      if (error.message?.includes('404') || error.message?.includes('not found')) {
        errorMessage += `\n\n解决方案：\n1. 确认API密钥有效且未过期\n2. 检查Google AI Studio中的项目状态\n3. 验证API密钥有生成内容权限\n4. 尝试重新生成API密钥`;
      } else if (error.message?.includes('403') || error.message?.includes('permission')) {
        errorMessage += `\n\n解决方案：\n1. 检查API密钥是否有生成内容权限\n2. 访问 Google AI Studio 重新配置权限\n3. 确认API密钥未过期`;
      } else if (error.message?.includes('network') || error.message?.includes('fetch')) {
        errorMessage += `\n\n解决方案：\n1. 检查网络连接\n2. 确认防火墙允许访问 Google API\n3. 尝试使用 VPN 或切换网络`;
      }
      
      setChatMessages(prev => [...prev, { 
        id: `err-${Date.now()}`, 
        role: 'model', 
        text: errorMessage
      }]);
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
                
                <div className="mt-4 flex items-center gap-3">
                    <div className="h-px bg-slate-200 dark:bg-white/10 flex-1"></div>
                    <span className="text-xs text-slate-400">或</span>
                    <div className="h-px bg-slate-200 dark:bg-white/10 flex-1"></div>
                </div>

                <div className="mt-4">
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        accept="image/*" 
                        onChange={handleImageUpload} 
                    />
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full py-3 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-primary hover:bg-primary/5 dark:hover:bg-primary/10 transition-colors flex flex-col items-center justify-center gap-1 text-slate-500 dark:text-slate-400"
                    >
                        {jdImage ? (
                            <div className="relative w-full h-32 px-4">
                                <img src={jdImage} alt="JD Preview" className="w-full h-full object-contain rounded-lg" />
                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-lg opacity-0 hover:opacity-100 transition-opacity">
                                    <span className="text-white text-xs font-bold">更换图片</span>
                                </div>
                            </div>
                        ) : (
                            <>
                                <span className="material-symbols-outlined text-2xl">add_a_photo</span>
                                <span className="text-xs font-medium">上传 JD 截图</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            <button 
                onClick={startAnalysis}
                disabled={!jdText && !jdImage}
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
      <div className="fixed inset-0 z-[100] bg-white flex flex-col animate-in slide-in-from-right duration-300">
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
                onClick={() => setCurrentStep('comparison')}
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
                                : 'bg-white dark:bg-[#1c2936] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-white/5 rounded-bl-none'
                        }`}>
                            {msg.text}
                        </div>
                    </div>

                    {/* Interactive Suggestion Card */}
                    {msg.role === 'model' && msg.suggestion && (
                        <div className="mt-2 ml-10 max-w-[90%] w-full bg-white dark:bg-[#1c2936] rounded-xl border border-blue-100 dark:border-blue-900/30 overflow-hidden shadow-sm animate-in zoom-in-95 duration-300">
                             <div className="p-3 bg-blue-50/50 dark:bg-blue-900/10 border-b border-blue-100 dark:border-blue-900/30 flex justify-between items-center">
                                 <span className="text-xs font-bold text-primary uppercase tracking-wide flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[16px]">auto_fix_high</span>
                                    优化建议
                                 </span>
                                 {msg.suggestion.status === 'accepted' && <span className="text-xs font-bold text-green-600 flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">check_circle</span> 已采纳</span>}
                                 {msg.suggestion.status === 'ignored' && <span className="text-xs font-bold text-slate-400">已忽略</span>}
                             </div>
                             <div className="p-4">
                                 <h4 className="font-bold text-slate-900 dark:text-white mb-1">{msg.suggestion.title}</h4>
                                 <div className="text-xs text-slate-500 dark:text-slate-400 mb-3">{msg.suggestion.reason}</div>
                                 
                                 <div className="bg-slate-50 dark:bg-black/20 rounded p-3 text-sm mb-4">
                                     <div className="mb-2 pb-2 border-b border-slate-200 dark:border-white/5">
                                         <span className="text-xs text-red-400 font-bold uppercase block mb-1">原内容:</span>
                                         <span className="text-slate-500 dark:text-slate-400 line-through">{msg.suggestion.originalValue || '(空)'}</span>
                                     </div>
                                     <div>
                                         <span className="text-xs text-green-500 font-bold uppercase block mb-1">建议修改:</span>
                                         <span className="text-slate-900 dark:text-white font-medium">
                                             {Array.isArray(msg.suggestion.suggestedValue) 
                                                ? msg.suggestion.suggestedValue.join(', ') 
                                                : msg.suggestion.suggestedValue}
                                         </span>
                                     </div>
                                 </div>

                                 <div className="flex gap-2">
                                   <button 
                                       onClick={() => handleIgnoreSuggestionInChat(msg.suggestion!)}
                                       className="flex-1 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-xs font-bold hover:bg-slate-50 transition-colors"
                                   >
                                       保持原样
                                   </button>
                                   <button 
                                          onClick={() => handleAcceptSuggestionInChat(msg.suggestion!)}
                                          className="flex-1 py-2 rounded-lg bg-primary text-white text-xs font-bold hover:bg-blue-600 transition-colors shadow-sm"
                                       >
                                           立即修改
                                       </button>
                                   </div>
                              </div>
                      </div>
                  )}
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
      <div className="fixed bottom-0 left-0 right-0 z-[110] bg-white dark:bg-[#1c2936] border-t border-slate-200 dark:border-white/5 pb-safe">
          
          {/* Prompt Starters - Inside input container */}
          {!isSending && chatMessages.length < 3 && (
              <div className="absolute top-0 left-0 right-0 -translate-y-full pointer-events-none">
                  <div className="flex gap-2 px-4 py-3 overflow-x-auto no-scrollbar pointer-events-auto bg-gradient-to-t from-slate-50/90 to-transparent dark:from-[#0b1219]/90">
                      <button 
                          onClick={() => handleSendMessage('请开始帮我优化简历')} 
                          className="whitespace-nowrap px-4 py-1.5 rounded-full bg-white dark:bg-[#1c2936] border border-primary/20 text-xs font-bold text-primary shadow-lg shadow-blue-500/10 hover:bg-blue-50 transition-all active:scale-95"
                      >
                          ✨ 开始优化
                      </button>
                      <button 
                          onClick={() => handleSendMessage('这个 JD 看重什么能力？')} 
                          className="whitespace-nowrap px-4 py-1.5 rounded-full bg-white dark:bg-[#1c2936] border border-primary/20 text-xs font-bold text-primary shadow-lg shadow-blue-500/10 hover:bg-blue-50 transition-all active:scale-95"
                      >
                          📄 JD 解读
                      </button>
                  </div>
              </div>
          )}

          {/* Input controls */}
          <div className="p-4 bg-white dark:bg-[#1c2936]">
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
                      className="flex-1 bg-slate-100 dark:bg-[#111a22] border-0 rounded-2xl px-4 py-3 text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-primary outline-none transition-all resize-none"
                      rows={1}
                      style={{ minHeight: '48px', maxHeight: '120px' }}
                  />
                  <button 
                      onClick={() => handleSendMessage()}
                      disabled={!inputMessage.trim() || isSending}
                      className="size-12 rounded-full bg-primary text-white flex items-center justify-center hover:bg-blue-600 disabled:opacity-50 transition-all shadow-md shrink-0 mb-0.5"
                  >
                      <span className="material-symbols-outlined text-[20px]">send</span>
                  </button>
              </div>
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

            <main className="flex-1 p-4 pb-24 overflow-y-auto">
                <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-slate-200 dark:bg-slate-700/50 rounded-lg p-3 text-center">
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">原始评分</p>
                        <p className="text-2xl font-bold text-slate-700 dark:text-slate-300">65</p>
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
                                        {Array.isArray(change.suggestedValue) 
                                            ? change.suggestedValue.join(', ') 
                                            : change.suggestedValue}
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

            <div className="fixed bottom-0 left-0 right-0 p-4 bg-white dark:bg-[#101922] border-t border-slate-200 dark:border-white/5 z-50">
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