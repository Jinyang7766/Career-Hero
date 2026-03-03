import React from 'react';
import { View, ScreenProps, ResumeData } from '../../types';
import { DatabaseService } from '../../src/database-service';
import BottomNav from '../BottomNav';
import { useAppContext } from '../../src/app-context';
import { useAppStore } from '../../src/app-store';
import { buildResumeTitle } from '../../src/resume-utils';
import { supabase } from '../../src/supabase-client';
import { normalizeEditorSummary } from '../../src/editor-summary-sync';
import BackButton from '../shared/BackButton';
import { usePreviewPdfExport } from './preview/hooks/usePreviewPdfExport';
import { usePreviewEditHistory } from './preview/hooks/usePreviewEditHistory';
import { hasMeaningfulResumeData, usePreviewRestore } from './preview/hooks/usePreviewRestore';
import { usePreviewSectionOrder } from './preview/hooks/usePreviewSectionOrder';
import { usePreviewZoomPan } from './preview/hooks/usePreviewZoomPan';
import { buildSectionTitleFocusKey, buildSkillFocusKey } from './preview/inline-focus';
import { renderPreviewTemplate, TEMPLATE_OPTIONS } from './preview/PreviewTemplates';
import {
  addResumeSectionItem,
  removeResumeSectionItem,
  removeResumeSkillByIndex,
  updateResumePersonalField,
  updateResumeSectionItem,
} from '../editor/editor-actions';

const Preview: React.FC<ScreenProps & { forceEditMode?: boolean }> = ({ forceEditMode = false }) => {
  const navigateToView = useAppContext((s) => s.navigateToView);
  const currentUser = useAppContext((s) => s.currentUser);
  const loadUserResumes = useAppContext((s) => s.loadUserResumes);
  const resumeData = useAppStore((state) => state.resumeData);
  const setResumeData = useAppStore((state) => state.setResumeData);
  const goBack = useAppContext((s) => s.goBack);
  const [isEditMode, setIsEditMode] = React.useState(forceEditMode);
  const [isSavingEdit, setIsSavingEdit] = React.useState(false);
  const [autoFocusRequest, setAutoFocusRequest] = React.useState<{ key: string; token: number }>({ key: '', token: 0 });
  const currentTemplateId = resumeData?.templateId || 'modern';
  const { isGenerating, handleExportPDF } = usePreviewPdfExport({ resumeData });
  const { hasResumeContent, isRestoringPreview, restoreError, handlePreviewBack } = usePreviewRestore({
    resumeData,
    setResumeData,
    navigateToView,
    goBack,
  });
  const { sectionOrder, handleTemplateChange, moveSection } = usePreviewSectionOrder({ resumeData, setResumeData });
  const {
    previewScale,
    previewOffset,
    previewCardRef,
    isZoomed,
    handlePreviewTouchStart,
    handlePreviewTouchMove,
    handlePreviewTouchEnd,
  } = usePreviewZoomPan();

  React.useEffect(() => {
    if (forceEditMode) setIsEditMode(true);
  }, [forceEditMode]);

  const handleSaveInlineEdit = React.useCallback(async () => {
    if (!resumeData) return true;

    const normalizedSummary = normalizeEditorSummary(
      resumeData.summary ?? resumeData.personalInfo?.summary ?? ''
    );
    const latestData = {
      ...resumeData,
      contentUpdatedAt: new Date().toISOString(),
      summary: normalizedSummary,
      personalInfo: {
        ...resumeData.personalInfo,
        summary: normalizedSummary,
      },
    };

    if (!hasMeaningfulResumeData(latestData) && !latestData.id) {
      return true;
    }

    setIsSavingEdit(true);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        alert('请先登录');
        return false;
      }

      const title = buildResumeTitle(
        latestData.resumeTitle,
        latestData,
        latestData.lastJdText || '',
        true,
        latestData.targetCompany
      );

      let result;
      if (latestData.id) {
        result = await DatabaseService.updateResume(
          String(latestData.id),
          { title, resume_data: latestData },
          { touchUpdatedAt: true }
        );
      } else {
        result = await DatabaseService.createResume(user.id, title, latestData);
      }

      if (!result.success) {
        alert(`保存失败: ${result.error?.message || '请重试'}`);
        return false;
      }

      const savedId = latestData.id || result.data?.id;
      const savedData = {
        ...latestData,
        ...(savedId ? { id: savedId } : {}),
        resumeTitle: title,
      };
      setResumeData(savedData as any);
      localStorage.setItem('preview_back_target', 'all_resumes');
      if (savedId !== undefined && savedId !== null) {
        localStorage.setItem('preview_resume_id', String(savedId));
      }
      if (currentUser?.id) {
        localStorage.setItem(`has_created_resume_${currentUser.id}`, 'true');
      }
      await loadUserResumes();
      return true;
    } catch (error) {
      console.error('Inline preview save failed:', error);
      alert('保存失败，请检查网络连接');
      return false;
    } finally {
      setIsSavingEdit(false);
    }
  }, [currentUser?.id, loadUserResumes, resumeData, setResumeData]);

  const handleToggleEditMode = React.useCallback(async () => {
    if (!isEditMode) {
      setIsEditMode(true);
      return;
    }
    const saved = await handleSaveInlineEdit();
    if (saved) setIsEditMode(false);
  }, [handleSaveInlineEdit, isEditMode]);

  const {
    canUndo,
    canRedo,
    undo,
    redo,
    applyEditMutation,
  } = usePreviewEditHistory({
    resumeData: resumeData as any,
    setResumeData: setResumeData as any,
    enabled: isEditMode,
  });

  const handlePersonalFieldChange = React.useCallback((field: keyof ResumeData['personalInfo'], value: string) => {
    applyEditMutation((current) => updateResumePersonalField(current, field as any, value));
  }, [applyEditMutation]);

  const handleSummaryChange = React.useCallback((value: string) => {
    applyEditMutation((current) => ({
      ...current,
      summary: value,
      personalInfo: {
        ...current.personalInfo,
        summary: value,
      },
    }));
  }, [applyEditMutation]);

  const handleSectionItemChange = React.useCallback((
    section: 'workExps' | 'educations' | 'projects',
    id: number,
    field: 'title' | 'subtitle' | 'description' | 'date',
    value: string
  ) => {
    applyEditMutation((current) => updateResumeSectionItem(current, section as any, id, field as any, value));
  }, [applyEditMutation]);

  const queueAutoFocus = React.useCallback((key: string) => {
    setAutoFocusRequest((prev) => ({ key, token: prev.token + 1 }));
  }, []);

  const handleAddSectionItem = React.useCallback((section: 'workExps' | 'educations' | 'projects') => {
    const itemId = Date.now();
    queueAutoFocus(buildSectionTitleFocusKey(section, itemId));
    applyEditMutation((current) => addResumeSectionItem(current, section, itemId));
  }, [applyEditMutation, queueAutoFocus]);

  const handleRemoveSectionItem = React.useCallback((section: 'workExps' | 'educations' | 'projects', id: number) => {
    applyEditMutation((current) => removeResumeSectionItem(current, section, id));
  }, [applyEditMutation]);

  const handleSkillsTextChange = React.useCallback((value: string) => {
    const skills = String(value || '')
      .split(/[•、,，\n;；|]/)
      .map((item) => item.trim())
      .filter(Boolean);
    applyEditMutation((current) => ({
      ...current,
      skills,
    }));
  }, [applyEditMutation]);

  const handleSkillItemChange = React.useCallback((index: number, value: string) => {
    applyEditMutation((current) => {
      const next = Array.isArray(current.skills) ? [...current.skills] : [];
      const normalized = String(value || '').trim();
      if (normalized) {
        next[index] = normalized;
      } else if (index >= 0 && index < next.length) {
        next.splice(index, 1);
      }
      return {
        ...current,
        skills: next.filter((item) => String(item || '').trim().length > 0),
      };
    });
  }, [applyEditMutation]);

  const handleAddSkillItem = React.useCallback(() => {
    const nextIndex = Array.isArray((resumeData as any)?.skills) ? resumeData.skills.length : 0;
    queueAutoFocus(buildSkillFocusKey(nextIndex));
    applyEditMutation((current) => ({
      ...current,
      skills: [...(Array.isArray(current.skills) ? current.skills : []), '新技能'],
    }));
  }, [applyEditMutation, queueAutoFocus, resumeData]);

  const handleRemoveSkillItem = React.useCallback((index: number) => {
    applyEditMutation((current) => removeResumeSkillByIndex(current, index));
  }, [applyEditMutation]);

  const handleUndo = React.useCallback(() => {
    undo();
  }, [undo]);

  const handleRedo = React.useCallback(() => {
    redo();
  }, [redo]);

  const editBindings = React.useMemo(
    () =>
      isEditMode
        ? {
          enabled: true,
          onPersonalFieldChange: handlePersonalFieldChange,
          onSummaryChange: handleSummaryChange,
          onWorkFieldChange: (id: number, field: 'title' | 'subtitle' | 'description' | 'date', value: string) =>
            handleSectionItemChange('workExps', id, field, value),
          onEducationFieldChange: (id: number, field: 'title' | 'subtitle' | 'description' | 'date', value: string) =>
            handleSectionItemChange('educations', id, field, value),
          onProjectFieldChange: (id: number, field: 'title' | 'subtitle' | 'description' | 'date', value: string) =>
            handleSectionItemChange('projects', id, field, value),
          onAddWorkItem: () => handleAddSectionItem('workExps'),
          onRemoveWorkItem: (id: number) => handleRemoveSectionItem('workExps', id),
          onAddEducationItem: () => handleAddSectionItem('educations'),
          onRemoveEducationItem: (id: number) => handleRemoveSectionItem('educations', id),
          onAddProjectItem: () => handleAddSectionItem('projects'),
          onRemoveProjectItem: (id: number) => handleRemoveSectionItem('projects', id),
          onSkillItemChange: handleSkillItemChange,
          onAddSkillItem: handleAddSkillItem,
          onRemoveSkillItem: handleRemoveSkillItem,
          onSkillsTextChange: handleSkillsTextChange,
          autoFocusKey: autoFocusRequest.key,
          autoFocusToken: autoFocusRequest.token,
        }
        : undefined,
    [
      autoFocusRequest.key,
      autoFocusRequest.token,
      handleAddSectionItem,
      handleAddSkillItem,
      handlePersonalFieldChange,
      handleRemoveSectionItem,
      handleRemoveSkillItem,
      handleSectionItemChange,
      handleSkillItemChange,
      handleSkillsTextChange,
      handleSummaryChange,
      isEditMode,
    ]
  );

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-background-dark animate-in slide-in-from-right duration-300">
      <header className="fixed top-0 left-0 right-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-white/5 mx-auto w-full max-w-md">
        <div className="h-14 px-4 flex items-center justify-between relative">
          <BackButton onClick={handlePreviewBack} className="z-10" />
          <h2 className="absolute inset-0 flex items-center justify-center text-lg font-bold leading-tight tracking-[-0.015em] text-slate-900 dark:text-white pointer-events-none">
            简历预览
          </h2>
          <div className="z-10 flex items-center gap-1.5">
            {isEditMode ? (
              <>
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={isSavingEdit || !canUndo}
                  className="flex items-center justify-center h-9 w-9 rounded-full bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 active:scale-95 transition-all text-slate-700 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="撤销"
                  title="撤销"
                >
                  <span className="material-symbols-outlined text-[18px]">undo</span>
                </button>
                <button
                  type="button"
                  onClick={handleRedo}
                  disabled={isSavingEdit || !canRedo}
                  className="flex items-center justify-center h-9 w-9 rounded-full bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 active:scale-95 transition-all text-slate-700 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="前进"
                  title="前进"
                >
                  <span className="material-symbols-outlined text-[18px]">redo</span>
                </button>
              </>
            ) : null}
            <button
              type="button"
              onClick={() => void handleToggleEditMode()}
              disabled={isSavingEdit}
              className="flex items-center justify-center w-9 h-9 rounded-full bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 active:scale-95 transition-all text-slate-700 dark:text-white disabled:opacity-60 disabled:cursor-not-allowed"
              title={isEditMode ? (isSavingEdit ? '保存中...' : '完成') : '编辑'}
            >
              {isSavingEdit ? (
                <span className="size-4 border-2 border-slate-400 border-t-slate-700 dark:border-white/20 dark:border-t-white rounded-full animate-spin"></span>
              ) : (
                <span className="material-symbols-outlined text-[20px]">
                  {isEditMode ? 'check' : 'edit'}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full relative overflow-y-auto no-scrollbar bg-slate-50 dark:bg-background-dark pt-20 pb-32 flex flex-col items-center gap-6" id="preview-area">
        <div className="w-[90%] bg-white dark:bg-slate-900/50 backdrop-blur-md rounded-2xl p-3 border border-slate-200 dark:border-white/5 shadow-xl shadow-slate-200/20 dark:shadow-none">
          <div className="flex items-center gap-3">
            {TEMPLATE_OPTIONS.map((t) => (
              <button
                key={t.id}
                onClick={() => handleTemplateChange(t.id)}
                className={`
                  relative flex-1 py-2 rounded-xl text-[11px] font-bold transition-all duration-300 flex items-center justify-center gap-1.5 border
                  ${currentTemplateId === t.id
                    ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20 scale-[1.02]'
                    : 'bg-slate-50 dark:bg-white/5 border-slate-100 dark:border-transparent text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-white/10 hover:border-slate-200'
                  }
                `}
              >
                <div className={`w-1.5 h-1.5 rounded-full ${currentTemplateId === t.id ? 'bg-white' : ''}`} style={{ backgroundColor: currentTemplateId === t.id ? undefined : t.color }}></div>
                {t.name}
              </button>
            ))}
          </div>
        </div>

        <div
          className="relative w-[85%] flex flex-col items-center group/doc-wrapper"
          onTouchStart={handlePreviewTouchStart}
          onTouchMove={handlePreviewTouchMove}
          onTouchEnd={handlePreviewTouchEnd}
          onTouchCancel={handlePreviewTouchEnd}
          style={{ touchAction: isZoomed || isEditMode ? 'none' : 'pan-y' }}
        >
          <div
            className={`
              relative w-full aspect-[1/1.414] bg-white rounded-sm shadow-2xl ease-out origin-center
              ${currentTemplateId === 'modern' ? 'shadow-blue-900/20' : ''}
              ${currentTemplateId === 'classic' ? 'shadow-slate-900/20' : ''}
              ${currentTemplateId === 'minimal' ? 'shadow-black/20' : ''}
              ${isZoomed || isEditMode ? '' : 'transition-all duration-500'}
            `}
            ref={previewCardRef}
            style={{
              transform: isEditMode
                ? 'translate3d(0, 0, 0) scale(1)'
                : `translate3d(${previewOffset.x}px, ${previewOffset.y}px, 0) scale(${previewScale})`,
              transformOrigin: 'center center',
            }}
          >
            <style dangerouslySetInnerHTML={{
              __html: `
                @media print {
                  #resume-content-modern, #resume-content-classic, #resume-content-minimal {
                    width: 794px !important;
                    min-width: 794px !important;
                    max-width: 794px !important;
                    margin: 0 !important;
                    padding: 32px !important;
                    box-shadow: none !important;
                    border-radius: 0 !important;
                    background-color: #ffffff !important;
                    font-family: inherit !important;
                    color: #0f172a !important;
                    overflow: visible !important;
                  }
                  .no-print { display: none !important; }
                  @page { margin: 0; size: A4 portrait; }
                  body { margin: 0; padding: 0; background: #ffffff !important; -webkit-print-color-adjust: exact !important; }
                  * { -webkit-print-color-adjust: exact !important; color-adjust: exact !important; }
                  .no-break { break-inside: avoid; page-break-inside: avoid; }
                  h1, h2, h3, h4, h5, h6 { break-after: avoid; page-break-after: avoid; }
                }
              `
            }} />
            {isRestoringPreview ? (
              <div className="h-full w-full flex items-center justify-center">
                <span className="size-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin"></span>
              </div>
            ) : restoreError && !hasResumeContent ? (
              <div className="h-full w-full flex flex-col items-center justify-center gap-3 px-6 text-center">
                <p className="text-sm text-slate-500 dark:text-slate-400">{restoreError}</p>
                <button
                  onClick={() => navigateToView(View.ALL_RESUMES, { replace: true })}
                  className="h-9 px-4 rounded-full bg-primary text-white text-xs font-bold hover:opacity-90 transition-opacity"
                >
                  返回全部简历
                </button>
              </div>
            ) : resumeData ? renderPreviewTemplate({
              templateId: resumeData.templateId || 'modern',
              data: resumeData,
              sectionOrder,
              onMoveSection: (index, direction) => { void moveSection(index, direction); },
              hideOrderButtons: isZoomed || isEditMode,
              editBindings,
            }) : null}
          </div>
        </div>

        {!isEditMode && (
          <div className="w-[85%] flex flex-col gap-4">
            <button
              onClick={handleExportPDF}
              disabled={isGenerating}
              className="w-full flex items-center justify-center gap-2 h-14 bg-primary hover:bg-blue-600 active:bg-blue-700 text-white rounded-xl shadow-[0_0_20px_rgba(19,127,236,0.15)] transition-all transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? (
                <>
                  <span className="size-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  <span className="text-base font-bold tracking-wide">生成中...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[24px]">download</span>
                  <span className="text-base font-bold tracking-wide">导出 PDF</span>
                </>
              )}
            </button>
            <p className="text-center text-xs text-slate-400 dark:text-slate-600 mt-2 mb-4">
              注意：PDF导出样式取决于后端生成配置，可能与预览略有差异。
            </p>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
};

export default Preview;
