export type CareerProfileExperience = {
  title: string;
  period: string;
  organization: string;
  actions: string;
  results: string;
  skills: string[];
  inResume: 'yes' | 'no' | 'unknown';
  confidence: 'high' | 'medium' | 'low';
  evidence: string;
};

export type CareerProfile = {
  id: string;
  createdAt: string;
  source: string;
  summary: string;
  careerHighlights: string[];
  coreSkills: string[];
  constraints: string[];
  experiences: CareerProfileExperience[];
  rawInput?: string;
};

const compactText = (value: unknown, maxLen = 300) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.slice(0, maxLen);
};

const normalizeStringList = (value: unknown, maxItems = 20, maxLen = 80): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const text = compactText(item, maxLen);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= maxItems) break;
  }
  return out;
};

const normalizeExperience = (item: any, fallbackIndex: number): CareerProfileExperience | null => {
  if (!item || typeof item !== 'object') return null;
  const title = compactText(item.title || item.name || `经历${fallbackIndex}`, 80);
  if (!title) return null;
  const inResumeRaw = String(item.inResume || item.isInResume || '').trim().toLowerCase();
  const confidenceRaw = String(item.confidence || '').trim().toLowerCase();
  const inResume: CareerProfileExperience['inResume'] =
    inResumeRaw === 'yes' || inResumeRaw === 'no' || inResumeRaw === 'unknown'
      ? (inResumeRaw as CareerProfileExperience['inResume'])
      : 'unknown';
  const confidence: CareerProfileExperience['confidence'] =
    confidenceRaw === 'high' || confidenceRaw === 'medium' || confidenceRaw === 'low'
      ? (confidenceRaw as CareerProfileExperience['confidence'])
      : 'medium';

  return {
    title,
    period: compactText(item.period, 80),
    organization: compactText(item.organization || item.company, 100),
    actions: compactText(item.actions || item.action, 400),
    results: compactText(item.results || item.result, 400),
    skills: normalizeStringList(item.skills, 12, 40),
    inResume,
    confidence,
    evidence: compactText(item.evidence || '来自用户自述', 120),
  };
};

export const normalizeCareerProfile = (raw: any): CareerProfile | null => {
  if (!raw || typeof raw !== 'object') return null;
  const experiencesRaw = Array.isArray(raw.experiences) ? raw.experiences : (Array.isArray(raw.careerFacts) ? raw.careerFacts : []);
  const experiences: CareerProfileExperience[] = [];
  experiencesRaw.forEach((item, index) => {
    const normalized = normalizeExperience(item, index + 1);
    if (normalized) experiences.push(normalized);
  });

  const summary = compactText(raw.summary || raw.profileSummary || raw.careerSummary, 260);
  if (!summary && !experiences.length) return null;

  return {
    id: compactText(raw.id || `career_profile_${Date.now()}`, 80),
    createdAt: compactText(raw.createdAt || new Date().toISOString(), 80),
    source: compactText(raw.source || 'manual_self_report', 60),
    summary,
    careerHighlights: normalizeStringList(raw.careerHighlights || raw.highlights, 10, 220),
    coreSkills: normalizeStringList(raw.coreSkills || raw.skills, 20, 40),
    constraints: normalizeStringList(raw.constraints || raw.hardConstraints, 10, 160),
    experiences: experiences.slice(0, 12),
    rawInput: compactText(raw.rawInput, 2000),
  };
};

export const getLatestCareerProfile = (userProfile: any): CareerProfile | null => {
  return normalizeCareerProfile(userProfile?.career_profile_latest || null);
};

export const buildCareerProfileFingerprint = (profile: CareerProfile | null): string => {
  if (!profile) return 'no_profile';
  const source = JSON.stringify({
    summary: profile.summary,
    highlights: profile.careerHighlights,
    skills: profile.coreSkills,
    constraints: profile.constraints,
    experiences: profile.experiences.map((x) => ({
      title: x.title,
      period: x.period,
      organization: x.organization,
      actions: x.actions,
      results: x.results,
      inResume: x.inResume,
      confidence: x.confidence,
    })),
  });
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) {
    hash = (hash * 31 + source.charCodeAt(i)) >>> 0;
  }
  return `${source.length}_${hash.toString(16)}`;
};
