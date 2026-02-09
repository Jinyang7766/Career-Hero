import React, { useState, useEffect } from 'react';
import { View, ScreenProps, ResumeSummary } from '../../types';
import { useUserProfile } from '../../src/useUserProfile';
import { DatabaseService } from '../../src/database-service';
import { supabase } from '../../src/supabase-client';

const Dashboard: React.FC<ScreenProps & { createNewResume?: () => void }> = ({ setCurrentView, completeness = 0, resumeData, allResumes, setAllResumes, currentUser, setResumeData, createNewResume }) => {
  const [isCreating, setIsCreating] = useState(false);
  const [greeting, setGreeting] = useState('');
  const [isOptimizedOpen, setIsOptimizedOpen] = useState(true);
  const [isUnoptimizedOpen, setIsUnoptimizedOpen] = useState(true);
  const optimizedResumes = (allResumes || []).filter(r => r.optimizationStatus === 'optimized');
  const unoptimizedResumes = (allResumes || []).filter(r => r.optimizationStatus !== 'optimized');
  const displayOptimizedResumes = optimizedResumes.slice(0, 3);
  const displayUnoptimizedResumes = unoptimizedResumes.slice(0, 3);

  // Get user profile with real name
  const { userProfile, loading, error } = useUserProfile();
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

    if (hour >= 5 && hour < 12) {
      return '早上好';
    } else if (hour >= 12 && hour < 18) {
      return '中午好';
    } else if (hour >= 18 && hour < 23) {
      return '晚上好';
    } else {
      return '夜深了';
    }
  };

  // Update greeting every minute
  useEffect(() => {
    const updateGreeting = () => {
      setGreeting(getBeijingGreeting());
    };

    updateGreeting();
    const interval = setInterval(updateGreeting, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  // Handle resume preview
  const handleResumePreview = async (resumeId: number) => {
    try {
      console.log('=== Dashboard 简历预览调试信息 ===');
      console.log('Previewing resume from dashboard:', resumeId);

      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError || !user) {
        console.error('❌ User not authenticated:', userError);
        alert('请先登录');
        return;
      }

      console.log('Current user:', user.id);

      // Get all user resumes and find the specific one
      const result = await DatabaseService.getUserResumes(user.id);

      console.log('Database result:', result);

      if (result.success) {
        console.log('All resumes found:', result.data);

        const resume = result.data.find((r: any) => r.id === resumeId);

        console.log('Target resume found:', resume);

        if (resume) {
          console.log('Resume data structure:', {
            id: resume.id,
            title: resume.title,
            resumeDataKeys: resume.resume_data ? Object.keys(resume.resume_data) : 'null',
            resumeDataSize: resume.resume_data ? JSON.stringify(resume.resume_data).length : 0
          });

          // 检查resume_data是否为空
          if (!resume.resume_data) {
            console.error('❌ 简历数据为空: resume_data is null/undefined');
            alert('简历数据为空，请重新创建简历');
            return;
          }

          // 检查resume_data是否为空对象
          if (typeof resume.resume_data === 'object' && Object.keys(resume.resume_data).length === 0) {
            console.error('❌ 简历数据为空对象: resume_data is empty object');
            alert('简历数据为空，请重新创建简历');
            return;
          }

          console.log('✅ Resume loaded for preview from dashboard:', resume);

          // Set the resume data with ID for preview
          if (setResumeData) {
            const finalResumeData = {
              id: resume.id,
              ...resume.resume_data
            };

            console.log('Setting resume data for preview:', {
              id: finalResumeData.id,
              hasPersonalInfo: !!finalResumeData.personalInfo,
              hasWorkExps: Array.isArray(finalResumeData.workExps) && finalResumeData.workExps.length > 0,
              hasEducations: Array.isArray(finalResumeData.educations) && finalResumeData.educations.length > 0,
              hasSkills: Array.isArray(finalResumeData.skills) && finalResumeData.skills.length > 0,
              dataKeys: Object.keys(finalResumeData)
            });

            setResumeData(finalResumeData);
          }

          setCurrentView(View.PREVIEW);
        } else {
          console.error('❌ Resume not found for preview from dashboard');
          alert(`简历不存在 (ID: ${resumeId})`);
        }
      } else {
        console.error('❌ 加载简历失败:', result.error);
        alert(`加载简历失败: ${result.error?.message || '请重试'}`);
      }
    } catch (error) {
      console.error('❌ 预览简历时出错:', error);
      alert('预览简历失败，请检查网络连接');
    }
  };

  return (
    <div className="flex flex-col pb-24 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between p-4 sticky top-0 z-30 bg-background-light/90 dark:bg-background-dark/90 backdrop-blur-md">
        <div className="flex flex-col">
          <h2 className="text-xl font-bold leading-tight text-gray-900 dark:text-white">
            {greeting}{displayName ? `，${displayName}` : ''}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {new Date().toLocaleDateString('zh-CN', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'Asia/Shanghai'
            })}
          </p>
        </div>
      </div>

      {/* Create New Card */}
      <div className="px-4 pb-6 pt-4">
        <div
          onClick={createNewResume}
          className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-primary to-[#0d5cb0] p-6 shadow-lg shadow-primary/20 cursor-pointer active:scale-[0.98] transition-all"
        >
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-3xl"></div>
          <div className="absolute -left-10 -bottom-10 h-40 w-40 rounded-full bg-white/10 blur-3xl"></div>
          <div className="relative flex flex-col items-start gap-4">
            <div className="flex items-center justify-center h-12 w-12 rounded-full bg-white/20 backdrop-blur-sm">
              <span className="material-symbols-outlined text-white" style={{ fontSize: '28px' }}>add</span>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-xl font-bold text-white">新建简历</h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white text-primary uppercase tracking-wide">AI 向导</span>
              </div>
              <p className="text-blue-100 text-sm max-w-[90%]">通过智能向导，轻松几步创建专业简历。</p>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                createNewResume?.();
              }}
              className="mt-2 flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-primary shadow-sm hover:bg-blue-50 transition-colors"
            >
              <span>立即开始</span>
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </button>
          </div>
        </div>
      </div>

      {/* My Resumes Section */}
      <div className="flex items-center justify-between px-4 pb-3">
        <h3 className="text-lg font-bold leading-tight">
          我的简历
          {allResumes && allResumes.length > 0 && (
            <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
              ({allResumes.length})
            </span>
          )}
        </h3>
        <button
          onClick={() => setCurrentView(View.ALL_RESUMES)}
          className="text-sm font-medium text-primary hover:text-primary/80"
        >
          查看全部
        </button>
      </div>

      <div className="flex flex-col gap-4 px-4 pb-8">
        {(() => {
          const renderCard = (resume: ResumeSummary) => (
            <div
              key={resume.id}
              onClick={() => handleResumePreview(resume.id)}
              className="flex items-start gap-4 rounded-xl bg-white dark:bg-card-dark p-3 shadow-sm border border-gray-100 dark:border-gray-800 hover:border-primary/50 transition-colors cursor-pointer"
            >
              <div className="relative shrink-0 w-14 aspect-[210/297] rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 overflow-hidden shadow-inner">
                {resume.thumbnail}
                {resume.hasDot && (
                  <div className="absolute -top-1 -right-1 size-2.5 bg-primary rounded-full border-2 border-white dark:border-card-dark"></div>
                )}
              </div>
              <div className="flex flex-1 flex-col justify-between py-1 min-h-[3.5rem]">
                <div>
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2 min-w-0">
                      <h4 className="text-base font-bold text-gray-900 dark:text-white line-clamp-1">{resume.title}</h4>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-auto">
                  <span className="material-symbols-outlined text-gray-400 text-[14px]">schedule</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{resume.date}</span>
                  {typeof resume.score === 'number' && resume.score > 0 && (
                    <>
                      <span className="mx-1 h-1 w-1 rounded-full bg-gray-300 dark:bg-gray-600"></span>
                      <span className="text-xs text-green-500 font-medium">{resume.score}% 匹配度</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          );

          return (
            <>
              <button
                onClick={() => setIsOptimizedOpen(v => !v)}
                className="w-full flex items-center justify-between text-lg font-bold text-white"
              >
                <span>已优化</span>
                <span className="material-symbols-outlined text-[20px] text-slate-500 dark:text-slate-400">
                  {isOptimizedOpen ? 'expand_less' : 'expand_more'}
                </span>
              </button>
              {isOptimizedOpen && (
                displayOptimizedResumes.length > 0 ? displayOptimizedResumes.map(renderCard) : (
                  <div className="p-4 text-center text-slate-500 text-sm bg-white dark:bg-card-dark rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                    暂无已优化简历
                  </div>
                )
              )}
              {isOptimizedOpen && optimizedResumes.length > 3 && (
                <div className="flex justify-end">
                  <button
                    onClick={() => setCurrentView(View.ALL_RESUMES)}
                    className="text-sm font-medium text-primary hover:text-primary/80 text-right"
                  >
                    更多
                  </button>
                </div>
              )}

              <button
                onClick={() => setIsUnoptimizedOpen(v => !v)}
                className="w-full flex items-center justify-between text-lg font-bold text-white"
              >
                <span>未优化</span>
                <span className="material-symbols-outlined text-[20px] text-slate-500 dark:text-slate-400">
                  {isUnoptimizedOpen ? 'expand_less' : 'expand_more'}
                </span>
              </button>
              {isUnoptimizedOpen && (
                displayUnoptimizedResumes.length > 0 ? displayUnoptimizedResumes.map(renderCard) : (
                  <div className="p-4 text-center text-slate-500 text-sm bg-white dark:bg-card-dark rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                    暂无未优化简历
                  </div>
                )
              )}
              {isUnoptimizedOpen && unoptimizedResumes.length > 3 && (
                <div className="flex justify-end">
                  <button
                    onClick={() => setCurrentView(View.ALL_RESUMES)}
                    className="text-sm font-medium text-primary hover:text-primary/80 text-right"
                  >
                    更多
                  </button>
                </div>
              )}
            </>
          );
        })()}

      </div>
    </div>
  );
};

export default Dashboard;
