import React, { useState } from 'react';
import { View, ScreenProps } from '../../types';
import { useUserProfile } from '../../src/useUserProfile';

const Dashboard: React.FC<ScreenProps> = ({ setCurrentView, completeness = 0, resumeData, allResumes, setAllResumes, currentUser, setResumeData }) => {
  const [isCreating, setIsCreating] = useState(false);
  // Show top 3 resumes
  const displayResumes = allResumes ? allResumes.slice(0, 3) : [];
  
  // Get user profile with real name
  const { userProfile, loading, error } = useUserProfile();

  return (
    <div className="flex flex-col pb-24 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between p-4 sticky top-0 z-30 bg-background-light/90 dark:bg-background-dark/90 backdrop-blur-md">
         <h2 className="text-xl font-bold leading-tight text-gray-900 dark:text-white">
        {loading ? '加载中...' : userProfile?.name || '用户'}
      </h2>
      </div>

      {/* Progress Card */}
      <div className="px-4 pb-6 pt-2">
        <div className="flex flex-col gap-3 p-4 rounded-xl bg-white dark:bg-card-dark shadow-sm border border-gray-100 dark:border-gray-800">
          <div className="flex gap-6 justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[20px] fill-1">verified</span>
              <p className="text-base font-bold leading-normal">简历完整度</p>
            </div>
            <span className="text-primary font-bold">{completeness}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-all duration-500 ease-out" style={{ width: `${completeness}%` }}></div>
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-sm font-normal leading-normal">
            {completeness === 100 ? '简历已臻完美！' : '完善更多信息以提升求职成功率。'}
          </p>
        </div>
      </div>

      {/* Create New Card */}
      <div className="px-4 pb-6">
        <div 
          onClick={() => {
            if (isCreating) return;
            // Reset resume data to empty and navigate to editor
            setAllResumes?.([]);
            setCurrentView(View.EDITOR);
          }}
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
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white text-primary uppercase tracking-wide">AI 测试版</span>
              </div>
              <p className="text-blue-100 text-sm max-w-[90%]">从头开始，或让 AI 助手帮您构建专业简历。</p>
            </div>
            <button 
              onClick={async () => {
                // Reset resume data for new resume (no ID)
                const emptyResumeData = {
                  personalInfo: {
                    name: '',
                    title: '',
                    email: '',
                    phone: ''
                  },
                  workExps: [],
                  educations: [],
                  projects: [],
                  skills: [],
                  gender: ''
                };
                
                // Ensure state is set before navigating
                if (setResumeData) {
                  setResumeData(emptyResumeData);
                  // Small delay to ensure state update
                  await new Promise(resolve => setTimeout(resolve, 0));
                }
                
                setCurrentView(View.TEMPLATES);
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
        <h3 className="text-lg font-bold leading-tight">我的简历</h3>
        <button 
          onClick={() => setCurrentView(View.ALL_RESUMES)}
          className="text-sm font-medium text-primary hover:text-primary/80"
        >
          查看全部
        </button>
      </div>

      <div className="flex flex-col gap-4 px-4 pb-8">
        {displayResumes.map((resume) => (
          <div 
            key={resume.id}
            onClick={() => setCurrentView(View.PREVIEW)} 
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
                  <h4 className="text-base font-bold text-gray-900 dark:text-white line-clamp-1">{resume.title}</h4>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-auto">
                <span className="material-symbols-outlined text-gray-400 text-[14px]">schedule</span>
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{resume.date}</span>
                {resume.score && (
                   <>
                    <span className="mx-1 h-1 w-1 rounded-full bg-gray-300 dark:bg-gray-600"></span>
                    <span className="text-xs text-green-500 font-medium">{resume.score}% 匹配度</span>
                   </>
                )}
              </div>
            </div>
          </div>
        ))}
        
        {displayResumes.length === 0 && (
            <div className="p-8 text-center text-slate-500 text-sm bg-white dark:bg-card-dark rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                暂无简历，点击新建开始
            </div>
        )}

      </div>
    </div>
  );
};

export default Dashboard;