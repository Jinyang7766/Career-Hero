import React, { useState } from 'react';
import { View, ScreenProps, ResumeData, ExperienceItem } from '../../types';
import { DatabaseService } from '../../src/database-service';
import { supabase } from '../../src/supabase-client';

const Editor: React.FC<ScreenProps> = ({ setCurrentView, goBack, resumeData, setResumeData, completeness = 0, createResume, loadUserResumes }) => {
  const [newSkill, setNewSkill] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  
  
  // Guard clause to prevent crash if data isn't ready
  if (!resumeData || !setResumeData) {
    return <div className="p-4 text-white">Loading data...</div>;
  }

  // --- Handlers ---

  const handleInfoChange = (field: keyof ResumeData['personalInfo'] | 'gender', value: string) => {
    if (field === 'gender') {
      setResumeData(prev => ({
        ...prev,
        gender: value
      }));
    } else {
      setResumeData(prev => ({
        ...prev,
        personalInfo: { ...prev.personalInfo, [field]: value }
      }));
    }
  };

  const addItem = (section: 'workExps' | 'educations' | 'projects') => {
    setResumeData(prev => ({
      ...prev,
      [section]: [
        ...prev[section],
        { id: Date.now(), title: '', subtitle: '', date: '', description: '' }
      ]
    }));
  };

  const removeItem = (section: 'workExps' | 'educations' | 'projects', id: number) => {
    setResumeData(prev => ({
      ...prev,
      [section]: prev[section].filter(item => item.id !== id)
    }));
  };

  // Helper for updating fields in array items
  const updateItem = (section: 'workExps' | 'educations' | 'projects', id: number, field: keyof ExperienceItem, value: string) => {
    setResumeData(prev => ({
      ...prev,
      [section]: prev[section].map(item => item.id === id ? { ...item, [field]: value } : item)
    }));
  };

  // Check if section is completed
  const isPersonalInfoComplete = () => {
    const { personalInfo } = resumeData;
    return personalInfo.name && personalInfo.title && personalInfo.email && personalInfo.phone && resumeData.gender;
  };

  const isWorkExperienceComplete = () => {
    return resumeData.workExps.length > 0 && resumeData.workExps.some(exp => exp.title && exp.subtitle && exp.date);
  };

  const isEducationComplete = () => {
    return resumeData.educations.length > 0 && resumeData.educations.some(edu => edu.title && edu.subtitle && edu.date);
  };

  const isSkillsComplete = () => {
    // Skills are optional, only show check if user has added skills
    return resumeData.skills.length > 0;
  };

  const isProjectsComplete = () => {
    // Projects are optional, only show check if user has added projects
    return resumeData.projects.length > 0 && resumeData.projects.some(proj => proj.title && proj.description);
  };

  const handleAddSkill = () => {
    if (newSkill.trim()) {
      setResumeData(prev => ({
        ...prev,
        skills: [...prev.skills, newSkill.trim()]
      }));
      setNewSkill('');
    }
  };

  const handleSaveAndPreview = async () => {
    setIsSaving(true);
    try {
      console.log('Saving resume with data:', resumeData);
      
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        console.error('User not authenticated:', userError);
        alert('请先登录');
        return;
      }
      
      console.log('Current user:', user);
      
      let result;
      const title = `${resumeData.personalInfo.name || '未命名'}的简历`;
      
      // Check if we're updating an existing resume or creating a new one
      if (resumeData.id) {
        // Update existing resume
        console.log('Updating existing resume:', resumeData.id);
        result = await DatabaseService.updateResume(String(resumeData.id), {
          title: title,
          resume_data: resumeData,
        });
      } else {
        // Create new resume
        console.log('Creating new resume for user:', user.id);
        result = await DatabaseService.createResume(user.id, title, resumeData);
      }

      console.log('Save result:', result);

      if (result.success) {
        // Update the resume data with the returned ID if it's a new resume
        if (!resumeData.id && result.data) {
          setResumeData(prev => ({ ...prev, id: result.data.id }));
        }
        
        // Reload resumes to get the latest list
        if (loadUserResumes) {
          await loadUserResumes();
        }
        
        console.log('Resume saved successfully, navigating to preview');
        // Navigate to preview
        setCurrentView(View.PREVIEW);
      } else {
        console.error('Failed to save resume:', result.error);
        alert(`保存失败: ${result.error?.message || '请重试'}`);
      }
    } catch (error) {
      console.error('Error saving resume:', {
        error: error,
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : 'No stack trace'
      });
      alert('保存失败，请检查网络连接');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveSkill = (index: number) => {
    setResumeData(prev => ({
      ...prev,
      skills: prev.skills.filter((_, i) => i !== index)
    }));
  };

  return (
    <div className="flex flex-col pb-12 bg-background-light dark:bg-background-dark min-h-screen animate-in slide-in-from-right duration-300">
      <header className="sticky top-0 z-50 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md border-b border-slate-200 dark:border-[#324d67] transition-colors duration-300">
        <div className="flex items-center justify-between px-4 py-3">
          <button 
            onClick={goBack}
            className="flex items-center justify-center p-2 -ml-2 rounded-full hover:bg-slate-200 dark:hover:bg-white/5 transition-colors text-slate-700 dark:text-white"
          >
            <span className="material-symbols-outlined text-[24px]">arrow_back</span>
          </button>
          <div className="flex-1 text-center">
            <h1 className="text-base font-bold leading-tight">{resumeData.personalInfo.title || '简历编辑'}</h1>
            <p className="text-xs text-slate-500 dark:text-text-secondary">正在编辑...</p>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setCurrentView(View.PREVIEW)}
              className="flex items-center justify-center p-2 rounded-full hover:bg-slate-200 dark:hover:bg-white/5 text-slate-700 dark:text-white" title="预览"
            >
              <span className="material-symbols-outlined text-[24px]">visibility</span>
            </button>
          </div>
        </div>
      </header>

      <div className="px-4 py-6">
        <div className="flex justify-between items-end mb-2">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">简历完整度</h2>
            <p className="text-sm text-slate-500 dark:text-text-secondary mt-1">让你的简历脱颖而出</p>
          </div>
          <span className="text-primary font-bold text-sm">{completeness}%</span>
        </div>
        <div className="h-2 w-full bg-slate-200 dark:bg-[#324d67] rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all duration-500 ease-out" style={{ width: `${completeness}%` }}></div>
        </div>
        <p className="text-xs text-slate-400 dark:text-text-secondary mt-2 text-right">
            {completeness < 100 ? '继续完善以提高评分' : '简历信息已完善'}
        </p>
      </div>

      <main className="flex flex-col gap-4 px-4">
        {/* Personal Info */}
        <details className="group bg-white dark:bg-surface-dark rounded-xl shadow-sm border border-slate-200 dark:border-[#324d67] overflow-hidden transition-all duration-300" open>
          <summary className="flex cursor-pointer items-center justify-between p-4 bg-white dark:bg-surface-dark hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
            <div className="flex items-center gap-3">
              <div className={`flex items-center justify-center size-8 rounded-full ${isPersonalInfoComplete() ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'}`}>
                <span className="material-symbols-outlined text-[18px]">{isPersonalInfoComplete() ? 'check' : 'person'}</span>
              </div>
              <span className="font-semibold text-slate-900 dark:text-white">个人信息</span>
            </div>
            <span className="material-symbols-outlined text-slate-400 group-open:rotate-180 transition-transform duration-300">expand_more</span>
          </summary>
          <div className="p-4 pt-0 border-t border-slate-100 dark:border-white/5 mt-2">
            <div className="grid gap-4 pt-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-slate-500 dark:text-text-secondary uppercase tracking-wider">姓名 *</label>
                <input 
                    className="w-full rounded-lg bg-slate-50 dark:bg-[#111a22] border border-slate-200 dark:border-[#324d67] text-slate-900 dark:text-white px-4 py-3 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all" 
                    type="text" 
                    value={resumeData.personalInfo.name}
                    onChange={(e) => handleInfoChange('name', e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-slate-500 dark:text-text-secondary uppercase tracking-wider">求职意向 *</label>
                <input 
                    className="w-full rounded-lg bg-slate-50 dark:bg-[#111a22] border border-slate-200 dark:border-[#324d67] text-slate-900 dark:text-white px-4 py-3 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all" 
                    type="text" 
                    value={resumeData.personalInfo.title}
                    onChange={(e) => handleInfoChange('title', e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium text-slate-500 dark:text-text-secondary uppercase tracking-wider">电子邮箱 *</label>
                  <input 
                    className="w-full rounded-lg bg-slate-50 dark:bg-[#111a22] border border-slate-200 dark:border-[#324d67] text-slate-900 dark:text-white px-4 py-3 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all" 
                    type="email" 
                    value={resumeData.personalInfo.email}
                    onChange={(e) => handleInfoChange('email', e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium text-slate-500 dark:text-text-secondary uppercase tracking-wider">电话号码 *</label>
                  <input 
                    className="w-full rounded-lg bg-slate-50 dark:bg-[#111a22] border border-slate-200 dark:border-[#324d67] text-slate-900 dark:text-white px-4 py-3 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all" 
                    type="tel" 
                    value={resumeData.personalInfo.phone}
                    onChange={(e) => handleInfoChange('phone', e.target.value)}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-slate-500 dark:text-text-secondary uppercase tracking-wider">性别 *</label>
                <select 
                  value={resumeData.gender || ''}
                  onChange={(e) => handleInfoChange('gender', e.target.value)}
                  className="w-full rounded-lg bg-slate-50 dark:bg-[#111a22] border border-slate-200 dark:border-[#324d67] text-slate-900 dark:text-white px-4 py-3 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all"
                  required
                >
                  <option value="">请选择</option>
                  <option value="male">男</option>
                  <option value="female">女</option>
                </select>
              </div>
            </div>
          </div>
        </details>

        {/* Work Experience */}
        <details className="group bg-white dark:bg-surface-dark rounded-xl shadow-sm border border-slate-200 dark:border-[#324d67] overflow-hidden transition-all duration-300">
          <summary className="flex cursor-pointer items-center justify-between p-4 bg-white dark:bg-surface-dark hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
            <div className="flex items-center gap-3">
              <div className={`flex items-center justify-center size-8 rounded-full ${isWorkExperienceComplete() ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'}`}>
                <span className="material-symbols-outlined text-[18px]">{isWorkExperienceComplete() ? 'check' : 'work'}</span>
              </div>
              <span className="font-semibold text-slate-900 dark:text-white">工作经历</span>
            </div>
            <span className="material-symbols-outlined text-slate-400 group-open:rotate-180 transition-transform duration-300">expand_more</span>
          </summary>
          <div className="p-4 pt-0 border-t border-slate-100 dark:border-white/5 mt-2">
            
            {resumeData.workExps.map((exp, index) => (
               <div key={exp.id} className="mt-4 flex flex-col gap-4 pb-6 border-b border-slate-100 dark:border-white/5 last:border-0 relative">
                  <div className="flex justify-between items-center">
                    <h4 className="text-sm font-semibold text-primary uppercase tracking-wide">工作经历 {index + 1}</h4>
                    <button 
                        onClick={() => removeItem('workExps', exp.id)}
                        className="text-slate-400 hover:text-red-400 p-1"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </div>
                  <div className="grid gap-4">
                    <input 
                        className="w-full rounded-lg bg-slate-50 dark:bg-[#111a22] border border-slate-200 dark:border-[#324d67] text-slate-900 dark:text-white px-4 py-3 placeholder:text-slate-400 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all" 
                        placeholder="公司名称" 
                        type="text" 
                        value={exp.title} 
                        onChange={(e) => updateItem('workExps', exp.id, 'title', e.target.value)}
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <input 
                        className="w-full rounded-lg bg-slate-50 dark:bg-[#111a22] border border-slate-200 dark:border-[#324d67] text-slate-900 dark:text-white px-4 py-3 placeholder:text-slate-400 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all" 
                        placeholder="职位名称" 
                        type="text" 
                        value={exp.subtitle} 
                        onChange={(e) => updateItem('workExps', exp.id, 'subtitle', e.target.value)}
                      />
                      <input 
                        className="w-full rounded-lg bg-slate-50 dark:bg-[#111a22] border border-slate-200 dark:border-[#324d67] text-slate-900 dark:text-white px-4 py-3 placeholder:text-slate-400 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all" 
                        placeholder="任职时间" 
                        type="text" 
                        value={exp.date} 
                        onChange={(e) => updateItem('workExps', exp.id, 'date', e.target.value)}
                      />
                    </div>
                    <div className="relative">
                      <label className="text-xs font-medium text-slate-500 dark:text-text-secondary uppercase tracking-wider mb-2 block">工作内容</label>
                      <textarea 
                        className="w-full rounded-lg bg-slate-50 dark:bg-[#111a22] border border-slate-200 dark:border-[#324d67] text-slate-900 dark:text-white px-4 py-3 placeholder:text-slate-400 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none resize-none transition-all leading-relaxed" 
                        placeholder="描述您的主要职责和业绩成就..." 
                        rows={4} 
                        value={exp.description}
                        onChange={(e) => updateItem('workExps', exp.id, 'description', e.target.value)}
                      ></textarea>
                    </div>
                  </div>
               </div>
            ))}

            <button 
                onClick={() => addItem('workExps')}
                className="mt-4 w-full py-3 rounded-lg border-2 border-dashed border-slate-300 dark:border-[#324d67] hover:border-primary/50 hover:bg-primary/5 text-slate-500 dark:text-text-secondary hover:text-primary transition-all flex items-center justify-center gap-2 font-medium"
            >
              <span className="material-symbols-outlined text-[20px]">add</span>
              添加工作经历
            </button>
          </div>
        </details>

        {/* Education */}
        <details className="group bg-white dark:bg-surface-dark rounded-xl shadow-sm border border-slate-200 dark:border-[#324d67] overflow-hidden transition-all duration-300">
          <summary className="flex cursor-pointer items-center justify-between p-4 bg-white dark:bg-surface-dark hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
            <div className="flex items-center gap-3">
              <div className={`flex items-center justify-center size-8 rounded-full ${isEducationComplete() ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'}`}>
                <span className="material-symbols-outlined text-[18px]">{isEducationComplete() ? 'check' : 'school'}</span>
              </div>
              <span className="font-semibold text-slate-900 dark:text-white">教育背景</span>
            </div>
            <span className="material-symbols-outlined text-slate-400 group-open:rotate-180 transition-transform duration-300">expand_more</span>
          </summary>
          <div className="p-4 pt-0 border-t border-slate-100 dark:border-white/5 mt-2">
            {resumeData.educations.map((edu, index) => (
                <div key={edu.id} className="mt-4 flex flex-col gap-4 pb-6 border-b border-slate-100 dark:border-white/5 last:border-0 relative">
                   <div className="flex justify-between items-center">
                     <h4 className="text-sm font-semibold text-primary uppercase tracking-wide">教育背景 {index + 1}</h4>
                     <button 
                         onClick={() => removeItem('educations', edu.id)}
                         className="text-slate-400 hover:text-red-400 p-1"
                     >
                       <span className="material-symbols-outlined text-[18px]">delete</span>
                     </button>
                   </div>
                   <div className="grid gap-4">
                     <input 
                        className="w-full rounded-lg bg-slate-50 dark:bg-[#111a22] border border-slate-200 dark:border-[#324d67] text-slate-900 dark:text-white px-4 py-3 placeholder:text-slate-400 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all" 
                        placeholder="学校名称" 
                        type="text" 
                        value={edu.title} 
                        onChange={(e) => updateItem('educations', edu.id, 'title', e.target.value)}
                    />
                     <div className="grid grid-cols-2 gap-4">
                       <input 
                        className="w-full rounded-lg bg-slate-50 dark:bg-[#111a22] border border-slate-200 dark:border-[#324d67] text-slate-900 dark:text-white px-4 py-3 placeholder:text-slate-400 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all" 
                        placeholder="专业/学位" 
                        type="text" 
                        value={edu.subtitle} 
                        onChange={(e) => updateItem('educations', edu.id, 'subtitle', e.target.value)}
                       />
                       <input 
                        className="w-full rounded-lg bg-slate-50 dark:bg-[#111a22] border border-slate-200 dark:border-[#324d67] text-slate-900 dark:text-white px-4 py-3 placeholder:text-slate-400 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all" 
                        placeholder="就读时间" 
                        type="text" 
                        value={edu.date} 
                        onChange={(e) => updateItem('educations', edu.id, 'date', e.target.value)}
                       />
                     </div>
                   </div>
                </div>
             ))}

            <button 
                onClick={() => addItem('educations')}
                className="mt-4 w-full py-3 rounded-lg border-2 border-dashed border-slate-300 dark:border-[#324d67] hover:border-primary/50 hover:bg-primary/5 text-slate-500 dark:text-text-secondary hover:text-primary transition-all flex items-center justify-center gap-2 font-medium"
            >
              <span className="material-symbols-outlined text-[20px]">add</span>
              添加教育背景
            </button>
          </div>
        </details>

        {/* Project Experience */}
        <details className="group bg-white dark:bg-surface-dark rounded-xl shadow-sm border border-slate-200 dark:border-[#324d67] overflow-hidden transition-all duration-300">
          <summary className="flex cursor-pointer items-center justify-between p-4 bg-white dark:bg-surface-dark hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
            <div className="flex items-center gap-3">
              <div className={`flex items-center justify-center size-8 rounded-full ${isProjectsComplete() ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'}`}>
                <span className="material-symbols-outlined text-[18px]">{isProjectsComplete() ? 'check' : 'rocket_launch'}</span>
              </div>
              <span className="font-semibold text-slate-900 dark:text-white">项目经历</span>
            </div>
            <span className="material-symbols-outlined text-slate-400 group-open:rotate-180 transition-transform duration-300">expand_more</span>
          </summary>
          <div className="p-4 pt-0 border-t border-slate-100 dark:border-white/5 mt-2">
            {resumeData.projects.length === 0 && <p className="text-xs text-slate-400 dark:text-slate-500 py-2 italic text-center">暂无项目经历，点击下方按钮添加。</p>}
            
            {resumeData.projects.map((proj, index) => (
                <div key={proj.id} className="mt-4 flex flex-col gap-4 pb-6 border-b border-slate-100 dark:border-white/5 last:border-0 relative">
                   <div className="flex justify-between items-center">
                     <h4 className="text-sm font-semibold text-primary uppercase tracking-wide">项目 {index + 1}</h4>
                     <button 
                         onClick={() => removeItem('projects', proj.id)}
                         className="text-slate-400 hover:text-red-400 p-1"
                     >
                       <span className="material-symbols-outlined text-[18px]">delete</span>
                     </button>
                   </div>
                   <div className="grid gap-4">
                     <input 
                        className="w-full rounded-lg bg-slate-50 dark:bg-[#111a22] border border-slate-200 dark:border-[#324d67] text-slate-900 dark:text-white px-4 py-3 placeholder:text-slate-400 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all" 
                        placeholder="项目名称" 
                        type="text" 
                        value={proj.title} 
                        onChange={(e) => updateItem('projects', proj.id, 'title', e.target.value)}
                     />
                     <div className="grid grid-cols-2 gap-4">
                       <input 
                        className="w-full rounded-lg bg-slate-50 dark:bg-[#111a22] border border-slate-200 dark:border-[#324d67] text-slate-900 dark:text-white px-4 py-3 placeholder:text-slate-400 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all" 
                        placeholder="担任角色" 
                        type="text" 
                        value={proj.subtitle} 
                        onChange={(e) => updateItem('projects', proj.id, 'subtitle', e.target.value)}
                       />
                       <input 
                        className="w-full rounded-lg bg-slate-50 dark:bg-[#111a22] border border-slate-200 dark:border-[#324d67] text-slate-900 dark:text-white px-4 py-3 placeholder:text-slate-400 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all" 
                        placeholder="项目时间" 
                        type="text" 
                        value={proj.date} 
                        onChange={(e) => updateItem('projects', proj.id, 'date', e.target.value)}
                       />
                     </div>
                     <div className="relative">
                      <label className="text-xs font-medium text-slate-500 dark:text-text-secondary uppercase tracking-wider mb-2 block">项目描述</label>
                      <textarea 
                        className="w-full rounded-lg bg-slate-50 dark:bg-[#111a22] border border-slate-200 dark:border-[#324d67] text-slate-900 dark:text-white px-4 py-3 placeholder:text-slate-400 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none resize-none transition-all leading-relaxed" 
                        placeholder="描述项目细节及您的贡献..." 
                        rows={3} 
                        value={proj.description}
                        onChange={(e) => updateItem('projects', proj.id, 'description', e.target.value)}
                      ></textarea>
                    </div>
                   </div>
                </div>
             ))}

            <button 
                onClick={() => addItem('projects')}
                className="mt-4 w-full py-3 rounded-lg border-2 border-dashed border-slate-300 dark:border-[#324d67] hover:border-primary/50 hover:bg-primary/5 text-slate-500 dark:text-text-secondary hover:text-primary transition-all flex items-center justify-center gap-2 font-medium"
            >
              <span className="material-symbols-outlined text-[20px]">add</span>
              添加项目经历
            </button>
          </div>
        </details>

         {/* Skills */}
         <details className="group bg-white dark:bg-surface-dark rounded-xl shadow-sm border border-slate-200 dark:border-[#324d67] overflow-hidden transition-all duration-300">
          <summary className="flex cursor-pointer items-center justify-between p-4 bg-white dark:bg-surface-dark hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
            <div className="flex items-center gap-3">
              <div className={`flex items-center justify-center size-8 rounded-full ${isSkillsComplete() ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'}`}>
                <span className="material-symbols-outlined text-[18px]">{isSkillsComplete() ? 'check' : 'extension'}</span>
              </div>
              <span className="font-semibold text-slate-900 dark:text-white">专业技能</span>
            </div>
            <span className="material-symbols-outlined text-slate-400 group-open:rotate-180 transition-transform duration-300">expand_more</span>
          </summary>
          <div className="p-4 pt-0 border-t border-slate-100 dark:border-white/5 mt-2">
            <div className="mt-4 flex flex-wrap gap-2 mb-4">
                {resumeData.skills.map((skill, index) => (
                    <span key={index} className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-primary/10 text-primary border border-primary/20 animate-in zoom-in duration-200">
                        {skill}
                        <button 
                            onClick={() => handleRemoveSkill(index)}
                            className="ml-1.5 hover:text-blue-700 flex items-center justify-center"
                        >
                            <span className="material-symbols-outlined text-[14px]">close</span>
                        </button>
                    </span>
                ))}
            </div>
            <div className="relative">
                <input 
                    value={newSkill}
                    onChange={(e) => setNewSkill(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            handleAddSkill();
                        }
                    }}
                    className="w-full rounded-lg bg-slate-50 dark:bg-[#111a22] border border-slate-200 dark:border-[#324d67] text-slate-900 dark:text-white px-4 py-3 pr-10 placeholder:text-slate-400 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all" 
                    placeholder="添加技能 (例如: 领导力)" 
                    type="text"
                />
                <button 
                    onClick={handleAddSkill}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-primary hover:bg-primary/10 p-1 rounded-md transition-colors"
                >
                    <span className="material-symbols-outlined text-[20px]">add_circle</span>
                </button>
            </div>
          </div>
        </details>
      </main>

      {/* Bottom Save Button */}
      <div className="mt-8 px-4 mb-8">
        <button 
          onClick={handleSaveAndPreview}
          disabled={isSaving}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-base font-bold text-white shadow-lg shadow-blue-500/30 hover:bg-blue-600 active:scale-[0.98] transition-all disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {isSaving ? (
            <>
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
              保存中...
            </>
          ) : (
            <>
              <span className="material-symbols-outlined">save</span>
              保存并预览
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default Editor;