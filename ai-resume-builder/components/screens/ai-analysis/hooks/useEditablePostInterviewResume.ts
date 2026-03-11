import React from 'react';
import type { ResumeData } from '../../../../types';
import { formatTimeline, normalizeTimelineFields } from '../../../../src/timeline-utils';

export const useEditablePostInterviewResume = ({
  generatedResume,
  onCompleteAndSave,
}: {
  generatedResume: ResumeData | null;
  onCompleteAndSave?: (editedResume?: ResumeData | null) => Promise<void> | void;
}) => {
  const [isSaving, setIsSaving] = React.useState(false);
  const [editableGeneratedResume, setEditableGeneratedResume] = React.useState<ResumeData | null>(generatedResume);

  React.useEffect(() => {
    setEditableGeneratedResume(generatedResume);
  }, [generatedResume]);

  const handleCompleteAndSaveClick = async () => {
    if (!onCompleteAndSave || isSaving) return false;
    setIsSaving(true);
    try {
      await onCompleteAndSave(editableGeneratedResume);
      return true;
    } catch {
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const updateGeneratedPersonalInfo = (field: 'name' | 'title' | 'email' | 'phone', value: string) => {
    setEditableGeneratedResume((prev) =>
      prev
        ? { ...prev, personalInfo: { ...(prev.personalInfo || {}), [field]: value } as any }
        : prev
    );
  };

  const updateGeneratedSummary = (value: string) => {
    setEditableGeneratedResume((prev) => (prev ? { ...prev, summary: value } : prev));
  };

  const updateGeneratedSkills = (value: string) => {
    setEditableGeneratedResume((prev) => {
      if (!prev) return prev;
      const skills = value
        .split(/[、,，]/)
        .map((s) => s.trim())
        .filter(Boolean);
      return { ...prev, skills };
    });
  };

  const updateGeneratedWorkField = (index: number, field: string, value: string) => {
    setEditableGeneratedResume((prev) => {
      if (!prev) return prev;
      const list = Array.isArray((prev as any).workExps) ? [...((prev as any).workExps as any[])] : [];
      if (!list[index]) return prev;
      const nextItem: any = { ...list[index], [field]: value };
      if (field === 'date' || field === 'startDate' || field === 'endDate') {
        const normalized = normalizeTimelineFields(nextItem);
        nextItem.startDate = normalized.startDate;
        nextItem.endDate = normalized.endDate;
        nextItem.date = normalized.date;
      }
      list[index] = nextItem;
      return { ...(prev as any), workExps: list } as ResumeData;
    });
  };

  const updateGeneratedProjectField = (index: number, field: string, value: string) => {
    setEditableGeneratedResume((prev) => {
      if (!prev) return prev;
      const list = Array.isArray((prev as any).projects) ? [...((prev as any).projects as any[])] : [];
      if (!list[index]) return prev;
      const nextItem: any = { ...list[index], [field]: value };
      if (field === 'date' || field === 'startDate' || field === 'endDate') {
        const normalized = normalizeTimelineFields(nextItem);
        nextItem.startDate = normalized.startDate;
        nextItem.endDate = normalized.endDate;
        nextItem.date = normalized.date;
      }
      list[index] = nextItem;
      return { ...(prev as any), projects: list } as ResumeData;
    });
  };

  const updateGeneratedEducationField = (index: number, field: string, value: string) => {
    setEditableGeneratedResume((prev) => {
      if (!prev) return prev;
      const list = Array.isArray((prev as any).educations) ? [...((prev as any).educations as any[])] : [];
      if (!list[index]) return prev;
      const nextItem = { ...list[index], [field]: value } as any;
      if (field === 'date' || field === 'startDate' || field === 'endDate') {
        const normalized = normalizeTimelineFields(nextItem);
        nextItem.startDate = normalized.startDate;
        nextItem.endDate = normalized.endDate;
        nextItem.date = normalized.date;
      }
      list[index] = nextItem;
      return { ...(prev as any), educations: list } as ResumeData;
    });
  };

  const applyGeneratedSelectionRewrite = ({
    section,
    index,
    rangeStart,
    rangeEnd,
    replacement,
  }: {
    section: 'workExps' | 'projects';
    index: number;
    rangeStart: number;
    rangeEnd: number;
    replacement: string;
  }): boolean => {
    let didApply = false;
    setEditableGeneratedResume((prev) => {
      if (!prev) return prev;
      const list = Array.isArray((prev as any)[section]) ? [...(((prev as any)[section]) as any[])] : [];
      if (!list[index]) return prev;
      const current = String(list[index]?.description || '');
      const start = Number.isFinite(rangeStart) ? Math.max(0, Math.floor(rangeStart)) : 0;
      const end = Number.isFinite(rangeEnd) ? Math.max(start, Math.floor(rangeEnd)) : start;
      if (start >= current.length || end <= start) return prev;
      const nextDescription = `${current.slice(0, start)}${String(replacement || '')}${current.slice(end)}`;
      if (nextDescription === current) return prev;
      list[index] = {
        ...list[index],
        description: nextDescription,
      };
      didApply = true;
      return {
        ...(prev as any),
        [section]: list,
      } as ResumeData;
    });
    return didApply;
  };

  const getDisplayDate = (item: any) => {
    return formatTimeline(item);
  };

  return {
    isSaving,
    editableGeneratedResume,
    handleCompleteAndSaveClick,
    updateGeneratedPersonalInfo,
    updateGeneratedSummary,
    updateGeneratedSkills,
    updateGeneratedWorkField,
    updateGeneratedProjectField,
    updateGeneratedEducationField,
    applyGeneratedSelectionRewrite,
    getDisplayDate,
  };
};
