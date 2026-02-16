import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, ScreenProps, ResumeData, WorkExperience, Education, Project } from '../../types';
import { DatabaseService } from '../../src/database-service';
import { supabase } from '../../src/supabase-client';
import { buildApiUrl } from '../../src/api-config';
import { toSkillList, mergeSkills } from '../../src/skill-utils';
import { buildResumeTitle } from '../../src/resume-utils';
import ImportStep from '../editor/steps/ImportStep';
import PersonalStep from '../editor/steps/PersonalStep';
import WorkStep from '../editor/steps/WorkStep';
import EducationStep from '../editor/steps/EducationStep';
import ProjectsStep from '../editor/steps/ProjectsStep';
import SkillsStep from '../editor/steps/SkillsStep';
import SummaryStep from '../editor/steps/SummaryStep';
// Popup import removed; inline import UI only
import { useAppContext } from '../../src/app-context';


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

const Editor: React.FC<ScreenProps & { wizardMode?: boolean }> = ({ wizardMode: initialWizardMode = false }) => {
  const { navigateToView, goBack, resumeData, setResumeData, setAllResumes, completeness, createResume, loadUserResumes, currentUser } = useAppContext();
  const hasBottomNav = false;
  const [newSkill, setNewSkill] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isPdfProcessing, setIsPdfProcessing] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const [textResume, setTextResume] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [textError, setTextError] = useState('');
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const autosaveIntervalRef = useRef<number | null>(null);
  const lastAutosavedRef = useRef<string>('');
  const latestResumeDataRef = useRef<ResumeData>(resumeData);
  const [isAutosaving, setIsAutosaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [hasTouchedProjects, setHasTouchedProjects] = useState(false);
  const [hasImportedResume, setHasImportedResume] = useState(false);
  const [showImportSuccess, setShowImportSuccess] = useState(false);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [validationStep, setValidationStep] = useState<WizardStep | null>(null);
  const [validationReason, setValidationReason] = useState<'missing' | 'format'>('missing');
  const [formatErrors, setFormatErrors] = useState<Record<string, string>>({});
  const lastNormalizedResumeIdRef = useRef<number | null>(null);
  const draftSaveTimerRef = useRef<number | null>(null);
  const editorDraftKey = useMemo(
    () => `editor_resume_draft_${currentUser?.id || 'anonymous'}`,
    [currentUser?.id]
  );

  // Always use wizard mode (no free edit mode)
  const wizardMode = true;
  const [currentStep, setCurrentStep] = useState<WizardStep>('import');

  const [summary, setSummary] = useState(resumeData?.summary || '');

  useEffect(() => {
    latestResumeDataRef.current = resumeData;
  }, [resumeData]);

  const hasMeaningfulContent = (data: ResumeData) => {
    const p = data?.personalInfo || ({} as any);
    return Boolean(
      (p.name || '').trim() ||
      (p.title || '').trim() ||
      (p.email || '').trim() ||
      (p.phone || '').trim() ||
      (data.summary || '').trim() ||
      (data.skills || []).length > 0 ||
      (data.workExps || []).length > 0 ||
      (data.educations || []).length > 0 ||
      (data.projects || []).length > 0
    );
  };

  const persistLocalDraft = (data: ResumeData, options?: { updateStatus?: boolean }) => {
    try {
      localStorage.setItem(editorDraftKey, JSON.stringify({
        updatedAt: new Date().toISOString(),
        data: { ...data, id: undefined }
      }));
      if (options?.updateStatus !== false) {
        const now = new Date();
        const timeLabel = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        setLastSavedAt(timeLabel);
      }
    } catch (error) {
      console.warn('Failed to persist local editor draft:', error);
    }
  };

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

  useEffect(() => {
    // Only restore draft for "new resume" flow.
    if (resumeData?.id) return;
    if (hasMeaningfulContent(resumeData)) return;
    try {
      const raw = localStorage.getItem(editorDraftKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const draftData = parsed?.data;
      if (!draftData) return;
      setResumeData((prev) => ({
        ...prev,
        ...draftData,
        id: undefined,
      }));
      if (typeof draftData.summary === 'string') {
        setSummary(draftData.summary);
      }
      setHasImportedResume(true);
      setCurrentStep('personal');
    } catch (error) {
      console.warn('Failed to restore local editor draft:', error);
    }
  }, [editorDraftKey, resumeData?.id]);

  useEffect(() => {
    if (resumeData?.id) {
      setCurrentStep('personal');
      setHasImportedResume(true);
      setShowImportSuccess(false);
      if ((resumeData.projects || []).length > 0) {
        setHasTouchedProjects(true);
      }
    }
  }, [resumeData?.id]);

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
      subtitle: edu?.subtitle || '',
      date: edu?.date || normalizeDateRange(edu?.startDate, edu?.endDate),
      school: edu?.school || edu?.title || '',
      degree: edu?.degree || '',
      major: edu?.major || '',
    });

    const normalizeProjects = (proj: any) => ({
      ...proj,
      ...mergeDateFields(proj),
      title: proj?.title || '',
      subtitle: proj?.subtitle || proj?.role || '',
      date: proj?.date || '',
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
      persistLocalDraft({ ...resumeData, summary });
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
  const triggerManualSave = async (data: ResumeData) => {
    if (!data.id) {
      // Import should auto-save fields as draft, without creating a formal resume record.
      persistLocalDraft(data);
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
  };

  const handleResumeImport = (importedData: Omit<ResumeData, 'id'>) => {
    console.log('导入简历数据:', importedData);
    const toText = (value: any) => (typeof value === 'string' ? value.trim() : '');
    const normalizeDateRange = (start?: string, end?: string) => {
      const s = toText(start);
      const e = toText(end);
      if (s && e) return `${s} - ${e}`;
      return s || e || '';
    };
    const importedSummary = toText(importedData.summary || importedData.personalInfo?.summary);
    const normalizeWorkItems = (items: any[] = []) =>
      items.map((item, index) => {
        const startDate = toText(item?.startDate);
        const endDate = toText(item?.endDate);
        const title = toText(item?.title || item?.company);
        const subtitle = toText(item?.subtitle || item?.position);
        return {
          ...item,
          id: typeof item?.id === 'number' ? item.id : Date.now() + index,
          title,
          subtitle,
          startDate,
          endDate,
          date: toText(item?.date) || normalizeDateRange(startDate, endDate),
          company: toText(item?.company || title),
          position: toText(item?.position || subtitle),
          description: toText(item?.description),
        };
      });
    const normalizeEducationItems = (items: any[] = []) =>
      items.map((item, index) => {
        const startDate = toText(item?.startDate);
        const endDate = toText(item?.endDate);
        const title = toText(item?.title || item?.school);
        const subtitle = toText(item?.subtitle || item?.major);
        return {
          ...item,
          id: typeof item?.id === 'number' ? item.id : Date.now() + 1000 + index,
          title,
          subtitle,
          startDate,
          endDate,
          date: toText(item?.date) || normalizeDateRange(startDate, endDate),
          school: toText(item?.school || title),
          major: toText(item?.major || subtitle),
          degree: toText(item?.degree),
          description: toText(item?.description),
        };
      });
    const normalizeProjectItems = (items: any[] = []) =>
      items.map((item, index) => {
        const startDate = toText(item?.startDate);
        const endDate = toText(item?.endDate);
        return {
          ...item,
          id: typeof item?.id === 'number' ? item.id : Date.now() + 2000 + index,
          title: toText(item?.title),
          subtitle: toText(item?.subtitle || item?.role),
          role: toText(item?.role || item?.subtitle),
          startDate,
          endDate,
          date: toText(item?.date) || normalizeDateRange(startDate, endDate),
          description: toText(item?.description),
        };
      });

    // 合并导入的数据到当前简历
    const computeMergedData = (prev: ResumeData): ResumeData => {
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
          age: importedData.personalInfo.age || prev.personalInfo.age,
          summary: importedSummary || prev.personalInfo.summary
        };
      }

      // 合并工作经历（添加到现有列表）
      if (importedData.workExps && importedData.workExps.length > 0) {
        mergedData.workExps = [...prev.workExps, ...normalizeWorkItems(importedData.workExps as any[])];
      }

      // 合并教育经历（添加到现有列表）
      if (importedData.educations && importedData.educations.length > 0) {
        mergedData.educations = [...prev.educations, ...normalizeEducationItems(importedData.educations as any[])];
      }

      // 合并项目经历（添加到现有列表）
      if (importedData.projects && importedData.projects.length > 0) {
        mergedData.projects = [...prev.projects, ...normalizeProjectItems(importedData.projects as any[])];
      }

      // 合并技能（去重）
      const importedSkills = toSkillList(importedData.skills);
      if (importedSkills.length > 0) {
        mergedData.skills = mergeSkills(prev.skills, importedSkills);
      }

      // Merge summary (top-level)
      if (importedSummary) {
        mergedData.summary = importedSummary;
      }

      // Merge gender if provided
      if (importedData.gender) {
        mergedData.gender = importedData.gender;
      }

      return mergedData;
    };

    const finalData = computeMergedData(resumeData);
    setResumeData(finalData);

    if (importedSummary) {
      setSummary(importedSummary);
    }

    console.log('简历导入完成，触发保存');
    triggerManualSave(finalData);

    setTextResume('');
    setTextError('');
    setCurrentStep('personal');
    setHasImportedResume(true);
    setShowImportSuccess(true);
  };

  const handleTextImport = async () => {
    if (!textResume.trim()) {
      setTextError('请粘贴您的简历文本。');
      return;
    }

    setIsProcessing(true);
    setTextError('');

    try {
      const response = await fetch(buildApiUrl('/api/ai/parse-resume'), {
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
        throw new Error(errorData.error || '简历解析失败');
      }

      const result = await response.json();
      if (result.success && result.data) {
        handleResumeImport(result.data);
      } else {
        throw new Error('未获取到解析结果');
      }
    } catch (err: any) {
      console.error('Resume parse failed:', err);
      setTextError(err.message || '简历解析失败，请稍后重试。');
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

      const response = await fetch(buildApiUrl('/api/parse-pdf'), {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'PDF 解析失败');
      }

      const result = await response.json();
      if (result.success && result.data) {
        handleResumeImport(result.data);
      } else {
        throw new Error('未获取到解析结果');
      }
    } catch (err: any) {
      console.error('PDF parse failed:', err);
      setPdfError(err.message || 'PDF 解析失败，请稍后重试。');
    } finally {
      setIsPdfProcessing(false);
      if (pdfInputRef.current) pdfInputRef.current.value = '';
    }
  };

  const validatePersonalFormats = (data: ResumeData) => {
    const errors: Record<string, string> = {};
    const name = (data.personalInfo.name || '').trim();
    const title = (data.personalInfo.title || '').trim();
    const email = (data.personalInfo.email || '').trim();
    const phone = (data.personalInfo.phone || '').trim();

    if (name && /^\d+$/.test(name)) {
      errors.name = '姓名格式不正确';
    }
    if (title && /^\d+$/.test(title)) {
      errors.title = '求职意向格式不正确';
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = '邮箱格式不正确';
    }
    if (phone && !/^\+?[\d\s\-()]{7,20}$/.test(phone)) {
      errors.phone = '电话号码格式不正确';
    }
    return errors;
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
    if (validationStep === 'personal') {
      setFormatErrors(prev => {
        const next = { ...prev };
        if (field !== 'gender') {
          const updated: ResumeData = {
            ...resumeData,
            personalInfo: { ...resumeData.personalInfo, [field]: value }
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
    setResumeData(prev => ({
      ...prev,
      [section]: (prev[section] as Array<ItemBySection[S]>).map(item =>
        item.id === id ? ({ ...item, [field]: value } as ItemBySection[S]) : item
      ),
    }));
  };

  // Check if section is completed
  const isPersonalInfoComplete = () => {
    const { personalInfo } = resumeData;
    return Boolean(personalInfo.name && personalInfo.title && personalInfo.email && personalInfo.phone && resumeData.gender);
  };

  const isOngoingValue = (value?: string) => {
    return (value || '').trim() === '至今';
  };

  const hasValidDateRange = (item: { startDate?: string; endDate?: string; date?: string }) => {
    if (item?.date) return true;
    const start = (item?.startDate || '').trim();
    const end = (item?.endDate || '').trim();
    if (!start) return false;
    return Boolean(end) || isOngoingValue(end);
  };

  const isWorkExperienceComplete = () => {
    return resumeData.workExps.length > 0 && resumeData.workExps.some(exp =>
      Boolean(exp.title && exp.subtitle && hasValidDateRange(exp))
    );
  };

  const isEducationComplete = () => {
    return resumeData.educations.length > 0 && resumeData.educations.some(edu =>
      Boolean(edu.title && edu.subtitle && hasValidDateRange(edu))
    );
  };

  const isSkillsComplete = () => {
    return resumeData.skills.length > 0;
  };

  const isProjectsComplete = () => {
    // Projects are optional, only show check if user has added projects
    return resumeData.projects.length > 0 && resumeData.projects.some(proj =>
      Boolean(proj.title && proj.description && hasValidDateRange(proj))
    );
  };

  const isSummaryComplete = () => {
    return Boolean((summary || '').trim());
  };

  const isStepComplete = (step: WizardStep) => {
    switch (step) {
      case 'import':
        return true;
      case 'personal':
        return isPersonalInfoComplete();
      case 'work':
        return isWorkExperienceComplete();
      case 'education':
        return isEducationComplete();
      case 'projects':
        return isProjectsComplete() || hasTouchedProjects;
      case 'skills':
        return isSkillsComplete();
      case 'summary':
        return isSummaryComplete();
      default:
        return false;
    }
  };

  const isStepRequired = (step: WizardStep) => {
    return step !== 'import' && step !== 'projects';
  };

  const isStepMissing = (step: WizardStep) => {
    if (!hasImportedResume) return false;
    if (!isStepRequired(step)) return false;
    return !isStepComplete(step);
  };

  const handleAddSkill = () => {
    const tokens = toSkillList(newSkill);
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
      const title = buildResumeTitle(
        resumeData.resumeTitle,
        resumeData,
        resumeData.lastJdText || '',
        true,
        resumeData.targetCompany
      );

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
        setResumeData(prev => ({ ...prev, resumeTitle: title }));

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
        lastAutosavedRef.current = JSON.stringify(resumeData);
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

  // --- Wizard Navigation ---
  const currentStepIndex = WIZARD_STEPS.findIndex(s => s.key === currentStep);
  const progress = ((currentStepIndex + 1) / WIZARD_STEPS.length) * 100;
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
      <header className="sticky top-0 z-50 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md border-b border-slate-200 dark:border-[#324d67] transition-colors duration-300">
        <div className="relative grid grid-cols-[auto,1fr,auto] items-center px-4 py-3">
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
          <div className="text-right flex flex-col items-end min-w-[96px]">
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {isAutosaving ? '保存中...' : (lastSavedAt ? '已自动保存' : '未保存')}
            </span>
            {lastSavedAt && (
              <span className="text-xs text-slate-400 dark:text-slate-500">
                时间 {lastSavedAt}
              </span>
            )}
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
            onNewSkillChange={setNewSkill}
            onAddSkill={handleAddSkill}
            onRemoveSkill={handleRemoveSkill}
            showValidation={validationStep === 'skills'}
          />
        )}

        {/* Wizard Mode: Summary Step */}
        {wizardMode && currentStep === 'summary' && (
          <SummaryStep summary={summary} onSummaryChange={setSummary} showValidation={validationStep === 'summary'} />
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

    </div >
  );
};

export default Editor;

