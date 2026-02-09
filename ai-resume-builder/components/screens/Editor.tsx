import React, { useEffect, useRef, useState } from 'react';
import { View, ScreenProps, ResumeData, ExperienceItem } from '../../types';
import { DatabaseService } from '../../src/database-service';
import { supabase } from '../../src/supabase-client';
// Popup import removed; inline import UI only


type WizardStep = 'import' | 'personal' | 'work' | 'education' | 'projects' | 'skills' | 'summary';

const WIZARD_STEPS: { key: WizardStep; label: string; icon: string }[] = [
  { key: 'import', label: '导入简历', icon: 'upload_file' },
  { key: 'personal', label: '个人信息', icon: 'person' },
  { key: 'work', label: '工作经历', icon: 'work' },
  { key: 'education', label: '教育背景', icon: 'school' },
  { key: 'projects', label: '项目经历', icon: 'rocket_launch' },
  { key: 'skills', label: '专业技能', icon: 'extension' },
  { key: 'summary', label: '个人总结', icon: 'auto_awesome' },
];

const Editor: React.FC<ScreenProps & { wizardMode?: boolean }> = ({ setCurrentView, goBack, resumeData, setResumeData, completeness = 0, createResume, loadUserResumes, wizardMode: initialWizardMode = false, hasBottomNav = false }) => {
  const [newSkill, setNewSkill] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isPdfProcessing, setIsPdfProcessing] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const [textResume, setTextResume] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [textError, setTextError] = useState('');
  const pdfInputRef = useRef<HTMLInputElement>(null);

  // Always use wizard mode (no free edit mode)
  const wizardMode = true;
  const [currentStep, setCurrentStep] = useState<WizardStep>('import');

  const [summary, setSummary] = useState('');





  // Guard clause to prevent crash if data isn't ready
  if (!resumeData || !setResumeData) {
    return <div className="p-4 text-white">Loading data...</div>;
  }

  // --- Handlers ---

  const handleResumeImport = (importedData: Omit<ResumeData, 'id'>) => {
    console.log('导入简历数据:', importedData);

    // 合并导入的数据到当前简历
    setResumeData(prev => {
      const mergedData = { ...prev };

      // 合并个人信息（保留已有数据的优先级）
      if (importedData.personalInfo) {
        mergedData.personalInfo = {
          name: importedData.personalInfo.name || prev.personalInfo.name,
          title: importedData.personalInfo.title || prev.personalInfo.title,
          email: importedData.personalInfo.email || prev.personalInfo.email,
          phone: importedData.personalInfo.phone || prev.personalInfo.phone
        };
      }

      // 合并工作经历（添加到现有列表）
      if (importedData.workExps && importedData.workExps.length > 0) {
        mergedData.workExps = [...prev.workExps, ...importedData.workExps];
      }

      // 合并教育经历（添加到现有列表）
      if (importedData.educations && importedData.educations.length > 0) {
        mergedData.educations = [...prev.educations, ...importedData.educations];
      }

      // 合并项目经历（添加到现有列表）
      if (importedData.projects && importedData.projects.length > 0) {
        mergedData.projects = [...prev.projects, ...importedData.projects];
      }

      // 合并技能（去重）
      if (importedData.skills && importedData.skills.length > 0) {
        const existingSkills = new Set(prev.skills);
        const newSkills = importedData.skills.filter(skill => !existingSkills.has(skill));
        mergedData.skills = [...prev.skills, ...newSkills];
      }

      return mergedData;
    });

    console.log('简历导入完成');
    setTextResume('');
    setTextError('');
    setCurrentStep('personal');
  };

  const handleTextImport = async () => {
    if (!textResume.trim()) {
      setTextError('Please paste your resume text.');
      return;
    }

    setIsProcessing(true);
    setTextError('');

    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/ai/parse-resume`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          resumeText: textResume
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Resume parse failed');
      }

      const result = await response.json();
      if (result.success && result.data) {
        handleResumeImport(result.data);
      } else {
        throw new Error('Empty parse result');
      }
    } catch (err: any) {
      console.error('Resume parse failed:', err);
      setTextError(err.message || 'Resume parse failed, please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePDFImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsPdfProcessing(true);
    setPdfError('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/parse-pdf`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'PDF parse failed');
      }

      const result = await response.json();
      if (result.success && result.data) {
        handleResumeImport(result.data);
      } else {
        throw new Error('Empty parse result');
      }
    } catch (err: any) {
      console.error('PDF parse failed:', err);
      setPdfError(err.message || 'PDF parse failed, please try again.');
    } finally {
      setIsPdfProcessing(false);
      if (pdfInputRef.current) pdfInputRef.current.value = '';
    }
  };

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

  // --- Wizard Navigation ---
  const currentStepIndex = WIZARD_STEPS.findIndex(s => s.key === currentStep);
  const progress = ((currentStepIndex + 1) / WIZARD_STEPS.length) * 100;

  const handleNextStep = () => {
    if (currentStepIndex < WIZARD_STEPS.length - 1) {
      setCurrentStep(WIZARD_STEPS[currentStepIndex + 1].key);
    } else {
      // Last step - save and preview
      handleSaveAndPreview();
    }
  };

  const handlePrevStep = () => {
    if (currentStepIndex > 0) {
      setCurrentStep(WIZARD_STEPS[currentStepIndex - 1].key);
    }
  };



  return (
    <div className="flex flex-col pb-12 bg-background-light dark:bg-background-dark min-h-screen animate-in slide-in-from-right duration-300">
      <header className="sticky top-0 z-50 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md border-b border-slate-200 dark:border-[#324d67] transition-colors duration-300">
        <div className="grid grid-cols-[auto,1fr,auto] items-center px-4 py-3">
          <button
            onClick={() => {
              if (currentStepIndex === 0 && goBack) {
                goBack();
              } else {
                handlePrevStep();
              }
            }}
            className="flex items-center justify-center p-3 -ml-2 rounded-full hover:bg-slate-200 dark:hover:bg-white/5 transition-colors text-slate-700 dark:text-white"
          >
            <span className="material-symbols-outlined text-[28px]">arrow_back</span>
          </button>
          <div className="flex-1 text-center">
            <h1 className="text-base font-bold leading-tight">
              {WIZARD_STEPS[currentStepIndex].label}
            </h1>
            <p className="text-xs text-slate-500 dark:text-text-secondary">
              步骤 {currentStepIndex + 1} / {WIZARD_STEPS.length}
            </p>
          </div>
          <div className="w-12" />
        </div>

        {/* Wizard Progress Bar */}
        {wizardMode && (
          <div className="px-4 pb-3">
            <div className="h-1.5 w-full bg-slate-200 dark:bg-[#324d67] rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all duration-500 ease-out" style={{ width: `${progress}%` }}></div>
            </div>
            <div className="flex justify-between mt-3 px-1">
              {WIZARD_STEPS.map((step, idx) => (
                <button
                  key={step.key}
                  onClick={() => setCurrentStep(step.key)}
                  className={`flex flex-col items-center transition-all ${idx <= currentStepIndex ? 'text-primary' : 'text-slate-300 dark:text-slate-600'}`}
                >
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full transition-all ${idx === currentStepIndex ? 'bg-primary/10 scale-110' : ''}`}>
                    <span className={`material-symbols-outlined text-[20px] ${idx === currentStepIndex ? 'font-bold' : ''}`}>{step.icon}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* Completeness (only in free edit mode) */}
      {!wizardMode && (
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
      )}

      <main className="flex flex-col gap-4 px-4 pb-24 pt-6">
        {/* Import Step - First step of wizard */}
        {currentStep === 'import' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="bg-white dark:bg-surface-dark rounded-xl shadow-sm border border-slate-200 dark:border-[#324d67] p-6 text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-primary/10 rounded-full flex items-center justify-center">
                <span className="material-symbols-outlined text-3xl text-primary">upload_file</span>
              </div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">导入已有简历</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                上传您的简历文件或粘贴文本，AI 将自动解析并填充信息
              </p>

              <div className="space-y-3">
                <button
                  onClick={() => pdfInputRef.current?.click()}
                  className="w-full py-3 px-4 bg-primary text-white font-semibold rounded-xl flex items-center justify-center gap-2 hover:bg-blue-600 active:scale-[0.98] transition-all shadow-lg shadow-blue-500/20"
                >
                  <span className="material-symbols-outlined">description</span>
                  上传 PDF / Word 文件
                </button>
                <input
                  ref={pdfInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx"
                  onChange={handlePDFImport}
                  className="hidden"
                />

                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-slate-200 dark:bg-white/10"></div>
                  <span className="text-xs text-slate-400">或</span>
                  <div className="flex-1 h-px bg-slate-200 dark:bg-white/10"></div>
                </div>

                <textarea
                  value={textResume}
                  onChange={(e) => setTextResume(e.target.value)}
                  placeholder="请粘贴您的简历内容..."
                  className="w-full h-40 px-4 py-3 border border-slate-300 dark:border-[#324d67] rounded-lg bg-white dark:bg-[#111a22] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none resize-none"
                />
                <button
                  onClick={handleTextImport}
                  disabled={isProcessing || !textResume.trim()}
                  className="w-full py-3 bg-primary text-white rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {isProcessing ? (
                    <>
                      <span className="size-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                      处理中...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined">auto_fix_high</span>
                      智能识别
                    </>
                  )}
                </button>
                {pdfError && (
                  <div className="mt-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-sm text-red-600 dark:text-red-400">{pdfError}</p>
                  </div>
                )}
                {textError && (
                  <div className="mt-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-sm text-red-600 dark:text-red-400">{textError}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="text-center">
              <button
                onClick={() => setCurrentStep('personal')}
                className="text-sm text-slate-500 dark:text-slate-400 hover:text-primary transition-colors"
              >
                跳过，从头开始填写 →
              </button>
            </div>
          </div>
        )}

        {/* Personal Info - show when wizard step is 'personal' */}
        {currentStep === 'personal' && (
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
        )}

        {/* Work Experience - show in free edit or when wizard step is 'work' */}
        {(!wizardMode || currentStep === 'work') && (
          <details className="group bg-white dark:bg-surface-dark rounded-xl shadow-sm border border-slate-200 dark:border-[#324d67] overflow-hidden transition-all duration-300" open={wizardMode}>
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
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-medium text-slate-500 dark:text-text-secondary uppercase tracking-wider">工作内容</label>

                      </div>
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
        )}

        {/* Education - show in free edit or when wizard step is 'education' */}
        {(!wizardMode || currentStep === 'education') && (
          <details className="group bg-white dark:bg-surface-dark rounded-xl shadow-sm border border-slate-200 dark:border-[#324d67] overflow-hidden transition-all duration-300" open={wizardMode}>
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
        )}

        {/* Project Experience - show in free edit or when wizard step is 'projects' */}
        {(!wizardMode || currentStep === 'projects') && (
          <details className="group bg-white dark:bg-surface-dark rounded-xl shadow-sm border border-slate-200 dark:border-[#324d67] overflow-hidden transition-all duration-300" open={wizardMode}>
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
                        placeholder="鎷呬换瑙掕壊"
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
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-medium text-slate-500 dark:text-text-secondary uppercase tracking-wider">项目描述</label>

                      </div>
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
        )}

        {/* Skills - show in free edit or when wizard step is 'skills' */}
        {(!wizardMode || currentStep === 'skills') && (
          <details className="group bg-white dark:bg-surface-dark rounded-xl shadow-sm border border-slate-200 dark:border-[#324d67] overflow-hidden transition-all duration-300" open={wizardMode}>
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
        )}
        {/* Wizard Mode: Summary Step */}
        {wizardMode && currentStep === 'summary' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="bg-white dark:bg-surface-dark rounded-xl shadow-sm border border-slate-200 dark:border-[#324d67] p-4 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold text-slate-900 dark:text-white">个人总结</h3>

              </div>
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="例如：拥有7年前端开发经验的高级工程师，专注于React生态..."
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-[#334155] bg-slate-50 dark:bg-[#111a22] text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all min-h-[150px]"
              />
            </div>
            <div className="bg-green-50 dark:bg-green-900/10 p-4 rounded-lg flex items-start space-x-3 text-sm text-green-600 dark:text-green-400">
              <span className="material-symbols-outlined text-lg">check_circle</span>
              <p>这是最后一步了！完成后，我们将保存简历并跳转到预览页面。</p>
            </div>
          </div>
        )}
      </main>

      {/* Wizard Mode: Bottom Navigation */}
      {wizardMode && (
        <div className={`fixed left-0 right-0 bg-white dark:bg-surface-dark border-t border-slate-200 dark:border-[#324d67] p-4 flex gap-4 max-w-md mx-auto transition-all duration-300 ${hasBottomNav ? 'bottom-[calc(76px+env(safe-area-inset-bottom))]' : 'bottom-0 pb-[calc(1rem+env(safe-area-inset-bottom))]'}`}>
          {currentStepIndex > 0 && (
            <button
              onClick={handlePrevStep}
              className="flex-1 py-3 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-white font-semibold hover:bg-slate-50 dark:hover:bg-white/5 transition-all"
            >
              上一步
            </button>
          )}
          <button
            onClick={handleNextStep}
            disabled={isSaving}
            className="flex-1 py-3 rounded-xl bg-primary text-white font-semibold shadow-lg shadow-blue-500/30 hover:bg-blue-600 active:scale-[0.98] transition-all disabled:opacity-70"
          >
            {currentStepIndex === WIZARD_STEPS.length - 1 ? (isSaving ? '保存中...' : '完成并预览') : '下一步'}
          </button>
        </div>
      )}

      {/* Bottom Save Button (only in free edit mode) */}
      {!wizardMode && (
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
                保存并预览              </>
            )}
          </button>
        </div>
      )}

    </div>
  );
};

export default Editor;


