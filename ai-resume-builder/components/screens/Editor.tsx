import React, { useEffect, useRef, useState } from 'react';
import { View, ScreenProps, ResumeData, ExperienceItem } from '../../types';
import { DatabaseService } from '../../src/database-service';
import { supabase } from '../../src/supabase-client';
import ImportStep from '../editor/steps/ImportStep';
import PersonalStep from '../editor/steps/PersonalStep';
import WorkStep from '../editor/steps/WorkStep';
import EducationStep from '../editor/steps/EducationStep';
import ProjectsStep from '../editor/steps/ProjectsStep';
import SkillsStep from '../editor/steps/SkillsStep';
import SummaryStep from '../editor/steps/SummaryStep';
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

  const [summary, setSummary] = useState(resumeData?.summary || '');

  // Sync summary state to resumeData whenever it changes
  useEffect(() => {
    if (summary !== resumeData?.summary) {
      setResumeData(prev => ({ ...prev, summary }));
    }
  }, [summary]);

  // Sync resumeData.summary to local state if it changes externally
  useEffect(() => {
    if (resumeData?.summary && resumeData.summary !== summary) {
      setSummary(resumeData.summary);
    }
  }, [resumeData?.summary]);





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
          phone: importedData.personalInfo.phone || prev.personalInfo.phone,
          avatar: importedData.personalInfo.avatar || prev.personalInfo.avatar,
          location: importedData.personalInfo.location || prev.personalInfo.location,
          summary: importedData.personalInfo.summary || prev.personalInfo.summary
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

      // Merge summary (top-level)
      if (importedData.summary) {
        mergedData.summary = importedData.summary;
      }

      // Merge gender if provided
      if (importedData.gender) {
        mergedData.gender = importedData.gender;
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
    return Boolean(personalInfo.name && personalInfo.title && personalInfo.email && personalInfo.phone && resumeData.gender);
  };

  const isWorkExperienceComplete = () => {
    return resumeData.workExps.length > 0 && resumeData.workExps.some(exp => Boolean(exp.title && exp.subtitle && exp.date));
  };

  const isEducationComplete = () => {
    return resumeData.educations.length > 0 && resumeData.educations.some(edu => Boolean(edu.title && edu.subtitle && edu.date));
  };

  const isSkillsComplete = () => {
    // Skills are optional, only show check if user has added skills
    return resumeData.skills.length > 0;
  };

  const isProjectsComplete = () => {
    // Projects are optional, only show check if user has added projects
    return resumeData.projects.length > 0 && resumeData.projects.some(proj => Boolean(proj.title && proj.description));
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
          <ImportStep
            textResume={textResume}
            onTextResumeChange={setTextResume}
            onTextImport={handleTextImport}
            isProcessing={isProcessing}
            textError={textError}
            pdfError={pdfError}
            onPdfImport={handlePDFImport}
            pdfInputRef={pdfInputRef}
            onSkip={() => setCurrentStep('personal')}
          />
        )}

        {/* Personal Info - show when wizard step is 'personal' */}
        {currentStep === 'personal' && (
          <PersonalStep
            resumeData={resumeData}
            isComplete={isPersonalInfoComplete()}
            onInfoChange={handleInfoChange}
          />
        )}



        {/* Work Experience - show in free edit or when wizard step is 'work' */}
        {(!wizardMode || currentStep === 'work') && (
          <WorkStep
            resumeData={resumeData}
            isComplete={isWorkExperienceComplete()}
            wizardMode={wizardMode}
            onAdd={() => addItem('workExps')}
            onRemove={(id) => removeItem('workExps', id)}
            onUpdate={(id, field, value) => updateItem('workExps', id, field, value)}
          />
        )}

        {/* Education - show in free edit or when wizard step is 'education' */}
        {(!wizardMode || currentStep === 'education') && (
          <EducationStep
            resumeData={resumeData}
            isComplete={isEducationComplete()}
            wizardMode={wizardMode}
            onAdd={() => addItem('educations')}
            onRemove={(id) => removeItem('educations', id)}
            onUpdate={(id, field, value) => updateItem('educations', id, field, value)}
          />
        )}

        {/* Project Experience - show in free edit or when wizard step is 'projects' */}
        {(!wizardMode || currentStep === 'projects') && (
          <ProjectsStep
            resumeData={resumeData}
            isComplete={isProjectsComplete()}
            wizardMode={wizardMode}
            onAdd={() => addItem('projects')}
            onRemove={(id) => removeItem('projects', id)}
            onUpdate={(id, field, value) => updateItem('projects', id, field, value)}
          />
        )}

        {/* Skills - show in free edit or when wizard step is 'skills' */}
        {(!wizardMode || currentStep === 'skills') && (
          <SkillsStep
            resumeData={resumeData}
            isComplete={isSkillsComplete()}
            wizardMode={wizardMode}
            newSkill={newSkill}
            onNewSkillChange={setNewSkill}
            onAddSkill={handleAddSkill}
            onRemoveSkill={handleRemoveSkill}
          />
        )}

        {/* Wizard Mode: Summary Step */}
        {wizardMode && currentStep === 'summary' && (
          <SummaryStep summary={summary} onSummaryChange={setSummary} />
        )}
      </main>

      {/* Wizard Mode: Bottom Navigation */}
      {
        wizardMode && (
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
        )
      }

      {/* Bottom Save Button (only in free edit mode) */}
      {
        !wizardMode && (
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
        )
      }

    </div >
  );
};

export default Editor;


