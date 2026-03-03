export type CareerProfileFactKind = 'skill' | 'highlight' | 'constraint';

export type CareerProfileFactItem = {
  id: string;
  kind: CareerProfileFactKind;
  text: string;
  key: string;
  aliases?: CareerProfileFactKind[];
};

export type CareerProfileFactSectionKey = 'coreSkills' | 'careerHighlights' | 'constraints';

export type CareerProfileAtomicTagCategory =
  | 'identity'
  | 'intent'
  | 'preference'
  | 'summary'
  | 'fact_skill'
  | 'fact_highlight'
  | 'fact_constraint'
  | 'experience'
  | 'project'
  | 'education';

export type CareerProfileAtomicTag = {
  id: string;
  category: CareerProfileAtomicTagCategory;
  text: string;
  key: string;
  label?: string;
  sourcePaths?: string[];
  aliases?: CareerProfileAtomicTagCategory[];
};

export type CareerProfileAtomicProfileInput = {
  summary?: unknown;
  coreSkills?: unknown;
  careerHighlights?: unknown;
  constraints?: unknown;
  factItems?: unknown;
  mbti?: unknown;
  personality?: unknown;
  workStyle?: unknown;
  careerGoal?: unknown;
  targetRole?: unknown;
  jobDirection?: unknown;
  targetSalary?: unknown;
  personalInfo?: unknown;
  gender?: unknown;
  experiences?: unknown;
  projects?: unknown;
  educations?: unknown;
};

export type CareerProfileFactDraftEntry = {
  factId: string;
  text: string;
  key: string;
};

export type CareerProfileFactDraftSections = {
  coreSkills: CareerProfileFactDraftEntry[];
  careerHighlights: CareerProfileFactDraftEntry[];
  constraints: CareerProfileFactDraftEntry[];
};

type ReconcileInput = {
  coreSkills?: unknown;
  careerHighlights?: unknown;
  constraints?: unknown;
};

type ReconcileOutput = {
  coreSkills: string[];
  careerHighlights: string[];
  constraints: string[];
  factItems: CareerProfileFactItem[];
};

const toText = (value: unknown, maxLen = 220): string =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);

const hasCjk = (value: string): boolean => /[\u3400-\u9fff]/.test(value);

const normalizeTextKey = (value: unknown): string =>
  toText(value)
    .toLowerCase()
    .replace(/[，,。.!！？?;；:：、"'`~@#$%^&*+=<>《》()（）[\]{}【】|\\/\-_]/g, '')
    .replace(/\s+/g, '');

const containsByMinLength = (candidate: string, carrier: string): boolean => {
  const minLen = hasCjk(candidate) ? 2 : 4;
  if (!candidate || candidate.length < minLen) return false;
  return carrier.includes(candidate);
};

const hasDirectOverlap = (left: unknown, right: unknown): boolean => {
  const leftRaw = normalizeTextKey(left);
  const rightRaw = normalizeTextKey(right);
  if (!leftRaw || !rightRaw) return false;
  if (leftRaw === rightRaw) return true;
  return containsByMinLength(leftRaw, rightRaw) || containsByMinLength(rightRaw, leftRaw);
};

const toFactKind = (section: CareerProfileFactSectionKey): CareerProfileFactKind => {
  if (section === 'constraints') return 'constraint';
  if (section === 'coreSkills') return 'skill';
  return 'highlight';
};

const asStringList = (value: unknown, maxItems: number, maxLen: number): string[] => {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const text = toText(item, maxLen);
    if (!text) continue;
    const key = normalizeTextKey(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= maxItems) break;
  }
  return out;
};

const buildFactId = (kind: CareerProfileFactKind, text: string, index: number): string => {
  const key = normalizeTextKey(text).slice(0, 24) || `item_${index + 1}`;
  return `${kind}_${index + 1}_${key}`;
};

const dedupeTexts = (items: string[]): string[] => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const text = toText(item, 220);
    if (!text) continue;
    const key = normalizeTextKey(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
};

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' ? (value as Record<string, any>) : {};

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const buildAtomicTagId = (key: string, index: number): string => {
  const suffix = String(key || '').slice(0, 24) || `item_${index + 1}`;
  return `atomic_${index + 1}_${suffix}`;
};

const flattenDraft = (draft: CareerProfileFactDraftSections): CareerProfileFactDraftEntry[] => [
  ...draft.constraints,
  ...draft.coreSkills,
  ...draft.careerHighlights,
];

const cloneDraft = (draft: CareerProfileFactDraftSections): CareerProfileFactDraftSections => ({
  coreSkills: draft.coreSkills.map((item) => ({ ...item })),
  careerHighlights: draft.careerHighlights.map((item) => ({ ...item })),
  constraints: draft.constraints.map((item) => ({ ...item })),
});

const buildFactIdGenerator = (seedItems: CareerProfileFactDraftEntry[] = []) => {
  const used = new Set<string>(seedItems.map((item) => String(item.factId || '').trim()).filter(Boolean));
  let cursor = seedItems.length;
  return (kind: CareerProfileFactKind, text: string): string => {
    let candidate = buildFactId(kind, text, cursor);
    cursor += 1;
    while (used.has(candidate)) {
      candidate = buildFactId(kind, text, cursor);
      cursor += 1;
    }
    used.add(candidate);
    return candidate;
  };
};

const resolveFactIdFromPool = (
  text: string,
  entries: CareerProfileFactDraftEntry[],
  createFallbackId: (kind: CareerProfileFactKind, text: string) => string,
  fallbackKind: CareerProfileFactKind
): string => {
  const key = normalizeTextKey(text);
  if (!key) return createFallbackId(fallbackKind, text);
  const exact = entries.find((item) => item.key === key);
  if (exact) return exact.factId;
  const overlap = entries.find((item) => hasDirectOverlap(item.key, key));
  if (overlap) return overlap.factId;
  return createFallbackId(fallbackKind, text);
};

const buildDraftEntriesByTexts = (
  section: CareerProfileFactSectionKey,
  texts: string[],
  draftPool: CareerProfileFactDraftEntry[],
  seedSectionEntries: CareerProfileFactDraftEntry[] = []
): CareerProfileFactDraftEntry[] => {
  const makeId = buildFactIdGenerator([...draftPool, ...seedSectionEntries]);
  const next: CareerProfileFactDraftEntry[] = [];
  const usedFactIds = new Set<string>();
  const seedByKey = new Map(seedSectionEntries.map((item) => [item.key, item] as const));
  for (let idx = 0; idx < texts.length; idx += 1) {
    const raw = texts[idx];
    const text = toText(raw, section === 'coreSkills' ? 60 : 220);
    if (!text) continue;
    const key = normalizeTextKey(text);
    if (!key) continue;
    const seedHit = seedByKey.get(key);
    const positionalHit = seedSectionEntries[idx];
    const factId = seedHit
      ? seedHit.factId
      : positionalHit && !usedFactIds.has(positionalHit.factId)
        ? positionalHit.factId
      : resolveFactIdFromPool(text, draftPool, makeId, toFactKind(section));
    if (usedFactIds.has(factId)) continue;
    usedFactIds.add(factId);
    next.push({ factId, text, key });
  }
  return next;
};

export const createCareerProfileFactDraftSections = (input: {
  coreSkills?: unknown;
  careerHighlights?: unknown;
  constraints?: unknown;
  factItems?: unknown;
}): CareerProfileFactDraftSections => {
  const rawSkills = asStringList(input.coreSkills, 20, 60);
  const rawHighlights = asStringList(input.careerHighlights, 12, 220);
  const rawConstraints = asStringList(input.constraints, 10, 180);

  const seededFactEntries: CareerProfileFactDraftEntry[] = [];
  if (Array.isArray(input.factItems)) {
    for (const item of input.factItems) {
      const text = toText((item as any)?.text, 220);
      const factId = String((item as any)?.id || '').trim();
      const key = normalizeTextKey((item as any)?.key || text);
      if (!text || !factId || !key) continue;
      seededFactEntries.push({ factId, text, key });
    }
  }

  const draft: CareerProfileFactDraftSections = {
    constraints: buildDraftEntriesByTexts('constraints', rawConstraints, seededFactEntries),
    coreSkills: [],
    careerHighlights: [],
  };
  draft.coreSkills = buildDraftEntriesByTexts('coreSkills', rawSkills, [...seededFactEntries, ...draft.constraints]);
  draft.careerHighlights = buildDraftEntriesByTexts(
    'careerHighlights',
    rawHighlights,
    [...seededFactEntries, ...draft.constraints, ...draft.coreSkills]
  );
  return draft;
};

export const projectCareerProfileFactDraftSections = (
  draft: CareerProfileFactDraftSections
): { coreSkills: string[]; careerHighlights: string[]; constraints: string[] } => {
  return {
    coreSkills: dedupeTexts(draft.coreSkills.map((item) => item.text)),
    careerHighlights: dedupeTexts(draft.careerHighlights.map((item) => item.text)),
    constraints: dedupeTexts(draft.constraints.map((item) => item.text)),
  };
};

export const cascadeCareerProfileFactDraftEdit = (
  draft: CareerProfileFactDraftSections,
  section: CareerProfileFactSectionKey,
  nextTexts: string[]
): CareerProfileFactDraftSections => {
  const next = cloneDraft(draft);
  const pool = flattenDraft(next);
  const seedSectionEntries = next[section];
  const patchedSection = buildDraftEntriesByTexts(section, nextTexts, pool, seedSectionEntries);
  next[section] = patchedSection;

  // Mirror text changes to same factId in other sections.
  const patchByFactId = new Map<string, CareerProfileFactDraftEntry>();
  for (const entry of patchedSection) {
    patchByFactId.set(entry.factId, entry);
  }

  const sectionKeys: CareerProfileFactSectionKey[] = ['constraints', 'coreSkills', 'careerHighlights'];
  for (const key of sectionKeys) {
    if (key === section) continue;
    next[key] = next[key].map((item) => {
      const hit = patchByFactId.get(item.factId);
      if (!hit) return item;
      return { ...item, text: hit.text, key: hit.key };
    });
  }

  return next;
};

export const materializeCareerProfileFactsFromDraft = (draft: CareerProfileFactDraftSections): ReconcileOutput => {
  const projected = projectCareerProfileFactDraftSections(draft);
  const reconciled = reconcileCareerProfileFactSections(projected);
  const allEntries = flattenDraft(draft);
  const used = new Set<string>();
  const nextFactItems: CareerProfileFactItem[] = [];
  const makeId = buildFactIdGenerator(allEntries);

  const appendItem = (kind: CareerProfileFactKind, text: string) => {
    const hit = allEntries.find((item) => hasDirectOverlap(item.text, text));
    const factId = String(hit?.factId || '').trim() || makeId(kind, text);
    const key = normalizeTextKey(text);
    if (!factId || !key || used.has(factId)) return;
    used.add(factId);
    nextFactItems.push({
      id: factId,
      kind,
      text,
      key,
    });
  };

  reconciled.constraints.forEach((item) => appendItem('constraint', item));
  reconciled.coreSkills.forEach((item) => appendItem('skill', item));
  reconciled.careerHighlights.forEach((item) => appendItem('highlight', item));

  return {
    ...reconciled,
    factItems: nextFactItems,
  };
};

export const reconcileCareerProfileFactSections = (input: ReconcileInput): ReconcileOutput => {
  const rawConstraints = asStringList(input.constraints, 10, 180);
  const rawSkills = asStringList(input.coreSkills, 20, 60);
  const rawHighlights = asStringList(input.careerHighlights, 12, 220);

  const constraints: string[] = [];
  for (const item of rawConstraints) {
    if (constraints.some((existing) => hasDirectOverlap(existing, item))) continue;
    constraints.push(item);
  }

  const coreSkills: string[] = [];
  for (const item of rawSkills) {
    if (constraints.some((existing) => hasDirectOverlap(existing, item))) continue;
    if (coreSkills.some((existing) => hasDirectOverlap(existing, item))) continue;
    coreSkills.push(item);
  }

  const careerHighlights: string[] = [];
  for (const item of rawHighlights) {
    if (constraints.some((existing) => hasDirectOverlap(existing, item))) continue;
    if (coreSkills.some((existing) => hasDirectOverlap(existing, item))) continue;
    if (careerHighlights.some((existing) => hasDirectOverlap(existing, item))) continue;
    careerHighlights.push(item);
  }

  const factItems: CareerProfileFactItem[] = [];
  const byKey = new Map<string, CareerProfileFactItem>();
  const appendFact = (kind: CareerProfileFactKind, text: string) => {
    const key = normalizeTextKey(text);
    if (!key) return;
    const hit = byKey.get(key);
    if (hit) {
      const aliasSet = new Set<CareerProfileFactKind>([hit.kind, ...(hit.aliases || [])]);
      aliasSet.add(kind);
      hit.aliases = Array.from(aliasSet).filter((value) => value !== hit.kind);
      return;
    }
    const next: CareerProfileFactItem = {
      id: buildFactId(kind, text, factItems.length),
      kind,
      text,
      key,
    };
    byKey.set(key, next);
    factItems.push(next);
  };

  constraints.forEach((item) => appendFact('constraint', item));
  coreSkills.forEach((item) => appendFact('skill', item));
  careerHighlights.forEach((item) => appendFact('highlight', item));

  return {
    coreSkills,
    careerHighlights,
    constraints,
    factItems,
  };
};

export const buildCareerProfileAtomicTags = (
  input: CareerProfileAtomicProfileInput
): CareerProfileAtomicTag[] => {
  const tags: CareerProfileAtomicTag[] = [];
  const byKey = new Map<string, CareerProfileAtomicTag>();

  const append = (
    category: CareerProfileAtomicTagCategory,
    value: unknown,
    label: string,
    sourcePath: string,
    maxLen = 240
  ) => {
    const text = toText(value, maxLen);
    if (!text) return;
    const key = normalizeTextKey(text);
    if (!key) return;

    const hit = byKey.get(key);
    if (hit) {
      const aliasSet = new Set<CareerProfileAtomicTagCategory>([hit.category, ...(hit.aliases || [])]);
      aliasSet.add(category);
      hit.aliases = Array.from(aliasSet).filter((item) => item !== hit.category);
      const sourceSet = new Set<string>(hit.sourcePaths || []);
      sourceSet.add(sourcePath);
      hit.sourcePaths = Array.from(sourceSet);
      return;
    }

    const next: CareerProfileAtomicTag = {
      id: buildAtomicTagId(key, tags.length),
      category,
      text,
      key,
      label,
      sourcePaths: [sourcePath],
    };
    byKey.set(key, next);
    tags.push(next);
  };

  const personalInfo = asRecord(input.personalInfo);
  append('identity', personalInfo.name, '姓名', 'personalInfo.name', 100);
  append('identity', personalInfo.email, '邮箱', 'personalInfo.email', 120);
  append('identity', personalInfo.phone, '电话', 'personalInfo.phone', 40);
  append('identity', personalInfo.location, '所在城市', 'personalInfo.location', 100);
  append('identity', personalInfo.linkedin, 'LinkedIn', 'personalInfo.linkedin', 200);
  append('identity', personalInfo.website, '个人网址', 'personalInfo.website', 200);
  append('identity', input.gender, '性别', 'gender', 20);

  append('intent', personalInfo.title, '求职意向', 'personalInfo.title', 120);
  append('intent', input.targetRole, '目标岗位', 'targetRole', 120);
  append('intent', input.jobDirection, '求职方向', 'jobDirection', 120);
  append('preference', input.targetSalary, '目标薪资', 'targetSalary', 120);
  append('preference', input.careerGoal, '职业目标', 'careerGoal', 220);
  append('preference', input.mbti, 'MBTI', 'mbti', 40);
  append('preference', input.personality, '性格特征', 'personality', 260);
  append('preference', input.workStyle, '工作方式偏好', 'workStyle', 260);

  const factItems = asArray(input.factItems);
  const fallbackFactSkills = factItems
    .filter((item) => String((item as any)?.kind || '').trim() === 'skill')
    .map((item) => (item as any)?.text);
  const fallbackFactHighlights = factItems
    .filter((item) => String((item as any)?.kind || '').trim() === 'highlight')
    .map((item) => (item as any)?.text);
  const fallbackFactConstraints = factItems
    .filter((item) => String((item as any)?.kind || '').trim() === 'constraint')
    .map((item) => (item as any)?.text);

  const factSections = reconcileCareerProfileFactSections({
    coreSkills:
      asArray(input.coreSkills).length > 0
        ? input.coreSkills
        : fallbackFactSkills,
    careerHighlights:
      asArray(input.careerHighlights).length > 0
        ? input.careerHighlights
        : fallbackFactHighlights,
    constraints:
      asArray(input.constraints).length > 0
        ? input.constraints
        : fallbackFactConstraints,
  });

  factSections.constraints.forEach((text, idx) =>
    append('fact_constraint', text, `约束条件 ${idx + 1}`, `constraints[${idx}]`, 180)
  );
  factSections.coreSkills.forEach((text, idx) =>
    append('fact_skill', text, `核心技能 ${idx + 1}`, `coreSkills[${idx}]`, 120)
  );
  factSections.careerHighlights.forEach((text, idx) =>
    append('fact_highlight', text, `职业亮点 ${idx + 1}`, `careerHighlights[${idx}]`, 220)
  );

  asArray(input.experiences).forEach((entry, idx) => {
    const item = asRecord(entry);
    const base = `experiences[${idx}]`;
    append('experience', item.title || item.name, '经历标题', `${base}.title`, 120);
    append('experience', item.organization || item.company, '经历组织', `${base}.organization`, 120);
    append('experience', item.period || item.date, '经历时间', `${base}.period`, 80);
    append('experience', item.actions || item.action, '经历行动', `${base}.actions`, 260);
    append('experience', item.results || item.result, '经历结果', `${base}.results`, 260);
    asArray(item.skills).forEach((skill, skillIdx) =>
      append('fact_skill', skill, '经历技能', `${base}.skills[${skillIdx}]`, 80)
    );
  });

  asArray(input.projects).forEach((entry, idx) => {
    const item = asRecord(entry);
    const base = `projects[${idx}]`;
    append('project', item.title || item.name, '项目名称', `${base}.title`, 120);
    append('project', item.subtitle || item.role, '项目角色', `${base}.subtitle`, 120);
    append('project', item.period || item.date, '项目时间', `${base}.period`, 80);
    append('project', item.description, '项目描述', `${base}.description`, 260);
  });

  asArray(input.educations).forEach((entry, idx) => {
    const item = asRecord(entry);
    const base = `educations[${idx}]`;
    append('education', item.school || item.title || item.university, '学校', `${base}.school`, 120);
    append('education', item.degree, '学历', `${base}.degree`, 100);
    append('education', item.major || item.subtitle, '专业', `${base}.major`, 120);
    append('education', item.period || item.date, '教育时间', `${base}.period`, 80);
  });

  append('summary', input.summary, '画像总结', 'summary', 260);

  return tags;
};
