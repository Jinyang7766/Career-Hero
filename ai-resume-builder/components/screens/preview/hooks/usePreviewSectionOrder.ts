import { useCallback, useMemo } from 'react';
import type { ResumeData } from '../../../../types';
import { DatabaseService } from '../../../../src/database-service';

const PREVIEW_SECTION_KEYS = ['summary', 'workExps', 'educations', 'projects', 'skills'] as const;
export type PreviewSectionKey = typeof PREVIEW_SECTION_KEYS[number];
export type MoveSectionDirection = -1 | 1;

const normalizePreviewSectionOrder = (raw: any): PreviewSectionKey[] => {
  const incoming = Array.isArray(raw) ? raw : [];
  const seen = new Set<PreviewSectionKey>();
  const ordered: PreviewSectionKey[] = [];
  for (const item of incoming) {
    const key = String(item || '').trim() as PreviewSectionKey;
    if (!PREVIEW_SECTION_KEYS.includes(key) || seen.has(key)) continue;
    seen.add(key);
    ordered.push(key);
  }
  for (const key of PREVIEW_SECTION_KEYS) {
    if (!seen.has(key)) ordered.push(key);
  }
  return ordered;
};

type Params = {
  resumeData: ResumeData;
  setResumeData: (data: ResumeData | ((prev: ResumeData) => ResumeData)) => void;
};

export const usePreviewSectionOrder = ({ resumeData, setResumeData }: Params) => {
  const sectionOrder = useMemo(
    () => normalizePreviewSectionOrder((resumeData as any)?.previewSectionOrder),
    [(resumeData as any)?.previewSectionOrder]
  );

  const persistResumeData = useCallback(async (nextData: ResumeData) => {
    if (!setResumeData) return;
    setResumeData(nextData);
    if ((resumeData as any)?.id) {
      try {
        await DatabaseService.updateResume(String((resumeData as any).id), {
          resume_data: nextData,
        }, { touchUpdatedAt: false });
      } catch (error) {
        console.error('Failed to persist preview settings:', error);
      }
    }
  }, [resumeData, setResumeData]);

  const handleTemplateChange = useCallback(async (templateId: string) => {
    if (!resumeData || !setResumeData) return;
    const updatedData = { ...(resumeData as any), templateId };
    setResumeData(updatedData);
    if ((resumeData as any).id) {
      try {
        await DatabaseService.updateResume(String((resumeData as any).id), {
          resume_data: updatedData,
        }, { touchUpdatedAt: false });
      } catch (error) {
        console.error('Failed to update template:', error);
      }
    }
  }, [resumeData, setResumeData]);

  const moveSection = useCallback(async (index: number, direction: MoveSectionDirection) => {
    if (!resumeData) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= sectionOrder.length) return;
    const nextOrder = [...sectionOrder];
    const [picked] = nextOrder.splice(index, 1);
    nextOrder.splice(targetIndex, 0, picked);
    await persistResumeData({
      ...(resumeData as any),
      previewSectionOrder: nextOrder,
    });
  }, [persistResumeData, resumeData, sectionOrder]);

  return {
    sectionOrder,
    handleTemplateChange,
    moveSection,
  };
};
