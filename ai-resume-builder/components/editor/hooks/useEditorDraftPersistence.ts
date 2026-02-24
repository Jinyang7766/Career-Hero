import { useEffect, useMemo, useRef } from 'react';
import type { ResumeData } from '../../../types';
import { clampByLimit, SUMMARY_MAX_CHARS } from '../../../src/editor-field-limits';
import {
  applySummaryToResumeData,
  resolveResumeSummaryValue,
} from '../../../src/editor-summary-sync';

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
  const hydratedResumeIdRef = useRef<string | null | undefined>(undefined);
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
      (p.summary || '').trim() ||
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
    const localSummary = clampByLimit(summary || '', SUMMARY_MAX_CHARS);
    const storeSummary = clampByLimit(resolveResumeSummaryValue(resumeData), SUMMARY_MAX_CHARS);
    if (localSummary !== storeSummary) {
      setResumeData((prev) => applySummaryToResumeData(prev, localSummary));
    }
  }, [summary, resumeData?.summary, resumeData?.personalInfo?.summary, setResumeData]);

  useEffect(() => {
    const resumeId = resumeData?.id == null ? null : String(resumeData.id);
    if (hydratedResumeIdRef.current === resumeId) return;
    hydratedResumeIdRef.current = resumeId;
    const storeSummary = clampByLimit(resolveResumeSummaryValue(resumeData), SUMMARY_MAX_CHARS);
    const localSummary = clampByLimit(summary || '', SUMMARY_MAX_CHARS);
    if (storeSummary !== localSummary) {
      setSummary(storeSummary);
    }
  }, [resumeData?.id, resumeData?.summary, resumeData?.personalInfo?.summary, summary, setSummary]);

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
      const restoredSummary = resolveResumeSummaryValue(draftData);
      if (
        restoredSummary ||
        typeof draftData.summary === 'string' ||
        typeof draftData.personalInfo?.summary === 'string'
      ) {
        setSummary(clampByLimit(restoredSummary, SUMMARY_MAX_CHARS));
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
