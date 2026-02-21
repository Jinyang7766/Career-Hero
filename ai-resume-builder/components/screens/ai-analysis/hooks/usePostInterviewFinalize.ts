import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import { DatabaseService } from '../../../../src/database-service';
import { buildResumeTitle } from '../../../../src/resume-utils';
import { normalizeTimelineFields } from '../../../../src/timeline-utils';
import type { ResumeData } from '../../../../types';
import { persistUserDossierToProfile } from '../dossier-persistence';

type Params = {
  currentUserId?: string;
  generatedResume: ResumeData | null;
  sourceResumeIdRef: MutableRefObject<string | number | null>;
  resumeData: ResumeData;
  jdText: string;
  targetCompany: string;
  allResumes: any[] | undefined;
  makeJdKey: (text: string) => string;
  isSameResumeId: (a: any, b: any) => boolean;
  setResumeData: (v: ResumeData) => void;
  setSelectedResumeId: (v: string | number | null) => void;
  setAnalysisResumeId: (v: string | number | null) => void;
  setOptimizedResumeId: (v: string | number | null) => void;
  showToast: (msg: string, type?: 'info' | 'success' | 'error') => void;
  navigateToStep: (step: any, replace?: boolean) => void;
  finalReportScore?: number;
  finalReportSummary?: string;
  finalReportAdvice?: string[];
  finalAnalysisReady?: boolean;
};

const normalizeContact = (value: unknown) => String(value || '').trim();
const normalizeText = (value: unknown) => String(value || '').trim();
const isLikelyEmail = (value: unknown) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeContact(value));
const isLikelyPhone = (value: unknown) => {
  const raw = normalizeContact(value);
  if (!raw) return false;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return false;
  if (!/^[+()\-.\s\d]+$/.test(raw)) return false;
  return true;
};
const isMaskedContactValue = (value: unknown) => {
  const text = normalizeContact(value);
  if (!text) return true;
  const lowered = text.toLowerCase();
  if (
    lowered.includes('[email_') ||
    lowered.includes('[phone_') ||
    lowered.includes('masked') ||
    lowered.includes('脱敏') ||
    lowered.includes('隐私')
  ) {
    return true;
  }
  if (/^\*+$/.test(text)) return true;
  if (/^x+$/i.test(text)) return true;
  if (/^(\*|x|X|-|_|\s){6,}$/.test(text)) return true;
  return false;
};
const metricPlaceholderPattern = /(?:【[^】]*(?:具体|关键|量化|任务|方法|结果|示例|待补充|xx|xxx|数据|指标)[^】]*】|\[[^\]]*(?:具体|关键|量化|任务|方法|结果|示例|待补充|xx|xxx|数据|指标)[^\]]*\]|(?:^|[^a-zA-Z])(?:XX%|X%|XXX|xx%|x%|xxx|待补充|请填写|可替换|TBD|todo)(?:$|[^a-zA-Z]))/i;
const containsMetricPlaceholder = (value: unknown) => metricPlaceholderPattern.test(normalizeText(value));
const cleanupMetricPlaceholderText = (value: unknown) => {
  const source = normalizeText(value);
  if (!source) return '';
  return source
    .replace(/【[^】]*(?:具体|关键|量化|任务|方法|结果|示例|待补充|xx|xxx|数据|指标)[^】]*】/gi, '')
    .replace(/\[[^\]]*(?:具体|关键|量化|任务|方法|结果|示例|待补充|xx|xxx|数据|指标)[^\]]*\]/gi, '')
    .replace(/(?:^|[^a-zA-Z])(XX%|X%|XXX|xx%|x%|xxx|待补充|请填写|可替换|TBD|todo)(?:$|[^a-zA-Z])/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
};

const resolveMetricText = (generatedValue: unknown, sourceValue: unknown) => {
  const generatedText = normalizeText(generatedValue);
  const sourceText = normalizeText(sourceValue);
  if (!containsMetricPlaceholder(generatedText)) return generatedText;
  if (sourceText && !containsMetricPlaceholder(sourceText)) return sourceText;
  return cleanupMetricPlaceholderText(generatedText);
};

const pickFilledTimelineValue = (...values: unknown[]) => {
  for (const value of values) {
    const text = normalizeText(value);
    if (text) return text;
  }
  return '';
};

const normalizeMatchText = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[，,。.;；:：\-—_()（）\[\]【】'"`]/g, '');

const findBestTimelineSourceIndex = (item: any, candidates: any[], used: Set<number>, fallbackIndex: number) => {
  const itemSig = normalizeMatchText([item?.company, item?.title, item?.position, item?.subtitle].filter(Boolean).join(' '));
  if (itemSig) {
    const matched = candidates.findIndex((candidate: any, idx: number) => {
      if (used.has(idx) || !candidate) return false;
      const candidateSig = normalizeMatchText([candidate?.company, candidate?.title, candidate?.position, candidate?.subtitle].filter(Boolean).join(' '));
      return !!candidateSig && (candidateSig.includes(itemSig) || itemSig.includes(candidateSig));
    });
    if (matched >= 0) return matched;
  }
  if (fallbackIndex >= 0 && fallbackIndex < candidates.length && !used.has(fallbackIndex)) return fallbackIndex;
  return -1;
};

const fillMissingExperienceTimeline = (resume: any, primarySource: any, fallbackSource: any) => {
  if (!resume || typeof resume !== 'object') return resume;
  const next: any = { ...resume };
  const sourceA = (primarySource && typeof primarySource === 'object') ? primarySource : {};
  const sourceB = (fallbackSource && typeof fallbackSource === 'object') ? fallbackSource : {};

  if (Array.isArray(next.workExps)) {
    const sourceAList = Array.isArray(sourceA.workExps) ? sourceA.workExps : [];
    const sourceBList = Array.isArray(sourceB.workExps) ? sourceB.workExps : [];
    const usedA = new Set<number>();
    const usedB = new Set<number>();
    next.workExps = next.workExps.map((item: any, index: number) => {
      if (!item || typeof item !== 'object') return item;
      const srcAIdx = findBestTimelineSourceIndex(item, sourceAList, usedA, index);
      const srcBIdx = findBestTimelineSourceIndex(item, sourceBList, usedB, index);
      if (srcAIdx >= 0) usedA.add(srcAIdx);
      if (srcBIdx >= 0) usedB.add(srcBIdx);
      const srcA = (srcAIdx >= 0 && sourceAList[srcAIdx] && typeof sourceAList[srcAIdx] === 'object') ? sourceAList[srcAIdx] : {};
      const srcB = (srcBIdx >= 0 && sourceBList[srcBIdx] && typeof sourceBList[srcBIdx] === 'object') ? sourceBList[srcBIdx] : {};
      const date = pickFilledTimelineValue(item.date, srcA.date, srcA.startDate && srcA.endDate ? `${srcA.startDate} - ${srcA.endDate}` : '', srcB.date, srcB.startDate && srcB.endDate ? `${srcB.startDate} - ${srcB.endDate}` : '');
      const startDate = pickFilledTimelineValue(item.startDate, srcA.startDate, srcB.startDate);
      const endDate = pickFilledTimelineValue(item.endDate, srcA.endDate, srcB.endDate);
      const normalizedTimeline = normalizeTimelineFields({ date, startDate, endDate });
      return {
        ...item,
        date: normalizedTimeline.date,
        startDate: normalizedTimeline.startDate,
        endDate: normalizedTimeline.endDate,
      };
    });
  }

  if (Array.isArray(next.projects)) {
    const sourceAList = Array.isArray(sourceA.projects) ? sourceA.projects : [];
    const sourceBList = Array.isArray(sourceB.projects) ? sourceB.projects : [];
    next.projects = next.projects.map((item: any, index: number) => {
      if (!item || typeof item !== 'object') return item;
      const srcA = (sourceAList[index] && typeof sourceAList[index] === 'object') ? sourceAList[index] : {};
      const srcB = (sourceBList[index] && typeof sourceBList[index] === 'object') ? sourceBList[index] : {};
      const normalizedTimeline = normalizeTimelineFields({
        date: pickFilledTimelineValue(item.date, srcA.date, srcB.date),
        startDate: pickFilledTimelineValue(item.startDate, srcA.startDate, srcB.startDate),
        endDate: pickFilledTimelineValue(item.endDate, srcA.endDate, srcB.endDate),
      });
      return {
        ...item,
        date: normalizedTimeline.date,
        startDate: normalizedTimeline.startDate,
        endDate: normalizedTimeline.endDate,
      };
    });
  }

  return next;
};

const sanitizeResumeMetricPlaceholders = (resume: any, source: any) => {
  if (!resume || typeof resume !== 'object') return resume;
  const next: any = { ...resume };
  const src = (source && typeof source === 'object') ? source : {};

  if (next.summary !== undefined) {
    next.summary = resolveMetricText(next.summary, src.summary);
  }
  if (next.personalInfo && typeof next.personalInfo === 'object') {
    const srcPersonal = (src.personalInfo && typeof src.personalInfo === 'object') ? src.personalInfo : {};
    next.personalInfo = {
      ...next.personalInfo,
      summary: resolveMetricText(next.personalInfo.summary, srcPersonal.summary),
    };
  }

  if (Array.isArray(next.workExps)) {
    const srcWork = Array.isArray(src.workExps) ? src.workExps : [];
    next.workExps = next.workExps.map((item: any, index: number) => {
      if (!item || typeof item !== 'object') return item;
      const srcItem = (srcWork[index] && typeof srcWork[index] === 'object') ? srcWork[index] : {};
      return {
        ...item,
        description: resolveMetricText(item.description, srcItem.description),
      };
    });
  }

  if (Array.isArray(next.projects)) {
    const srcProjects = Array.isArray(src.projects) ? src.projects : [];
    next.projects = next.projects.map((item: any, index: number) => {
      if (!item || typeof item !== 'object') return item;
      const srcItem = (srcProjects[index] && typeof srcProjects[index] === 'object') ? srcProjects[index] : {};
      return {
        ...item,
        description: resolveMetricText(item.description, srcItem.description),
      };
    });
  }

  return next;
};

export const usePostInterviewFinalize = ({
  currentUserId,
  generatedResume,
  sourceResumeIdRef,
  resumeData,
  jdText,
  targetCompany,
  allResumes,
  makeJdKey,
  isSameResumeId,
  setResumeData,
  setSelectedResumeId,
  setAnalysisResumeId,
  setOptimizedResumeId,
  showToast,
  navigateToStep,
  finalReportScore,
  finalReportSummary,
  finalReportAdvice,
  finalAnalysisReady,
}: Params) => {
  const handleCompleteAndSavePostInterview = useCallback(async (editedResume?: ResumeData | null) => {
    if (!currentUserId) {
      showToast('登录已过期，请重新登录', 'error');
      return;
    }
    const resumeToSave = (editedResume || generatedResume) as ResumeData | null;
    if (!resumeToSave) {
      showToast('未生成可保存的新简历', 'error');
      return;
    }
    if (!finalAnalysisReady) {
      showToast('最终报告正在生成，请稍后再试', 'info');
      return;
    }

    const sourceId = String(
      sourceResumeIdRef.current ||
      (resumeData as any)?.optimizedFromId ||
      (resumeData as any)?.id ||
      ''
    ).trim();
    const effectiveJdText = (jdText || (resumeData as any)?.lastJdText || '').trim();
    const optimizationJdKey = makeJdKey(effectiveJdText);
    const baseTitle =
      allResumes?.find((r: any) => isSameResumeId(r.id, (resumeData as any)?.id))?.title ||
      (resumeData as any)?.resumeTitle ||
      '简历';
    const newTitle = buildResumeTitle(baseTitle, resumeData as any, effectiveJdText, true, targetCompany);
    const originalSourceId = String((resumeData as any)?.optimizedFromId || '').trim();
    const preferredSourceId = originalSourceId || sourceId;
    const sourceRow = preferredSourceId
      ? allResumes?.find((r: any) => isSameResumeId(r.id, preferredSourceId))
      : null;
    let sourceResumeData = sourceRow?.resume_data || {};
    const sourcePersonalInfoMissing = !sourceResumeData?.personalInfo || typeof sourceResumeData.personalInfo !== 'object';
    if (
      (
        !sourceResumeData ||
        typeof sourceResumeData !== 'object' ||
        !Object.keys(sourceResumeData).length ||
        sourcePersonalInfoMissing
      ) &&
      preferredSourceId
    ) {
      try {
        const sourceRead = await DatabaseService.getResume(preferredSourceId);
        if (sourceRead.success && sourceRead.data?.resume_data) {
          sourceResumeData = sourceRead.data.resume_data;
        }
      } catch (sourceErr) {
        console.warn('Failed to read source resume for timeline fallback:', sourceErr);
      }
    }
    const sourceResumePersonalInfo = sourceResumeData?.personalInfo || {};
    const fallbackPersonalInfo = (resumeData as any)?.personalInfo || {};
    const sourceEmail =
      normalizeContact(sourceResumePersonalInfo?.email) ||
      normalizeContact(fallbackPersonalInfo?.email);
    const sourcePhone =
      normalizeContact(sourceResumePersonalInfo?.phone) ||
      normalizeContact(fallbackPersonalInfo?.phone);

    const normalizedResume = fillMissingExperienceTimeline(
      sanitizeResumeMetricPlaceholders((resumeToSave as any), sourceResumeData || (resumeData as any) || {}),
      sourceResumeData,
      (resumeData as any) || {}
    );
    const payload: any = {
      ...normalizedResume,
      optimizationStatus: 'optimized',
      optimizedFromId: sourceId || undefined,
      optimizationJdKey,
      lastJdText: effectiveJdText,
      targetCompany: targetCompany || (resumeData as any)?.targetCompany || '',
    };
    payload.personalInfo = {
      ...(payload.personalInfo || {}),
    };
    const generatedEmail = normalizeContact(payload.personalInfo?.email);
    const generatedPhone = normalizeContact(payload.personalInfo?.phone);
    const validSourceEmail = isLikelyEmail(sourceEmail) ? sourceEmail : '';
    const validSourcePhone = isLikelyPhone(sourcePhone) ? sourcePhone : '';
    const shouldBackfillEmail =
      !!validSourceEmail && (isMaskedContactValue(generatedEmail) || !isLikelyEmail(generatedEmail));
    const shouldBackfillPhone =
      !!validSourcePhone && (isMaskedContactValue(generatedPhone) || !isLikelyPhone(generatedPhone));
    if (shouldBackfillEmail) {
      payload.personalInfo.email = validSourceEmail;
    }
    if (shouldBackfillPhone) {
      payload.personalInfo.phone = validSourcePhone;
    }
    if (!shouldBackfillEmail && sourceEmail && isMaskedContactValue(generatedEmail)) {
      payload.personalInfo.email = sourceEmail;
    }
    if (!shouldBackfillPhone && sourcePhone && isMaskedContactValue(generatedPhone)) {
      payload.personalInfo.phone = sourcePhone;
    }
    delete payload.id;

    const saveResult = await DatabaseService.createResume(currentUserId, newTitle, payload);
    if (!saveResult.success || !saveResult.data) {
      showToast('保存优化简历失败，请重试', 'error');
      return;
    }

    const savedRow = saveResult.data as any;
    const savedResumeData: any = {
      id: savedRow.id,
      ...(savedRow.resume_data || {}),
      resumeTitle: savedRow.title,
    };
    sourceResumeIdRef.current = savedResumeData.optimizedFromId || sourceId || savedRow.id;
    setResumeData(savedResumeData);
    setSelectedResumeId(savedRow.id);
    setAnalysisResumeId(savedRow.id);
    setOptimizedResumeId(savedRow.id);
    try {
      await persistUserDossierToProfile({
        source: 'final_diagnosis',
        score: Number(finalReportScore || 0),
        summary: String(finalReportSummary || '').trim() || '最终诊断已完成',
        jdText: effectiveJdText,
        targetCompany: targetCompany || (resumeData as any)?.targetCompany || '',
        weaknesses: Array.isArray(finalReportAdvice) ? finalReportAdvice : [],
      });
    } catch (dossierErr) {
      console.warn('Failed to persist final diagnosis dossier to user profile:', dossierErr);
    }

    showToast('优化简历已保存', 'success');
    navigateToStep('final_report', true);
  }, [
    currentUserId,
    generatedResume,
    sourceResumeIdRef,
    resumeData,
    jdText,
    makeJdKey,
    allResumes,
    isSameResumeId,
    targetCompany,
    setResumeData,
    setSelectedResumeId,
    setAnalysisResumeId,
    setOptimizedResumeId,
    showToast,
    navigateToStep,
    finalReportScore,
    finalReportSummary,
    finalReportAdvice,
    finalAnalysisReady,
  ]);

  return { handleCompleteAndSavePostInterview };
};
