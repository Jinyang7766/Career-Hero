import { useEffect, useMemo } from 'react';
import type { ResumeData } from '../../../types';
import { clampByLimit, SUMMARY_MAX_CHARS } from '../../../src/editor-field-limits';

type WizardStep = 'import' | 'personal' | 'work' | 'education' | 'projects' | 'skills' | 'summary';

type Params = {
  currentUserId?: string;
  resumeData: ResumeData;
  summary: string;
  setSummary: (value: string) => void;
  setResumeData: (updater: (prev: ResumeData) => ResumeData) => void;
  onDraftRestored: () => void;
};

export const useEditorDraftPersistence = ({
  currentUserId,
  resumeData,
  summary,
  setSummary,
  setResumeData,
  onDraftRestored,
}: Params) => {
  const editorDraftKey = useMemo(
    () => `editor_resume_draft_${currentUserId || 'anonymous'}`,
    [currentUserId]
  );

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

  const persistLocalDraft = (data: ResumeData, options?: { updateStatus?: boolean; onStatusChange?: (timeLabel: string) => void }) => {
    try {
      localStorage.setItem(editorDraftKey, JSON.stringify({
        updatedAt: new Date().toISOString(),
        data: { ...data, id: undefined }
      }));
      if (options?.updateStatus !== false && options?.onStatusChange) {
        const now = new Date();
        const timeLabel = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        options.onStatusChange(timeLabel);
      }
    } catch (error) {
      console.warn('Failed to persist local editor draft:', error);
    }
  };

  useEffect(() => {
    if (summary !== resumeData?.summary) {
      setResumeData(prev => ({ ...prev, summary }));
    }
  }, [summary, resumeData?.summary, setResumeData]);

  useEffect(() => {
    if (typeof resumeData?.summary === 'string' && resumeData.summary !== summary) {
      setSummary(clampByLimit(resumeData.summary, SUMMARY_MAX_CHARS));
    }
  }, [resumeData?.summary, summary, setSummary]);

  useEffect(() => {
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
        setSummary(clampByLimit(draftData.summary, SUMMARY_MAX_CHARS));
      }
      onDraftRestored();
    } catch (error) {
      console.warn('Failed to restore local editor draft:', error);
    }
  }, [editorDraftKey, resumeData?.id, setResumeData, setSummary, onDraftRestored]);

  return {
    editorDraftKey,
    hasMeaningfulContent,
    persistLocalDraft,
  };
};
