import React, { useState, useEffect } from 'react';
import { ScreenProps, View } from '../../types';
import { useNavigate } from 'react-router-dom';
import { useUserProfile } from '../../src/useUserProfile';
import { DatabaseService } from '../../src/database-service';
import { supabase } from '../../src/supabase-client';
import { useAppContext } from '../../src/app-context';
import { useAppStore } from '../../src/app-store';
import { getLatestCareerProfile } from '../../src/career-profile-utils';
import DashboardProgressModule from './DashboardProgressModule';
import CareerProfileEntryCard from './dashboard/CareerProfileEntryCard';

const CAREER_TIPS = [
  "简历中的数字比形容词更有说服力，量化成果是金标准。",
  "针对不同职位描述调整简历关键词，提高 Boss 直聘等平台的匹配度。",
  "保持简历简洁，重点突出最近三年的核心项目经历。",
  "使用强有力的动词开头，直接描述你解决的问题和达成的结果。",
  "检查拼写和排版错误是发布前的底线，细节决定第一印象。",
  "在简历中展现软技能，如跨部门协作能力和抗压能力。",
  "量化你的贡献：如'节省了30%成本'或'提前2周完成交付'。",
  "重视个人核心优势（Summary），在三秒内抓住 HR 的眼球。",
  "面试结束后可以适度跟进进度，展现你对岗位的积极态度。",
  "在行业垂直社群保持活跃，内推成功率远高于盲投。",
  "不要只列工作职责，要突出你在这个岗位上的'独特性'。",
  "针对往期的核心项目或关键工作经历，应深入复盘并提炼出至少两个亮点案例。",
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
  const navigate = useNavigate();
  const allResumes = useAppStore((state) => state.allResumes);
  const setResumeData = useAppStore((state) => state.setResumeData);
  const navOwnerKey = 'ai_nav_owner_user_id';
  const [greeting, setGreeting] = useState('');
  const [dailyTips, setDailyTips] = useState<string[]>([]);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  // Minimum swipe distance (in px)
  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe && currentTipIndex < 2) {
      setCurrentTipIndex(prev => prev + 1);
    } else if (isRightSwipe && currentTipIndex > 0) {
      setCurrentTipIndex(prev => prev - 1);
    }
  };

  // Get user profile with real name
  const { userProfile } = useUserProfile();
  const latestCareerProfile = React.useMemo(
    () => getLatestCareerProfile(userProfile),
    [userProfile]
  );
  const careerProfileSummary = String(latestCareerProfile?.summary || '').trim();
  const careerProfileExperienceCount = Array.isArray(latestCareerProfile?.experiences)
    ? latestCareerProfile!.experiences.length
    : 0;
  const careerProfileUpdatedAt = String(latestCareerProfile?.createdAt || '').trim();
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
      setDailyTips([
        CAREER_TIPS[index],
        CAREER_TIPS[(index + 1) % CAREER_TIPS.length],
        CAREER_TIPS[(index + 2) % CAREER_TIPS.length],
      ]);
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

  const recentResumes = React.useMemo(() => {
    if (!currentUser?.id) return [];
    if (!allResumes) return [];
    // Sort by date descending and take top 3
    return [...allResumes]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 3);
  }, [allResumes, currentUser?.id]);

  const [isLoadingResume, setIsLoadingResume] = React.useState<number | null>(null);

  const hasAnyProgressForResume = (resume: any) => {
    const diagnosisProgress = Math.max(0, Math.min(100, Math.round(Number((resume as any)?.diagnosisProgress || 0))));
    const hasDiagnosisProgress = diagnosisProgress >= 15;
    const byMode = (resume as any)?.interviewStageStatusByMode;
    const hasInterviewProgressByMode = !!(
      byMode &&
      (
        (Array.isArray(byMode.simple) && byMode.simple.some((s: any) => s === 'current' || s === 'done')) ||
        (Array.isArray(byMode.comprehensive) && byMode.comprehensive.some((s: any) => s === 'current' || s === 'done'))
      )
    );
    const hasInterviewProgressLegacy = Array.isArray((resume as any)?.interviewStageStatus)
      ? (resume as any).interviewStageStatus.some((s: any) => s === 'current' || s === 'done')
      : false;
    const hasInterviewProgress = hasInterviewProgressByMode || hasInterviewProgressLegacy;
    return hasDiagnosisProgress || hasInterviewProgress;
  };

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
          localStorage.setItem('preview_back_target', 'dashboard');
          localStorage.setItem('preview_resume_id', String(fullResume.id));
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

  const handleContinueDiagnosis = (resume: any) => {
    const resumeId = String(resume?.id || '').trim();
    const ownerId = String(currentUser?.id || '').trim();
    if (!resumeId) return;
    // Enter via resume select first, then auto-select this resume.
    // Keep behavior fully aligned with manually clicking a resume in ResumeSelectPage.
    localStorage.setItem('ai_analysis_force_resume_select', '1');
    localStorage.removeItem('ai_interview_force_resume_select');
    if (ownerId) localStorage.setItem(navOwnerKey, ownerId);
    localStorage.setItem('ai_result_open', '1');
    localStorage.setItem('ai_result_resume_id', resumeId);
    localStorage.setItem('ai_result_prefer_report', (resume as any)?.analyzed ? '1' : '0');
    localStorage.removeItem('ai_result_step');
    localStorage.setItem('ai_result_wait_resume_select', '1');
    localStorage.removeItem('ai_interview_open');
    localStorage.removeItem('ai_interview_resume_id');
    localStorage.removeItem('ai_interview_entry_mode');
    navigate('/ai-analysis', { replace: true });
  };

  const handleContinueInterview = (resume: any) => {
    const resumeId = String(resume?.id || '').trim();
    const ownerId = String(currentUser?.id || '').trim();
    if (!resumeId) return;
    if (!hasAnyProgressForResume(resume)) {
      localStorage.setItem('ai_interview_force_resume_select', '1');
      localStorage.removeItem('ai_analysis_force_resume_select');
      if (ownerId) localStorage.setItem(navOwnerKey, ownerId);
      localStorage.removeItem('ai_result_open');
      localStorage.removeItem('ai_result_resume_id');
      localStorage.removeItem('ai_result_step');
      localStorage.removeItem('ai_interview_open');
      localStorage.removeItem('ai_interview_resume_id');
      localStorage.removeItem('ai_interview_entry_mode');
      navigateToView(View.AI_INTERVIEW, { replace: true });
      return;
    }
    localStorage.removeItem('ai_analysis_force_resume_select');
    localStorage.removeItem('ai_interview_force_resume_select');
    if (ownerId) localStorage.setItem(navOwnerKey, ownerId);
    localStorage.setItem('ai_interview_open', '1');
    localStorage.setItem('ai_interview_resume_id', resumeId);
    localStorage.setItem('ai_interview_entry_mode', 'scene_select');
    navigateToView(View.AI_INTERVIEW, { replace: true });
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
        <div>
          <CareerProfileEntryCard
            summary={careerProfileSummary}
            experienceCount={careerProfileExperienceCount}
            updatedAt={careerProfileUpdatedAt}
            onOpen={() => navigateToView(View.CAREER_PROFILE)}
          />
        </div>

        {/* Progress Module or Create New Resume */}
        <div>
          {recentResumes && recentResumes.length > 0 && recentResumes[0] ? (
            <DashboardProgressModule
              resume={recentResumes[0]}
              onContinueDiagnosis={handleContinueDiagnosis}
              onContinueInterview={handleContinueInterview}
            />
          ) : (
            <div
              onClick={createNewResume}
              className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-blue-600 to-indigo-700 p-6 shadow-xl shadow-primary/30 text-white cursor-pointer active:scale-[0.98] transition-all min-h-[160px] flex flex-col justify-center"
            >
              <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-3xl animate-pulse"></div>
              <div className="absolute -left-16 -bottom-16 h-64 w-64 rounded-full bg-white/10 blur-3xl"></div>
              <div className="relative z-10">
                <div className="size-12 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center mb-4 border border-white/30">
                  <span className="material-symbols-outlined text-white text-2xl">add_circle</span>
                </div>
                <h3 className="text-xl font-black mb-1">创建您的第一份简历</h3>
                <p className="text-white/80 text-sm font-medium">使用 AI 智能助攻，让简历脱颖而出</p>
                <div className="mt-6 flex items-center gap-2 text-xs font-bold bg-white/20 w-fit px-4 py-2 rounded-full backdrop-blur-md border border-white/20 group-hover:bg-white/30 transition-colors">
                  <span>立即开始</span>
                  <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Daily Tip */}
        <div
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          className="relative group overflow-hidden touch-pan-y"
        >
          {/* Decorative background glow */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-3xl rounded-full -mr-16 -mt-16"></div>
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-blue-400/5 blur-2xl rounded-full -ml-12 -mb-12"></div>

          <div className="bg-white dark:bg-surface-dark rounded-2xl p-6 border border-slate-100 dark:border-white/5 shadow-sm relative z-10 flex flex-col min-h-[170px]">
            {/* Header Section */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-xl bg-blue-50 dark:bg-primary/10 flex items-center justify-center shadow-inner">
                  <span className="material-symbols-outlined text-primary text-[16px] font-bold">tips_and_updates</span>
                </div>
                <span className="text-[11px] font-black text-slate-500 dark:text-gray-400 uppercase tracking-[0.25em]">每日职场建议</span>
              </div>
              <div className="flex gap-1.5 grayscale opacity-60">
                {[0, 1, 2].map(i => (
                  <div key={i} className={`h-1 rounded-full transition-all duration-300 ${i === currentTipIndex ? 'bg-primary w-4 grayscale-0 opacity-100' : 'bg-slate-300 dark:bg-white/10 w-1'}`} />
                ))}
              </div>
            </div>

            {/* Content Section */}
            <div className="flex-1 flex items-center gap-2 relative">
              {/* Desktop Arrows - Hidden by default, show on hover */}
              <button
                onClick={() => setCurrentTipIndex(prev => Math.max(0, prev - 1))}
                disabled={currentTipIndex === 0}
                className={`w-9 h-9 flex items-center justify-center rounded-xl bg-slate-50 dark:bg-white/5 text-slate-400 hover:text-primary hover:bg-white dark:hover:bg-white/10 shadow-sm transition-all active:scale-90 shrink-0 hidden md:flex
                  ${currentTipIndex === 0 ? 'opacity-0 pointer-events-none' : 'opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0'}`}
              >
                <span className="material-symbols-outlined text-[20px]">chevron_left</span>
              </button>

              <div className="flex-1 relative h-full min-h-[70px] flex items-center overflow-hidden px-1">
                <span className="material-symbols-outlined absolute -top-2 -left-2 text-slate-100 dark:text-white/5 text-[48px] z-0 pointer-events-none rotate-180">format_quote</span>
                {dailyTips.map((tip, idx) => (
                  <p
                    key={idx}
                    className={`text-[15px] text-slate-800 dark:text-slate-200 font-bold leading-relaxed absolute transition-all duration-500 ease-out w-full
                      ${idx === currentTipIndex ? 'opacity-100 translate-y-0 scale-100' : idx < currentTipIndex ? 'opacity-0 -translate-y-4 scale-95' : 'opacity-0 translate-y-4 scale-95'}`}
                  >
                    {tip}
                  </p>
                ))}
              </div>

              <button
                onClick={() => setCurrentTipIndex(prev => Math.min(2, prev + 1))}
                disabled={currentTipIndex === 2}
                className={`w-9 h-9 flex items-center justify-center rounded-xl bg-slate-50 dark:bg-white/5 text-slate-400 hover:text-primary hover:bg-white dark:hover:bg-white/10 shadow-sm transition-all active:scale-90 shrink-0 hidden md:flex
                  ${currentTipIndex === 2 ? 'opacity-0 pointer-events-none' : 'opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0'}`}
              >
                <span className="material-symbols-outlined text-[20px]">chevron_right</span>
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
