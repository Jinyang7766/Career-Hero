import { DatabaseService } from '../../../src/database-service';
import { buildResumeTitle } from '../../../src/resume-utils';
import { supabase } from '../../../src/supabase-client';
import { View, type ResumeData } from '../../../types';
import type { MutableRefObject } from 'react';

type Params = {
  resumeData: ResumeData;
  summary: string;
  setIsSaving: (value: boolean) => void;
  setIsAutosaving: (value: boolean) => void;
  setResumeData: (value: ResumeData) => void;
  loadUserResumes?: () => Promise<void> | void;
  setLastSavedAt: (value: string | null) => void;
  lastAutosavedRef: MutableRefObject<string>;
  editorDraftKey: string;
  navigateToView: (view: View) => void;
  suppressStepResetOnNextIdChangeRef: MutableRefObject<boolean>;
};

export const useEditorSaveAndPreview = ({
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
}: Params) => {
  return async () => {
    setIsSaving(true);
    setIsAutosaving(true);
    try {
      const latestData: ResumeData = {
        ...resumeData,
        summary: summary ?? resumeData?.summary ?? '',
      };
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        alert('请先登录');
        return;
      }

      let result;
      const title = buildResumeTitle(
        latestData.resumeTitle,
        latestData,
        latestData.lastJdText || '',
        true,
        latestData.targetCompany
      );
      if (latestData.id) {
        result = await DatabaseService.updateResume(String(latestData.id), {
          title,
          resume_data: latestData,
        }, { touchUpdatedAt: true });
      } else {
        result = await DatabaseService.createResume(user.id, title, latestData);
      }

      if (result.success) {
        const savedId = latestData.id || result.data?.id;
        const savedData: ResumeData = {
          ...latestData,
          ...(savedId ? { id: savedId } : {}),
          resumeTitle: title,
        };
        suppressStepResetOnNextIdChangeRef.current = true;
        setResumeData(savedData);
        if (loadUserResumes) {
          await loadUserResumes();
        }
        const now = new Date();
        setLastSavedAt(now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
        lastAutosavedRef.current = JSON.stringify(savedData);
        try {
          localStorage.removeItem(editorDraftKey);
        } catch {
          // ignore local draft cleanup errors
        }
        navigateToView(View.PREVIEW);
      } else {
        alert(`保存失败: ${result.error?.message || '请重试'}`);
      }
    } catch (error) {
      console.error('Error saving resume:', error);
      alert('保存失败，请检查网络连接');
    } finally {
      setIsSaving(false);
      setIsAutosaving(false);
    }
  };
};
