import { normalizeTimelineFields } from '../../../../src/timeline-utils';

const normalizeText = (value: any) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[，,。.;；:：\-—_()（）\[\]【】'"`]/g, '');

const pickFirstFilled = (...values: any[]) => {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return '';
};

const normalizeContact = (value: unknown) => String(value || '').trim();
const isLikelyEmail = (value: unknown) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeContact(value));
const isLikelyPhone = (value: unknown) => {
  const raw = normalizeContact(value);
  if (!raw) return false;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return false;
  if (!/^[+()\-.\s\d]+$/.test(raw)) return false;
  return true;
};

export const repairGeneratedContacts = (generated: any, primarySource: any, fallbackSource: any) => {
  if (!generated || typeof generated !== 'object') return generated;
  const next: any = { ...generated };
  next.personalInfo = { ...(next.personalInfo || {}) };
  const srcPersonal = (primarySource && typeof primarySource === 'object' ? (primarySource.personalInfo || {}) : {});
  const fallbackPersonal = (fallbackSource && typeof fallbackSource === 'object' ? (fallbackSource.personalInfo || {}) : {});
  const sourceEmail = normalizeContact(srcPersonal?.email) || normalizeContact(fallbackPersonal?.email);
  const sourcePhone = normalizeContact(srcPersonal?.phone) || normalizeContact(fallbackPersonal?.phone);
  const sourceName = normalizeContact(srcPersonal?.name) || normalizeContact(fallbackPersonal?.name);
  const validSourceEmail = isLikelyEmail(sourceEmail) ? sourceEmail : '';
  const validSourcePhone = isLikelyPhone(sourcePhone) ? sourcePhone : '';
  if (sourceName) {
    next.personalInfo.name = sourceName;
  }
  if (validSourceEmail) {
    next.personalInfo.email = validSourceEmail;
  }
  if (validSourcePhone) {
    next.personalInfo.phone = validSourcePhone;
  }
  return next;
};

export const fillGeneratedResumeTimeline = (generated: any, source: any) => {
  if (!generated || typeof generated !== 'object') return generated;
  const next: any = { ...generated };
  const src = (source && typeof source === 'object') ? source : {};

  if (Array.isArray(next.workExps)) {
    const sourceList = Array.isArray(src.workExps) ? src.workExps : [];
    const used = new Set<number>();
    next.workExps = next.workExps.map((item: any, idx: number) => {
      if (!item || typeof item !== 'object') return item;
      const itemSig = normalizeText([item.company, item.title, item.position, item.subtitle].filter(Boolean).join(' '));
      let hitIndex = -1;
      if (itemSig) {
        hitIndex = sourceList.findIndex((candidate: any, cIdx: number) => {
          if (used.has(cIdx) || !candidate) return false;
          const candidateSig = normalizeText([candidate.company, candidate.title, candidate.position, candidate.subtitle].filter(Boolean).join(' '));
          return !!candidateSig && (candidateSig.includes(itemSig) || itemSig.includes(candidateSig));
        });
      }
      if (hitIndex < 0 && idx < sourceList.length && !used.has(idx)) {
        hitIndex = idx;
      }
      if (hitIndex >= 0) used.add(hitIndex);
      const srcItem: any = hitIndex >= 0 ? (sourceList[hitIndex] || {}) : {};
      const normalizedTimeline = normalizeTimelineFields({
        date: pickFirstFilled(item.date, srcItem.date, srcItem.startDate && srcItem.endDate ? `${srcItem.startDate} - ${srcItem.endDate}` : ''),
        startDate: pickFirstFilled(item.startDate, srcItem.startDate),
        endDate: pickFirstFilled(item.endDate, srcItem.endDate),
      });
      return {
        ...item,
        date: normalizedTimeline.date,
        startDate: normalizedTimeline.startDate,
        endDate: normalizedTimeline.endDate,
      };
    });
  }

  if (Array.isArray(next.projects)) {
    const sourceList = Array.isArray(src.projects) ? src.projects : [];
    next.projects = next.projects.map((item: any, idx: number) => {
      if (!item || typeof item !== 'object') return item;
      const srcItem: any = sourceList[idx] || {};
      const normalizedTimeline = normalizeTimelineFields({
        date: pickFirstFilled(item.date, srcItem.date, srcItem.startDate && srcItem.endDate ? `${srcItem.startDate} - ${srcItem.endDate}` : ''),
        startDate: pickFirstFilled(item.startDate, srcItem.startDate),
        endDate: pickFirstFilled(item.endDate, srcItem.endDate),
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
