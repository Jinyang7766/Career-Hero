import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, ScreenProps, ResumeData } from '../../types';
import { DatabaseService } from '../../src/database-service';
import { toSkillList } from '../../src/skill-utils';
import {
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
import {
  addResumeSectionItem,
  addResumeSkills,
  clearResumeAllData,
  clearResumeCurrentStep,
  removeResumeSectionItem,
  removeResumeSkillByIndex,
  updateResumePersonalField,
  updateResumeSectionItem,
} from '../editor/editor-actions';
import { useEditorAutosave } from '../editor/hooks/useEditorAutosave';
import { useEditorDataNormalization } from '../editor/hooks/useEditorDataNormalization';
import { useEditorDraftPersistence } from '../editor/hooks/useEditorDraftPersistence';
import { useEditorImportFlow } from '../editor/hooks/useEditorImportFlow';
import { useEditorSaveAndPreview } from '../editor/hooks/useEditorSaveAndPreview';
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
  const handleDraftRestored = useCallback(() => {
    setHasImportedResume(true);
    setCurrentStep('personal');
  }, [setCurrentStep, setHasImportedResume]);

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
    onDraftRestored: handleDraftRestored,
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

  useEditorDataNormalization({
    resumeData,
    setResumeData,
  });

  async function triggerManualSave(data: ResumeData) {
    if (!data.id) {
      persistLocalDraft(data, { onStatusChange: setLastSavedAt });
      return;
    }
    setIsAutosaving(true);
    try {
      const contentUpdatedAt = new Date().toISOString();
      const savedData: ResumeData = {
        ...data,
        contentUpdatedAt,
      };
      const title = `${data.personalInfo.name || '未命名'}的简历`;
      const result = await DatabaseService.updateResume(String(data.id), {
        title: title,
        resume_data: savedData,
      }, { touchUpdatedAt: true });

      if (result.success) {
        latestResumeDataRef.current = savedData;
        lastAutosavedRef.current = JSON.stringify(savedData);
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

  useEditorAutosave({
    resumeData,
    summary,
    editorDraftKey,
    hasMeaningfulContent,
    persistLocalDraft,
    setAllResumes,
    setIsAutosaving,
    setLastSavedAt,
    latestResumeDataRef,
    autosaveIntervalRef,
    lastAutosavedRef,
    draftSaveTimerRef,
  });





  // Guard clause to prevent crash if data isn't ready
  if (!resumeData || !setResumeData) {
    return <div className="p-4 text-white">数据加载中...</div>;
  }

  // --- Handlers ---

  const handleInfoChange = (field: keyof ResumeData['personalInfo'] | 'gender', value: string) => {
    const nextResumeData = updateResumePersonalField(resumeData, field, value);
    setResumeData(nextResumeData);
    if (validationStep === 'personal') {
      setFormatErrors(prev => {
        const next = { ...prev };
        if (field !== 'gender') {
          return validatePersonalFormats(nextResumeData);
        }
        return next;
      });
    }
  };

  const addItem = (section: 'workExps' | 'educations' | 'projects') => {
    setResumeData(addResumeSectionItem(resumeData, section));
  };

  const removeItem = (section: 'workExps' | 'educations' | 'projects', id: number) => {
    setResumeData(removeResumeSectionItem(resumeData, section, id));
  };
  const updateItem = (section: 'workExps' | 'educations' | 'projects', id: number, field: any, value: string) => {
    setResumeData(updateResumeSectionItem(resumeData, section as any, id, field, value));
  };

  const handleAddSkill = () => {
    const tokens = toSkillList(clampByLimit(newSkill, SKILL_MAX_CHARS)).map((token) => clampByLimit(token, SKILL_MAX_CHARS));
    if (!tokens.length) {
      setNewSkill('');
      return;
    }
    setResumeData(addResumeSkills(resumeData, tokens));
    setNewSkill('');
  };

  const handleSaveAndPreview = useEditorSaveAndPreview({
    resumeData,
    summary,
    setIsSaving,
    setIsAutosaving,
    setResumeData,
    loadUserResumes,
    setLastSavedAt,
    lastAutosavedRef,
    editorDraftKey,
    navigateToView,
    suppressStepResetOnNextIdChangeRef,
  });

  const handleRemoveSkill = (index: number) => {
    setResumeData(removeResumeSkillByIndex(resumeData, index));
  };

  const applyResumeAndPersist = (nextData: ResumeData) => {
    setResumeData(nextData);
    // Clearing data should be persisted immediately; relying on 30s autosave can cause stale restore on re-entry.
    triggerManualSave(nextData);
  };

  const handleClearCurrentStep = () => {
    setShowClearPageConfirm(false);
    const next = clearResumeCurrentStep(resumeData, currentStep);
    if (currentStep === 'projects') setHasTouchedProjects(false);
    if (currentStep === 'skills') setNewSkill('');
    if (currentStep === 'summary') setSummary('');
    applyResumeAndPersist(next);
  };

  const handleClearAllData = () => {
    const clearedData: ResumeData = clearResumeAllData(resumeData);
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
