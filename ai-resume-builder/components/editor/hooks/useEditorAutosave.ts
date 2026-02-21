import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import { DatabaseService } from '../../../src/database-service';
import type { ResumeData } from '../../../types';

export const useEditorAutosave = ({
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
}: {
  resumeData: ResumeData;
  summary: string;
  editorDraftKey: string;
  hasMeaningfulContent: (data: ResumeData) => boolean;
  persistLocalDraft: (data: ResumeData, options?: { onStatusChange?: (label: string | null) => void }) => void;
  setAllResumes: ((updater: (prev: any) => any) => void) | undefined;
  setIsAutosaving: (value: boolean) => void;
  setLastSavedAt: (value: string | null) => void;
  latestResumeDataRef: MutableRefObject<ResumeData>;
  autosaveIntervalRef: MutableRefObject<number | null>;
  lastAutosavedRef: MutableRefObject<string>;
  draftSaveTimerRef: MutableRefObject<number | null>;
}) => {
  useEffect(() => {
    if (!resumeData?.id) return;

    if (autosaveIntervalRef.current) {
      window.clearInterval(autosaveIntervalRef.current);
    }

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
        }, { touchUpdatedAt: true });
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
  }, [resumeData?.id, setAllResumes, setIsAutosaving, setLastSavedAt, latestResumeDataRef, autosaveIntervalRef, lastAutosavedRef]);

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
  }, [resumeData, summary, editorDraftKey, hasMeaningfulContent, persistLocalDraft, draftSaveTimerRef, setLastSavedAt]);
};
