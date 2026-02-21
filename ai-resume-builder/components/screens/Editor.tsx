import React, { useEffect, useRef, useState } from 'react';
import { View, ScreenProps, ResumeData, WorkExperience, Education, Project } from '../../types';
import { DatabaseService } from '../../src/database-service';
import { supabase } from '../../src/supabase-client';
import { toSkillList, mergeSkills } from '../../src/skill-utils';
import { buildResumeTitle } from '../../src/resume-utils';
import {
  PERSONAL_FIELD_LIMITS,
  WORK_FIELD_LIMITS,
  EDUCATION_FIELD_LIMITS,
  PROJECT_FIELD_LIMITS,
  SKILL_MAX_CHARS,
  SUMMARY_MAX_CHARS,
  clampByLimit,
} from '../../src/editor-field-limits';
import ImportStep from '../editor/steps/ImportStep';
import PersonalStep from '../editor/steps/PersonalStep';
import WorkStep from '../editor/steps/WorkStep';
import EducationStep from '../editor/steps/EducationStep';
import ProjectsStep from '../editor/steps/ProjectsStep';
import SkillsStep from '../editor/steps/SkillsStep';
import SummaryStep from '../editor/steps/SummaryStep';
import { useEditorDraftPersistence } from '../editor/hooks/useEditorDraftPersistence';
import { useEditorImportFlow } from '../editor/hooks/useEditorImportFlow';
import { useEditorValidation } from '../editor/hooks/useEditorValidation';
import { useEditorWizardState } from '../editor/hooks/useEditorWizardState';
// Popup import removed; inline import UI only
import { useAppContext } from '../../src/app-context';
import { selectCompleteness, useAppStore } from '../../src/app-store';
import BackButton from '../shared/BackButton';


type WizardStep = 'import' | 'personal' | 'work' | 'education' | 'projects' | 'skills' | 'summary';

const Editor: React.FC<ScreenProps & { wizardMode?: boolean }> = ({ wizardMode: initialWizardMode = false }) => {
  const navigateToView = useAppContext((s) => s.navigateToView);
  const goBack = useAppContext((s) => s.goBack);
  const createResume = useAppContext((s) => s.createResume);
  const loadUserResumes = useAppContext((s) => s.loadUserResumes);
  const currentUser = useAppContext((s) => s.currentUser);
  const resumeData = useAppStore((state) => state.resumeData);
  const setResumeData = useAppStore((state) => state.setResumeData);
  const setAllResumes = useAppStore((state) => state.setAllResumes);
  const completeness = useAppStore(selectCompleteness);
  const hasBottomNav = false;
  const [newSkill, setNewSkill] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const autosaveIntervalRef = useRef<number | null>(null);
  const lastAutosavedRef = useRef<string>('');
  const latestResumeDataRef = useRef<ResumeData>(resumeData);
  const [isAutosaving, setIsAutosaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [validationStep, setValidationStep] = useState<WizardStep | null>(null);
  const [validationReason, setValidationReason] = useState<'missing' | 'format'>('missing');
  const [formatErrors, setFormatErrors] = useState<Record<string, string>>({});
  const [showClearPageConfirm, setShowClearPageConfirm] = useState(false);
  const lastNormalizedResumeIdRef = useRef<number | null>(null);
  const draftSaveTimerRef = useRef<number | null>(null);

  // Always use wizard mode (no free edit mode)
  const wizardMode = true;

  const [summary, setSummary] = useState(clampByLimit(resumeData?.summary || '', SUMMARY_MAX_CHARS));
  const {
    WIZARD_STEPS,
    currentStep,
    setCurrentStep,
    currentStepIndex,
    progress,
    hasTouchedProjects,
    setHasTouchedProjects,
    hasImportedResume,
    setHasImportedResume,
    showImportSuccess,
    setShowImportSuccess,
    suppressStepResetOnNextIdChangeRef,
  } = useEditorWizardState(resumeData);
  const {
    editorDraftKey,
    hasMeaningfulContent,
    persistLocalDraft,
  } = useEditorDraftPersistence({
    currentUserId: currentUser?.id,
    resumeData,
    summary,
    setSummary,
    setResumeData,
    onDraftRestored: () => {
      setHasImportedResume(true);
      setCurrentStep('personal');
    },
  });
  const {
    validatePersonalFormats,
    isPersonalInfoComplete,
    isWorkExperienceComplete,
    isEducationComplete,
    isSkillsComplete,
    isProjectsComplete,
    isStepComplete,
    isStepRequired,
    isStepMissing,
  } = useEditorValidation({
    resumeData,
    summary,
    hasTouchedProjects,
    hasImportedResume,
  });

  useEffect(() => {
    latestResumeDataRef.current = resumeData;
  }, [resumeData]);

  async function triggerManualSave(data: ResumeData) {
    if (!data.id) {
      persistLocalDraft(data, { onStatusChange: setLastSavedAt });
      return;
    }
    setIsAutosaving(true);
    try {
      const title = `${data.personalInfo.name || '未命名'}的简历`;
      const result = await DatabaseService.updateResume(String(data.id), {
        title: title,
        resume_data: data,
      });

      if (result.success) {
        lastAutosavedRef.current = JSON.stringify(data);
        const now = new Date();
        const timeLabel = now.toLocaleTimeString('zh-CN', {
          hour: '2-digit', minute: '2-digit'
        });
        setLastSavedAt(timeLabel);
        if (loadUserResumes) loadUserResumes();
      }
    } catch (e) {
      console.error('Manual save triggered by import failed:', e);
    } finally {
      setIsAutosaving(false);
    }
  }

  const {
    textResume,
    setTextResume,
    isProcessing,
    textError,
    isPdfProcessing,
    pdfError,
    pdfInputRef,
    handleTextImport,
    handlePDFImport,
  } = useEditorImportFlow({
    resumeData,
    setResumeData,
    setSummary,
    setCurrentStep,
    setHasImportedResume,
    setShowImportSuccess,
    triggerManualSave,
  });

  useEffect(() => {
    if (!resumeData?.id || !setResumeData) return;
    if (lastNormalizedResumeIdRef.current === resumeData.id) return;

    const normalizeDateRange = (start?: string, end?: string) => {
      const s = (start || '').trim();
      const e = (end || '').trim();
      if (s && e) return `${s} - ${e}`;
      return s || e || '';
    };

    const parseDateRange = (date?: string) => {
      const raw = (date || '').trim();
      if (!raw) return { startDate: '', endDate: '' };
      const parts = raw.split(/\s*[-–—]\s*/);
      if (parts.length >= 2) {
        return { startDate: parts[0], endDate: parts.slice(1).join(' - ') };
      }
      return { startDate: raw, endDate: '' };
    };

    const mergeDateFields = (item: any) => {
      const existingStart = (item?.startDate || '').trim();
      const existingEnd = (item?.endDate || '').trim();
      const parsed = parseDateRange(item?.date);
      return {
        startDate: existingStart || parsed.startDate,
        endDate: existingEnd || parsed.endDate,
      };
    };

    const normalizeWork = (exp: any) => ({
      ...exp,
      ...mergeDateFields(exp),
      title: exp?.title || exp?.company || '',
      subtitle: exp?.subtitle || exp?.position || '',
      date: exp?.date || normalizeDateRange(exp?.startDate, exp?.endDate),
      company: exp?.company || exp?.title || '',
      position: exp?.position || exp?.subtitle || '',
    });

    const normalizeEdu = (edu: any) => ({
      ...edu,
      ...mergeDateFields(edu),
      title: edu?.title || edu?.school || '',
      subtitle: edu?.subtitle || edu?.major || '',
      date: edu?.date || normalizeDateRange(edu?.startDate, edu?.endDate),
      school: edu?.school || edu?.title || '',
      degree: edu?.degree || '',
      major: edu?.major || edu?.subtitle || '',
    });

    const normalizeProjects = (proj: any) => ({
      ...proj,
      ...mergeDateFields(proj),
      title: proj?.title || '',
      subtitle: proj?.subtitle || proj?.role || '',
      date: proj?.date || normalizeDateRange(proj?.startDate, proj?.endDate),
      role: proj?.role || proj?.subtitle || '',
    });

    setResumeData(prev => ({
      ...prev,
      workExps: (prev.workExps || []).map(normalizeWork),
      educations: (prev.educations || []).map(normalizeEdu),
      projects: (prev.projects || []).map(normalizeProjects),
      // Also normalize skills once per resume load to fix historical bad tokens like "(PowerBI" / "Tableau)" / "B Test)".
      skills: toSkillList(prev.skills),
    }));

    lastNormalizedResumeIdRef.current = resumeData.id;
  }, [resumeData?.id]);

  useEffect(() => {
    if (!resumeData?.id) return;

    if (autosaveIntervalRef.current) {
      window.clearInterval(autosaveIntervalRef.current);
    }

    // Initialize baseline snapshot for this resume to avoid unnecessary writes.
    lastAutosavedRef.current = JSON.stringify(latestResumeDataRef.current);

    autosaveIntervalRef.current = window.setInterval(async () => {
      try {
        const currentData = latestResumeDataRef.current;
        if (!currentData?.id) return;
        const serialized = JSON.stringify(currentData);
        if (serialized === lastAutosavedRef.current) return;
        setIsAutosaving(true);
        const saveResult = await DatabaseService.updateResume(String(currentData.id), {
          resume_data: currentData,
          updated_at: new Date().toISOString()
        });
        if (!saveResult?.success) {
          throw saveResult?.error || new Error('Auto-save failed');
        }
        lastAutosavedRef.current = serialized;
        const now = new Date();
        const timeLabel = now.toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit'
        });
        setLastSavedAt(timeLabel);
        if (setAllResumes) {
          const formatDateTime = (dateString: string) => {
            if (!dateString) return '时间未知';
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return '时间格式错误';
            const beijingTime = new Date(date.getTime() + (8 * 60 * 60 * 1000) + (date.getTimezoneOffset() * 60 * 1000));
            const year = beijingTime.getFullYear();
            const month = String(beijingTime.getMonth() + 1).padStart(2, '0');
            const day = String(beijingTime.getDate()).padStart(2, '0');
            const hours = String(beijingTime.getHours()).padStart(2, '0');
            const minutes = String(beijingTime.getMinutes()).padStart(2, '0');
            const seconds = String(beijingTime.getSeconds()).padStart(2, '0');
            return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
          };
          const formatted = formatDateTime(now.toISOString()).replace(/[^0-9\-:\s]/g, '');
          setAllResumes((prev: any) => (prev || []).map((r: any) =>
            r.id === currentData.id ? { ...r, date: formatted } : r
          ));
        }
      } catch (error) {
        console.error('Auto-save failed:', error);
      } finally {
        setIsAutosaving(false);
      }
    }, 30000);

    return () => {
      if (autosaveIntervalRef.current) {
        window.clearInterval(autosaveIntervalRef.current);
      }
    };
  }, [resumeData?.id]);

  // Draft auto-save for resumes not yet persisted to DB.
  useEffect(() => {
    if (resumeData?.id) return;
    if (!hasMeaningfulContent(resumeData)) return;

    if (draftSaveTimerRef.current) {
      window.clearTimeout(draftSaveTimerRef.current);
    }
    draftSaveTimerRef.current = window.setTimeout(() => {
      persistLocalDraft({ ...resumeData, summary }, { onStatusChange: setLastSavedAt });
    }, 800);

    return () => {
      if (draftSaveTimerRef.current) {
        window.clearTimeout(draftSaveTimerRef.current);
      }
    };
  }, [resumeData, summary, editorDraftKey]);





  // Guard clause to prevent crash if data isn't ready
  if (!resumeData || !setResumeData) {
    return <div className="p-4 text-white">数据加载中...</div>;
  }

  // --- Handlers ---

  const handleInfoChange = (field: keyof ResumeData['personalInfo'] | 'gender', value: string) => {
    const personalLimit = field !== 'gender'
      ? (PERSONAL_FIELD_LIMITS as Record<string, number>)[field]
      : undefined;
    const nextValue = typeof personalLimit === 'number' ? clampByLimit(value, personalLimit) : value;

    if (field === 'gender') {
      setResumeData(prev => ({
        ...prev,
        gender: nextValue
      }));
    } else {
      setResumeData(prev => ({
        ...prev,
        personalInfo: { ...prev.personalInfo, [field]: nextValue }
      }));
    }
    if (validationStep === 'personal') {
      setFormatErrors(prev => {
        const next = { ...prev };
        if (field !== 'gender') {
          const updated: ResumeData = {
            ...resumeData,
            personalInfo: { ...resumeData.personalInfo, [field]: nextValue }
          };
          return validatePersonalFormats(updated);
        }
        return next;
      });
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

  type EditableSection = 'workExps' | 'educations' | 'projects';
  type ItemBySection = { workExps: WorkExperience; educations: Education; projects: Project };

  // Helper for updating fields in array items
  const updateItem = <S extends EditableSection>(section: S, id: number, field: keyof ItemBySection[S], value: string) => {
    const limitMap =
      section === 'workExps'
        ? WORK_FIELD_LIMITS
        : section === 'educations'
          ? EDUCATION_FIELD_LIMITS
          : PROJECT_FIELD_LIMITS;
    const key = String(field);
    const fieldLimit = (limitMap as Record<string, number>)[key];
    const nextValue = typeof fieldLimit === 'number' ? clampByLimit(value, fieldLimit) : value;

    setResumeData(prev => ({
      ...prev,
      [section]: (prev[section] as Array<ItemBySection[S]>).map(item => {
        if (item.id !== id) return item;

        const next: any = { ...item, [field]: nextValue };

        // Keep alias fields in sync so preview/export (which may read company/school)
        // always reflect latest editor input.
        if (section === 'workExps') {
          if (field === 'title') next.company = nextValue;
          if (field === 'subtitle') next.position = nextValue;
        } else if (section === 'educations') {
          if (field === 'title') next.school = nextValue;
          if (field === 'subtitle') next.major = nextValue;
        } else if (section === 'projects') {
          if (field === 'subtitle') next.role = nextValue;
        }

        if (field === 'startDate' || field === 'endDate') {
          const s = String(next.startDate || '').trim();
          const e = String(next.endDate || '').trim();
          next.date = (s && e) ? `${s} - ${e}` : (s || e || '');
        }

        return next as ItemBySection[S];
      }),
    }));
  };

  const handleAddSkill = () => {
    const tokens = toSkillList(clampByLimit(newSkill, SKILL_MAX_CHARS)).map((token) => clampByLimit(token, SKILL_MAX_CHARS));
    if (!tokens.length) {
      setNewSkill('');
      return;
    }
    setResumeData(prev => ({
      ...prev,
      skills: mergeSkills(prev.skills, tokens)
    }));
    setNewSkill('');
  };

  const handleSaveAndPreview = async () => {
    setIsSaving(true);
    setIsAutosaving(true);
    try {
      const latestData: ResumeData = {
        ...resumeData,
        summary: summary ?? resumeData?.summary ?? '',
      };
      console.log('Saving resume with data:', latestData);

      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError || !user) {
        console.error('User not authenticated:', userError);
        alert('请先登录');
        return;
      }

      console.log('Current user:', user);

      let result;
      const title = buildResumeTitle(
        latestData.resumeTitle,
        latestData,
        latestData.lastJdText || '',
        true,
        latestData.targetCompany
      );

      // Check if we're updating an existing resume or creating a new one
      if (latestData.id) {
        // Update existing resume
        console.log('Updating existing resume:', latestData.id);
        result = await DatabaseService.updateResume(String(latestData.id), {
          title: title,
          resume_data: latestData,
        });
      } else {
        // Create new resume
        console.log('Creating new resume for user:', user.id);
        result = await DatabaseService.createResume(user.id, title, latestData);
      }

      console.log('Save result:', result);

      if (result.success) {
        const savedId = latestData.id || result.data?.id;
        const savedData: ResumeData = {
          ...latestData,
          ...(savedId ? { id: savedId } : {}),
          resumeTitle: title,
        };
        // Avoid transient jump back to "personal" when id changes during save->preview flow.
        suppressStepResetOnNextIdChangeRef.current = true;
        setResumeData(savedData);

        // Reload resumes to get the latest list
        if (loadUserResumes) {
          await loadUserResumes();
        }

        const now = new Date();
        const timeLabel = now.toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit'
        });
        setLastSavedAt(timeLabel);
        lastAutosavedRef.current = JSON.stringify(savedData);
        try {
          localStorage.removeItem(editorDraftKey);
        } catch {
          // ignore local draft cleanup errors
        }

        console.log('Resume saved successfully, navigating to preview');
        // Navigate to preview
        navigateToView(View.PREVIEW);
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
      setIsAutosaving(false);
    }
  };

  const handleRemoveSkill = (index: number) => {
    setResumeData(prev => ({
      ...prev,
      skills: prev.skills.filter((_, i) => i !== index)
    }));
  };

  const applyResumeAndPersist = (nextData: ResumeData) => {
    setResumeData(nextData);
    // Clearing data should be persisted immediately; relying on 30s autosave can cause stale restore on re-entry.
    triggerManualSave(nextData);
  };

  const handleClearCurrentStep = () => {
    setShowClearPageConfirm(false);
    const next = { ...resumeData };
    switch (currentStep) {
      case 'personal':
        next.personalInfo = {
          name: '', title: '', email: '', phone: '', avatar: '', location: '', age: '', summary: resumeData.personalInfo.summary
        };
        next.gender = '';
        break;
      case 'work':
        next.workExps = [];
        break;
      case 'education':
        next.educations = [];
        break;
      case 'projects':
        next.projects = [];
        setHasTouchedProjects(false);
        break;
      case 'skills':
        next.skills = [];
        setNewSkill('');
        break;
      case 'summary':
        next.summary = '';
        setSummary('');
        break;
    }
    applyResumeAndPersist(next);
  };

  const handleClearAllData = () => {
    const clearedData: ResumeData = {
      id: resumeData.id,
      resumeTitle: resumeData.resumeTitle,
      personalInfo: { name: '', title: '', email: '', phone: '' },
      workExps: [],
      educations: [],
      projects: [],
      skills: [],
      summary: '',
      gender: '',
    };
    applyResumeAndPersist(clearedData);
    setSummary('');
    setHasTouchedProjects(false);
    setHasImportedResume(false);
    setTextResume('');
    setCurrentStep('import');
  };

  // --- Wizard Navigation ---
  const isCurrentStepComplete = isStepComplete(currentStep);

  const handleNextStep = () => {
    if (isStepRequired(currentStep) && !isCurrentStepComplete) {
      setValidationReason('missing');
      setValidationStep(currentStep);
      setShowValidationModal(true);
      return;
    }
    if (currentStep === 'personal') {
      const errors = validatePersonalFormats(resumeData);
      if (Object.keys(errors).length > 0) {
        setValidationReason('format');
        setFormatErrors(errors);
        setValidationStep('personal');
        setShowValidationModal(true);
        return;
      }
      setFormatErrors({});
    }
    if (currentStep === 'projects') {
      setHasTouchedProjects(true);
    }
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
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-white/5 transition-colors duration-300">
        <div className="relative grid grid-cols-[auto,1fr,auto] items-center px-4 py-3">
          <BackButton
            onClick={() => {
              if (currentStepIndex === 0 && goBack) {
                goBack();
              } else {
                handlePrevStep();
              }
            }}
            className="-ml-2"
          />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <h1 className="text-lg font-bold leading-tight">
                {WIZARD_STEPS[currentStepIndex].label}
              </h1>
              <p className="text-xs text-slate-500 dark:text-text-secondary">
                步骤 {currentStepIndex + 1} / {WIZARD_STEPS.length}
              </p>
            </div>
          </div>
          <div className="text-right flex flex-col items-end min-w-[32px] sm:min-w-[96px]">
            <span className="hidden sm:block text-sm text-slate-500 dark:text-slate-400">
              {isAutosaving ? '保存中...' : (lastSavedAt ? '已自动保存' : '未保存')}
            </span>
            {lastSavedAt && (
              <span className="hidden sm:block text-xs text-slate-400 dark:text-slate-500">
                时间 {lastSavedAt}
              </span>
            )}

            {/* Clear Page Button - Top Right */}
            <button
              onClick={() => setShowClearPageConfirm(true)}
              className={`mt-0 sm:mt-1 p-2 sm:px-3 sm:py-1 rounded-full border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all flex items-center gap-1.5 ${currentStep === 'import' ? 'opacity-0 pointer-events-none' : ''}`}
              title="清空当前页"
            >
              <span className="material-symbols-outlined text-[20px] sm:text-[16px]">delete</span>
              <span className="hidden sm:inline text-xs">清空本页</span>
            </button>
          </div>
        </div>

        {/* Wizard Progress Bar */}
        {wizardMode && (
          <div className="px-4 pb-3">
            <div className="h-1.5 w-full bg-slate-200 dark:bg-[#324d67] rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all duration-500 ease-out" style={{ width: `${progress}%` }}></div>
            </div>
            <div className="flex justify-between mt-3 px-1">
              {WIZARD_STEPS.map((step, idx) => {
                const stepComplete = isStepComplete(step.key);
                const isActive = idx === currentStepIndex;
                const canClick = hasImportedResume
                  ? true
                  : (step.key === 'projects'
                    ? (isActive || hasTouchedProjects)
                    : (isActive || stepComplete));
                const isMissing = isStepMissing(step.key);
                return (
                  <button
                    key={step.key}
                    onClick={() => {
                      if (canClick) setCurrentStep(step.key);
                    }}
                    disabled={!canClick}
                    className={`flex flex-col items-center transition-all ${isMissing
                      ? 'text-red-500'
                      : (canClick ? 'text-primary' : 'text-slate-300 dark:text-slate-600')
                      } ${!canClick ? 'cursor-not-allowed opacity-60' : ''}`}
                  >
                    <div className={`flex items-center justify-center w-8 h-8 rounded-full transition-all ${isMissing
                      ? 'bg-red-50 dark:bg-red-900/20'
                      : (isActive ? 'bg-primary/10 scale-110' : '')
                      }`}>
                      <span className={`material-symbols-outlined text-[20px] ${isActive ? 'font-bold' : ''}`}>{step.icon}</span>
                    </div>
                  </button>
                );
              })}
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
            isPdfProcessing={isPdfProcessing}
            textError={textError}
            pdfError={pdfError}
            onPdfImport={handlePDFImport}
            pdfInputRef={pdfInputRef}
            onSkip={() => setCurrentStep('personal')}
            onClearAll={handleClearAllData}
          />
        )}

        {/* Personal Info - show when wizard step is 'personal' */}
        {currentStep === 'personal' && (
          <PersonalStep
            resumeData={resumeData}
            isComplete={isPersonalInfoComplete()}
            onInfoChange={handleInfoChange}
            showValidation={validationStep === 'personal'}
            formatErrors={formatErrors}
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
            showValidation={validationStep === 'work'}
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
            showValidation={validationStep === 'education'}
          />
        )}

        {/* Project Experience - show in free edit or when wizard step is 'projects' */}
        {(!wizardMode || currentStep === 'projects') && (
          <ProjectsStep
            resumeData={resumeData}
            isComplete={isProjectsComplete()}
            wizardMode={wizardMode}
            onAdd={() => {
              setHasTouchedProjects(true);
              addItem('projects');
            }}
            onRemove={(id) => {
              setHasTouchedProjects(true);
              removeItem('projects', id);
            }}
            onUpdate={(id, field, value) => {
              setHasTouchedProjects(true);
              updateItem('projects', id, field, value);
            }}
          />
        )}

        {/* Skills - show in free edit or when wizard step is 'skills' */}
        {(!wizardMode || currentStep === 'skills') && (
          <SkillsStep
            resumeData={resumeData}
            isComplete={isSkillsComplete()}
            wizardMode={wizardMode}
            newSkill={newSkill}
            onNewSkillChange={(value) => setNewSkill(clampByLimit(value, SKILL_MAX_CHARS))}
            onAddSkill={handleAddSkill}
            onRemoveSkill={handleRemoveSkill}
            showValidation={validationStep === 'skills'}
          />
        )}

        {/* Wizard Mode: Summary Step */}
        {wizardMode && currentStep === 'summary' && (
          <SummaryStep
            summary={summary}
            onSummaryChange={(value) => setSummary(clampByLimit(value, SUMMARY_MAX_CHARS))}
            showValidation={validationStep === 'summary'}
          />
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
              className="flex-1 py-3 rounded-xl bg-primary text-white font-semibold shadow-lg shadow-blue-500/30 hover:bg-blue-600 active:scale-[0.98] transition-all disabled:opacity-70 disabled:cursor-not-allowed"
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

      {showImportSuccess && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-6">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-[#324d67] shadow-xl p-6 text-center">
            <div className="mx-auto mb-3 size-12 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 flex items-center justify-center">
              <span className="material-symbols-outlined text-[22px]">check_circle</span>
            </div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">导入成功</h3>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">请检查各信息是否完整</p>
            <button
              onClick={() => setShowImportSuccess(false)}
              className="mt-5 w-full rounded-xl bg-primary text-white py-2.5 font-semibold hover:bg-blue-600 active:scale-[0.98] transition-all"
            >
              我知道了
            </button>
          </div>
        </div>
      )}

      {showValidationModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-6">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-[#324d67] shadow-xl p-6 text-center">
            <div className="mx-auto mb-3 size-12 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 flex items-center justify-center">
              <span className="material-symbols-outlined text-[22px]">error</span>
            </div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              {validationReason === 'format' ? '字段格式有误' : '未填完必填字段'}
            </h3>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              {validationReason === 'format' ? '请修正标红内容后再继续' : '请补充标红内容后再继续'}
            </p>
            <button
              onClick={() => setShowValidationModal(false)}
              className="mt-5 w-full rounded-xl bg-primary text-white py-2.5 font-semibold hover:bg-blue-600 active:scale-[0.98] transition-all"
            >
              我知道了
            </button>
          </div>
        </div>
      )}

      {/* Clear Page Confirmation Modal */}
      {showClearPageConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-6">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-[#324d67] shadow-xl p-6 text-center animate-in zoom-in-95 duration-200">
            <div className="mx-auto mb-3 size-12 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 flex items-center justify-center">
              <span className="material-symbols-outlined text-[24px]">delete_forever</span>
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">确认清空当前页？</h3>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              此操作将清空“{WIZARD_STEPS.find(s => s.key === currentStep)?.label}”的所有内容，且无法撤销。
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowClearPageConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 font-semibold hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleClearCurrentStep}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-semibold hover:bg-red-600 active:scale-[0.98] transition-all shadow-lg shadow-red-500/20"
              >
                确认清空
              </button>
            </div>
          </div>
        </div>
      )}

    </div >
  );
};

export default Editor;
