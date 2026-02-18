import React, { useState, useEffect } from 'react';
import { ScreenProps, View } from '../../types';
import { useUserProfile } from '../../src/useUserProfile';
import { DatabaseService } from '../../src/database-service';
import { supabase } from '../../src/supabase-client';
import { useAppContext } from '../../src/app-context';
import { useAppStore } from '../../src/app-store';

const CAREER_TIPS = [
  "简历中的数字比形容词更有说服力，量化成果是金标准。",
  "针对不同 JD 调整简历关键词，提高 Boss 直聘等平台的匹配度。",
  "保持简历简洁，重点突出最近三年的核心项目经历。",
  "使用强有力的动词开头，直接描述你解决的问题和达成的结果。",
  "检查拼写和排版错误是发布前的底线，细节决定第一印象。",
  "在简历中展现软技能，如跨部门协作能力和抗压能力。",
  "量化你的贡献：如'节省了30%成本'或'提前2周完成交付'。",
  "重视个人核心优势（Summary），在三秒内抓住 HR 的眼球。",
  "面试结束后可以适度跟进进度，展现你对岗位的积极态度。",
  "在行业垂直社群保持活跃，内推成功率远高于盲投。",
  "不要只列工作职责，要突出你在这个岗位上的'独特性'。",
  "每一段快手、腾讯等大厂或核心项目经历应复盘两个亮点案例。",
  "简历排版建议使用模块化设计，清晰的视觉层级更易阅读。",
  "准备 3-5 个 STAR 原则案例，应对 Boss 或 HR 的行为面试。",
  "面试前搜集职友集、脉脉等薪资报告，为谈薪做好准备。",
  "持续关注行业前沿技术（如 AI 工具），保持职场不可替代性。",
  "模拟面试能帮你发现口头的赘余词，提升表达的专业感。",
  "简历文件命名建议：姓名-目标岗位-工作年限-手机号。",
  "自我介绍应重点突出'我能为公司解决什么实际问题'。",
  "关注公司企业文化，面试时的价值观契合也是考核重点。",
  "利用脉脉等职场平台了解目标公司的真实工作氛围和风评。",
  "在简历中展示你从 0 到 1 或从 1 到 N 的解决问题闭环思维。",
  "面试遇阻时保持职业风度，职场圈子很小，口碑积累很重要。",
  "突出你对目标业务的深度理解，而不仅仅是堆砌技术栈。",
  "定期更新简历，即便不跳槽也能帮助你了解市场行情。",
  "个人评价拒绝空洞词汇，用'具体战绩'支撑你的专业定位。",
  "求职季保持简历状态“活跃”，能系统触发更多 HR 推荐。",
  "合理展示你的开源贡献、技术博客或含金量高的行业证书。",
  "在简历中体现你的学习迁移能力，证明你能快速切入新赛道。",
  "面试后的复盘比面试本身更重要，及时记录并优化你的回答逻辑。",
];

const Dashboard: React.FC<ScreenProps & { createNewResume?: () => void }> = ({ createNewResume }) => {
  const currentUser = useAppContext((s) => s.currentUser);
  const navigateToView = useAppContext((s) => s.navigateToView);
  const allResumes = useAppStore((state) => state.allResumes);
  const setResumeData = useAppStore((state) => state.setResumeData);
  const [greeting, setGreeting] = useState('');
  const [dailyTip, setDailyTip] = useState('');

  // Get user profile with real name
  const { userProfile } = useUserProfile();
  const displayName =
    userProfile?.name ||
    currentUser?.user_metadata?.name ||
    currentUser?.email?.split('@')[0] ||
    '';

  // Get greeting based on Beijing timezone
  const getBeijingGreeting = () => {
    const now = new Date();
    // Convert to Beijing timezone (UTC+8)
    const beijingTime = new Date(now.getTime() + (8 * 60 * 60 * 1000) + (now.getTimezoneOffset() * 60 * 1000));
    const hour = beijingTime.getHours();

    if (hour >= 5 && hour < 11) {
      return '早上好';
    } else if (hour >= 11 && hour < 13) {
      return '中午好';
    } else if (hour >= 13 && hour < 18) {
      return '下午好';
    } else if (hour >= 18 && hour < 23) {
      return '晚上好';
    } else {
      return '夜深了';
    }
  };

  // Update greeting every minute and set daily tip
  useEffect(() => {
    const updateGreeting = () => {
      setGreeting(getBeijingGreeting());
    };

    // Set daily tip (fixed per calendar day in Beijing time)
    const setDeterministicDailyTip = () => {
      // Calculate Beijing current date string (YYYY-MM-DD)
      const now = new Date();
      const beijingTime = new Date(now.getTime() + (8 * 60 * 60 * 1000) + (now.getTimezoneOffset() * 60 * 1000));
      const year = beijingTime.getFullYear();
      const month = String(beijingTime.getMonth() + 1).padStart(2, '0');
      const day = String(beijingTime.getDate()).padStart(2, '0');
      const dateString = `${year}-${month}-${day}`;

      // Create a simple hash/seed from date string to get consistent index
      let hash = 0;
      for (let i = 0; i < dateString.length; i++) {
        hash = ((hash << 5) - hash) + dateString.charCodeAt(i);
        hash |= 0; // Convert to 32bit integer
      }

      const index = Math.abs(hash) % CAREER_TIPS.length;
      setDailyTip(CAREER_TIPS[index]);
    };

    updateGreeting();
    setDeterministicDailyTip();

    const interval = setInterval(() => {
      updateGreeting();
      // Check for day change every minute to refresh at midnight
      setDeterministicDailyTip();
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, []);

  const stats = React.useMemo(() => {
    if (!allResumes) return { total: 0, optimized: 0 };
    return {
      total: allResumes.length,
      optimized: allResumes.filter(r => r.optimizationStatus === 'optimized').length
    };
  }, [allResumes]);

  const recentResumes = React.useMemo(() => {
    if (!allResumes) return [];
    // Sort by date descending and take top 3
    return [...allResumes]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 3);
  }, [allResumes]);

  const [isLoadingResume, setIsLoadingResume] = React.useState<number | null>(null);

  const handleResumeClick = async (resumeId: number) => {
    if (isLoadingResume) return;

    try {
      setIsLoadingResume(resumeId);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsLoadingResume(null);
        return;
      }

      const result = await DatabaseService.getResume(resumeId);
      if (result.success && result.data) {
        const fullResume = result.data;
        if (fullResume && fullResume.resume_data) {
          if (setResumeData) {
            // Ensure all required fields exist by merging with defaults
            const defaultData = {
              personalInfo: { name: '', title: '', email: '', phone: '', age: '' },
              workExps: [],
              educations: [],
              projects: [],
              skills: [],
              gender: '',
            };

            setResumeData({
              ...defaultData,
              ...fullResume.resume_data,
              id: fullResume.id,
              resumeTitle: fullResume.title,
              personalInfo: {
                ...defaultData.personalInfo,
                ...(fullResume.resume_data?.personalInfo || {})
              }
            });
          }
          navigateToView(View.PREVIEW);
        } else {
          console.error('Resume data is empty');
          alert('简历数据为空');
        }
      } else {
        console.error('Failed to load resume:', result.error);
        alert('加载简历失败');
      }
    } catch (err) {
      console.error('Failed to load recent resume for preview:', err);
      alert('加载简历出错，请检查网络');
    } finally {
      setIsLoadingResume(null);
    }
  };

  return (
    <div className="flex flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))] animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between p-4 sticky top-0 z-30 bg-background-light/90 dark:bg-background-dark/90 backdrop-blur-md border-b border-transparent dark:border-white/5">
        <div className="flex flex-col">
          <h2 className="text-xl font-bold leading-tight text-gray-900 dark:text-white">
            {greeting}{displayName ? `，${displayName}` : ''}
          </h2>
          <p className="text-sm text-slate-600 dark:text-gray-400 mt-1">
            {new Date().toLocaleDateString('zh-CN', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </p>
        </div>
      </div>

      <div className="px-4 space-y-6 pt-2">

        {/* Stats Overview */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white dark:bg-surface-dark rounded-xl p-4 shadow-md border border-slate-200 dark:border-white/5 relative">
            <p className="text-sm text-slate-600 dark:text-slate-400 font-bold">简历总数</p>
            <p className="text-3xl font-black text-slate-900 dark:text-white mt-1">{stats.total}</p>
          </div>
          <div className="bg-white dark:bg-surface-dark rounded-xl p-4 shadow-md border border-slate-200 dark:border-white/5 relative">
            <p className="text-sm text-slate-600 dark:text-slate-400 font-bold">已分析</p>
            <p className="text-3xl font-black text-primary dark:text-primary mt-1">{stats.optimized}</p>
          </div>
        </div>

        {/* Quick Actions - Reverted to Vibrant Style */}
        <div>
          <div
            onClick={createNewResume}
            className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-blue-600 to-indigo-700 p-6 shadow-xl shadow-primary/30 text-white cursor-pointer active:scale-[0.98] transition-all min-h-[160px] flex flex-col justify-center"
          >
            <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-3xl animate-pulse"></div>
            <div className="absolute -left-16 -bottom-16 h-64 w-64 rounded-full bg-white/10 blur-3xl"></div>
            <div className="relative z-10 flex flex-col items-start gap-4">
              <div className="flex items-center justify-center h-12 w-12 rounded-2xl bg-white/20 backdrop-blur-md shadow-inner border border-white/20">
                <span className="material-symbols-outlined text-white" style={{ fontSize: '28px' }}>add</span>
              </div>
              <div>
                <div className="flex items-center gap-3 mb-1.5">
                  <h3 className="text-xl font-black text-white tracking-tight">新建简历</h3>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-white text-primary uppercase tracking-[0.1em] shadow-sm">AI 智能向导</span>
                </div>
                <p className="text-blue-100 text-sm font-medium opacity-90 max-w-[85%] leading-relaxed">
                  通过智能 AI 向导，轻松定制专属于你的高光简历，几步操作即可开启职场新篇章。
                </p>
              </div>

              <div className="mt-1 flex items-center gap-3 rounded-xl bg-white px-5 py-2.5 text-sm font-black text-primary shadow-lg hover:bg-blue-50 transition-all hover:gap-4 group-hover:shadow-white/20">
                <span>立即开始</span>
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Resumes */}
        {recentResumes.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                最近编辑
              </h3>
              <button
                onClick={() => navigateToView(View.ALL_RESUMES)}
                className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-0.5 hover:text-slate-700 dark:hover:text-slate-200"
              >
                全部
                <span className="material-symbols-outlined text-[14px]">chevron_right</span>
              </button>
            </div>

            <div className="bg-white dark:bg-surface-dark rounded-2xl overflow-hidden shadow-md border border-slate-200 dark:border-white/5 divide-y divide-slate-100 dark:divide-white/5 flex flex-col">
              {recentResumes.map(resume => (
                <div
                  key={resume.id}
                  onClick={() => handleResumeClick(resume.id)}
                  className={`group relative flex items-center gap-4 px-4 py-3.5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors cursor-pointer ${isLoadingResume === resume.id ? 'opacity-50 pointer-events-none' : ''}`}
                >
                  <div className="shrink-0 relative">
                    <div className="bg-white dark:bg-slate-700 aspect-[210/297] w-10 h-[56px] rounded-lg shadow-sm border border-slate-200 dark:border-slate-600 overflow-hidden relative">
                      {resume.thumbnail}
                      {isLoadingResume === resume.id && (
                        <div className="absolute inset-0 bg-white/50 dark:bg-black/50 flex items-center justify-center z-10">
                          <span className="size-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin"></span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col flex-1 justify-center min-w-0">
                    <p className="text-slate-900 dark:text-white text-sm font-bold truncate leading-tight">{resume.title}</p>
                    <p className="text-slate-600 dark:text-slate-500 text-[12px] font-medium leading-normal line-clamp-1 mt-1">
                      上次修改: {new Date(resume.date).toLocaleString('zh-CN', { hour12: false })}
                    </p>
                  </div>
                  {typeof (resume.analysisScore ?? resume.score) === 'number' && (resume.analysisScore ?? resume.score) > 0 && (() => {
                    const scoreValue = Math.round(Number(resume.analysisScore ?? resume.score));
                    let colorClass = "bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20";
                    if (scoreValue >= 85) {
                      colorClass = "bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20";
                    } else if (scoreValue >= 70) {
                      colorClass = "bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20";
                    }

                    return (
                      <div className={`flex flex-col items-center px-2 py-0.5 rounded-lg border ${colorClass} transition-all`}>
                        <span className="text-[14px] font-black leading-none">{scoreValue}</span>
                        <span className="text-[8px] font-bold opacity-70 uppercase tracking-tighter">Score</span>
                      </div>
                    );
                  })()}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Daily Tip */}
        <div className="bg-blue-50/50 dark:bg-surface-dark rounded-xl p-5 border border-blue-100 dark:border-white/5 relative overflow-hidden shadow-sm">
          <p className="text-sm font-black text-primary mb-2 uppercase tracking-[0.15em]">每日职场建议</p>
          <p className="text-sm text-slate-800 dark:text-slate-200 font-semibold relative z-10 leading-relaxed italic">
            "{dailyTip}"
          </p>
        </div>

      </div>
    </div>
  );
};

export default Dashboard;
