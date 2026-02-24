import { useRef, useState } from 'react';
import type { ResumeData } from '../../../types';
import { buildApiUrl } from '../../../src/api-config';
import { toSkillListForImport } from '../../../src/skill-utils';
import { SUMMARY_MAX_CHARS, clampByLimit } from '../../../src/editor-field-limits';

type WizardStep = 'import' | 'personal' | 'work' | 'education' | 'projects' | 'skills' | 'summary';

type Params = {
  resumeData: ResumeData;
  setResumeData: (value: ResumeData) => void;
  setSummary: (value: string) => void;
  setCurrentStep: (step: WizardStep) => void;
  setHasImportedResume: (value: boolean) => void;
  setShowImportSuccess: (value: boolean) => void;
  triggerManualSave: (data: ResumeData) => Promise<void>;
};

export const useEditorImportFlow = ({
  resumeData,
  setResumeData,
  setSummary,
  setCurrentStep,
  setHasImportedResume,
  setShowImportSuccess,
  triggerManualSave,
}: Params) => {
  const [textResume, setTextResume] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [textError, setTextError] = useState('');
  const [isPdfProcessing, setIsPdfProcessing] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const handleResumeImport = (importedData: Omit<ResumeData, 'id'>) => {
    console.log('导入简历数据:', importedData);
    const toText = (value: any) => (typeof value === 'string' ? value.trim() : '');
    const toKeyText = (value: any) => toText(value).toLowerCase().replace(/\s+/g, '');
    const parseRangeText = (date?: string) => {
      const raw = toText(date);
      if (!raw) return { startDate: '', endDate: '' };
      if (/^\d{4}([./-]\d{1,2})?$/.test(raw) || /^(至今|现在|present|current)$/i.test(raw)) {
        return { startDate: raw, endDate: '' };
      }
      const sep = raw.match(/\s*(?:-|–|—|~|至|到|to)\s*/i);
      if (!sep) return { startDate: raw, endDate: '' };
      const parts = raw.split(/\s*(?:-|–|—|~|至|到|to)\s*/i).map((v) => toText(v)).filter(Boolean);
      if (parts.length >= 2) return { startDate: parts[0], endDate: parts.slice(1).join(' - ') };
      return { startDate: raw, endDate: '' };
    };
    const normalizeYearOnlyFromRaw = (rawValue: string, normalizedValue: string) => {
      if (/^\d{4}$/.test(toText(rawValue))) {
        const m = toText(normalizedValue).match(/^(\d{4})[./-]\d{1,2}$/);
        if (m) return m[1];
      }
      return toText(normalizedValue);
    };
    const resolveDates = (item: any) => {
      const rawStart = toText(item?.startDate);
      const rawEnd = toText(item?.endDate);
      const parsed = parseRangeText(item?.date);
      const startDate = rawStart || parsed.startDate;
      const endDate = rawEnd || parsed.endDate;
      return {
        startDate: normalizeYearOnlyFromRaw(rawStart, startDate),
        endDate: normalizeYearOnlyFromRaw(rawEnd, endDate),
      };
    };
    const normalizeDateRange = (start?: string, end?: string) => {
      const s = toText(start);
      const e = toText(end);
      if (s && e) return `${s} - ${e}`;
      return s || e || '';
    };
    const importedSummary = toText(importedData.summary || importedData.personalInfo?.summary);
    const normalizedImportedSummary = importedSummary
      ? clampByLimit(importedSummary, SUMMARY_MAX_CHARS)
      : '';
    const normalizeWorkItems = (items: any[] = []) =>
      items.map((item, index) => {
        const { startDate, endDate } = resolveDates(item);
        const title = toText(item?.title || item?.company);
        const subtitle = toText(item?.subtitle || item?.position);
        return {
          ...item,
          id: typeof item?.id === 'number' ? item.id : Date.now() + index,
          title,
          subtitle,
          startDate,
          endDate,
          date: normalizeDateRange(startDate, endDate) || toText(item?.date),
          company: toText(item?.company || title),
          position: toText(item?.position || subtitle),
          description: toText(item?.description),
        };
      });
    const normalizeEducationItems = (items: any[] = []) =>
      items.map((item, index) => {
        const { startDate, endDate } = resolveDates(item);
        const title = toText(item?.title || item?.school);
        const subtitle = toText(item?.subtitle || item?.major);
        return {
          ...item,
          id: typeof item?.id === 'number' ? item.id : Date.now() + 1000 + index,
          title,
          subtitle,
          startDate,
          endDate,
          date: normalizeDateRange(startDate, endDate) || toText(item?.date),
          school: toText(item?.school || title),
          major: toText(item?.major || subtitle),
          degree: toText(item?.degree),
          description: toText(item?.description),
        };
      });
    const normalizeProjectItems = (items: any[] = []) =>
      items.map((item, index) => {
        const { startDate, endDate } = resolveDates(item);
        return {
          ...item,
          id: typeof item?.id === 'number' ? item.id : Date.now() + 2000 + index,
          title: toText(item?.title),
          subtitle: toText(item?.subtitle || item?.role),
          role: toText(item?.role || item?.subtitle),
          startDate,
          endDate,
          date: normalizeDateRange(startDate, endDate) || toText(item?.date),
          description: toText(item?.description),
        };
      });
    const mergeUniqueItems = <T extends { id?: number }>(
      existing: T[],
      incoming: T[],
      getKey: (item: T) => string,
      mergeItem: (oldItem: T, newItem: T) => T
    ) => {
      const out = [...existing];
      const keyToIndex = new Map<string, number>();
      out.forEach((item, idx) => {
        const key = getKey(item);
        if (key) keyToIndex.set(key, idx);
      });
      incoming.forEach((item) => {
        const key = getKey(item);
        if (!key) {
          out.push(item);
          return;
        }
        const existingIndex = keyToIndex.get(key);
        if (existingIndex === undefined) {
          keyToIndex.set(key, out.length);
          out.push(item);
          return;
        }
        out[existingIndex] = mergeItem(out[existingIndex], item);
      });
      return out;
    };
    const toYearKey = (value: any) => {
      const text = toText(value);
      if (!text) return '';
      const m = text.match(/\b(19|20)\d{2}\b/);
      if (m) return m[0];
      if (/至今|现在|present|current/i.test(text)) return 'present';
      return toKeyText(text);
    };
    const getWorkKey = (item: any) => [
      toKeyText(item?.company || item?.title),
      toKeyText(item?.position || item?.subtitle),
      toKeyText(item?.startDate),
      toKeyText(item?.endDate),
      toKeyText(item?.date),
    ].join('|');
    const getEduKey = (item: any) => [
      toKeyText(item?.school || item?.title),
      toKeyText(item?.major || item?.subtitle),
      toYearKey(item?.startDate || item?.date),
      toYearKey(item?.endDate || item?.date),
    ].join('|');
    const getProjectKey = (item: any) => [
      toKeyText(item?.title),
      toKeyText(item?.role || item?.subtitle),
      toKeyText(item?.startDate),
      toKeyText(item?.endDate),
      toKeyText(item?.date),
    ].join('|');
    const mergeEntity = (oldItem: any, newItem: any) => ({
      ...oldItem,
      ...newItem,
      id: oldItem?.id ?? newItem?.id,
      title: oldItem?.title || newItem?.title || '',
      subtitle: oldItem?.subtitle || newItem?.subtitle || '',
      company: oldItem?.company || newItem?.company || '',
      position: oldItem?.position || newItem?.position || '',
      school: oldItem?.school || newItem?.school || '',
      major: oldItem?.major || newItem?.major || '',
      degree: oldItem?.degree || newItem?.degree || '',
      role: oldItem?.role || newItem?.role || '',
      startDate: oldItem?.startDate || newItem?.startDate || '',
      endDate: oldItem?.endDate || newItem?.endDate || '',
      date: oldItem?.date || newItem?.date || normalizeDateRange(oldItem?.startDate || newItem?.startDate, oldItem?.endDate || newItem?.endDate),
      description: oldItem?.description || newItem?.description || '',
    });

    const computeMergedData = (prev: ResumeData): ResumeData => {
      const mergedData = { ...prev };

      if (importedData.personalInfo) {
        mergedData.personalInfo = {
          name: importedData.personalInfo.name || prev.personalInfo.name,
          title: importedData.personalInfo.title || prev.personalInfo.title,
          email: importedData.personalInfo.email || prev.personalInfo.email,
          phone: importedData.personalInfo.phone || prev.personalInfo.phone,
          location: importedData.personalInfo.location || prev.personalInfo.location,
          linkedin: importedData.personalInfo.linkedin || prev.personalInfo.linkedin,
          website: importedData.personalInfo.website || prev.personalInfo.website,
          avatar: importedData.personalInfo.avatar || prev.personalInfo.avatar,
          age: importedData.personalInfo.age || prev.personalInfo.age,
          summary: normalizedImportedSummary || prev.personalInfo.summary
        };
      }

      if (importedData.workExps && importedData.workExps.length > 0) {
        mergedData.workExps = mergeUniqueItems(
          prev.workExps as any[],
          normalizeWorkItems(importedData.workExps as any[]),
          getWorkKey,
          mergeEntity
        );
      }

      if (importedData.educations && importedData.educations.length > 0) {
        const normalizedIncomingEdu = normalizeEducationItems(importedData.educations as any[]);
        const existingEdu = [...(prev.educations as any[])];
        const eduKeyToIndex = new Map<string, number>();
        existingEdu.forEach((item, idx) => {
          const key = getEduKey(item);
          if (key) eduKeyToIndex.set(key, idx);
        });
        normalizedIncomingEdu.forEach((item) => {
          const key = getEduKey(item);
          const existingIndex = key ? eduKeyToIndex.get(key) : undefined;
          if (existingIndex === undefined) {
            if (key) eduKeyToIndex.set(key, existingEdu.length);
            existingEdu.push(item);
            return;
          }
          const merged = mergeEntity(existingEdu[existingIndex], item);
          if (/^\d{4}$/.test(toText(existingEdu[existingIndex]?.startDate))) {
            merged.startDate = toText(existingEdu[existingIndex]?.startDate);
          }
          if (/^\d{4}$/.test(toText(existingEdu[existingIndex]?.endDate))) {
            merged.endDate = toText(existingEdu[existingIndex]?.endDate);
          }
          merged.date = toText(merged.date) || normalizeDateRange(merged.startDate, merged.endDate);
          existingEdu[existingIndex] = merged;
        });
        mergedData.educations = existingEdu;
      }

      if (importedData.projects && importedData.projects.length > 0) {
        mergedData.projects = mergeUniqueItems(
          prev.projects as any[],
          normalizeProjectItems(importedData.projects as any[]),
          getProjectKey,
          mergeEntity
        );
      }

      const importedSkills = toSkillListForImport(importedData.skills);
      if (importedSkills.length > 0) {
        mergedData.skills = importedSkills;
      } else {
        mergedData.skills = Array.isArray(prev.skills) ? prev.skills : [];
      }

      if (normalizedImportedSummary) {
        mergedData.summary = normalizedImportedSummary;
      }

      if (importedData.gender) {
        mergedData.gender = importedData.gender;
      }

      return mergedData;
    };

    const finalData = computeMergedData(resumeData);
    setResumeData(finalData);

    if (normalizedImportedSummary) {
      setSummary(normalizedImportedSummary);
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

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 90000);
    try {
      const response = await fetch(buildApiUrl('/api/ai/parse-resume'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          resumeText: textResume
        })
      });
      window.clearTimeout(timeoutId);

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
      if (err?.name === 'AbortError') {
        setTextError('解析超时，请稍后重试或改用 DOCX。');
      } else {
        setTextError(err.message || '简历解析失败，请稍后重试。');
      }
    } finally {
      window.clearTimeout(timeoutId);
      setIsProcessing(false);
    }
  };

  const handlePDFImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsPdfProcessing(true);
    setPdfError('');

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 120000);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(buildApiUrl('/api/parse-pdf'), {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });
      window.clearTimeout(timeoutId);

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
      if (err?.name === 'AbortError') {
        setPdfError('解析超时，请稍后重试，或先转 DOCX 再导入。');
      } else {
        setPdfError(err.message || 'PDF 解析失败，请稍后重试。');
      }
    } finally {
      window.clearTimeout(timeoutId);
      setIsPdfProcessing(false);
      if (pdfInputRef.current) pdfInputRef.current.value = '';
    }
  };

  return {
    textResume,
    setTextResume,
    isProcessing,
    textError,
    isPdfProcessing,
    pdfError,
    pdfInputRef,
    handleTextImport,
    handlePDFImport,
    handleResumeImport,
  };
};
