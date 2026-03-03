import type {
  CareerProfileAtomicTag,
  CareerProfileAtomicTagCategory,
} from '../../../src/career-profile-facts';

export type AtomicTagCategoryConfig = {
  key: CareerProfileAtomicTagCategory;
  label: string;
  maxItems: number;
  maxLen: number;
};

export const ATOMIC_TAG_CATEGORY_CONFIGS: AtomicTagCategoryConfig[] = [
  { key: 'identity', label: '身份信息', maxItems: 12, maxLen: 120 },
  { key: 'intent', label: '求职意向', maxItems: 6, maxLen: 120 },
  { key: 'preference', label: '偏好与目标', maxItems: 12, maxLen: 220 },
  { key: 'summary', label: '画像总结', maxItems: 3, maxLen: 260 },
  { key: 'fact_skill', label: '核心技能标签', maxItems: 30, maxLen: 80 },
  { key: 'fact_highlight', label: '职业亮点标签', maxItems: 20, maxLen: 220 },
  { key: 'fact_constraint', label: '约束条件标签', maxItems: 20, maxLen: 180 },
  { key: 'experience', label: '经历事实标签', maxItems: 30, maxLen: 220 },
  { key: 'project', label: '项目事实标签', maxItems: 20, maxLen: 220 },
  { key: 'education', label: '教育事实标签', maxItems: 20, maxLen: 180 },
];

const normalizeText = (value: unknown, maxLen: number): string =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);

const normalizeTextKey = (value: unknown): string =>
  normalizeText(value, 260)
    .toLowerCase()
    .replace(/[，,。.!！？?;；:：、"'`~@#$%^&*+=<>《》()（）[\]{}【】|\\/\-_]/g, '')
    .replace(/\s+/g, '');

const hasCjk = (value: string): boolean => /[\u3400-\u9fff]/.test(value);

const normalizeSemanticKey = (value: unknown): string => {
  let key = normalizeTextKey(value);
  if (!key) return '';
  key = key
    .replace(/\d+(?:\.\d+)?(?:年|个月|月|周|天)/g, '')
    .replace(/从事|相关|工作|从业者|从业|行业|经验|经历|进行|活动|具备|拥有|背景|业务|方面|领域|职责|标签|事实/g, '')
    .replace(/者$/g, '')
    .trim();
  return key;
};

const isDurationOnlyText = (value: string): boolean => {
  const text = normalizeText(value, 80);
  if (!text) return false;
  return (
    /^\d+(?:\.\d+)?\s*(?:年|个月|月|周|天)$/i.test(text) ||
    /^\d{4}(?:[./-]\d{1,2})?\s*[-~至到]+\s*(?:\d{4}(?:[./-]\d{1,2})?|至今)$/i.test(text)
  );
};

const isGenericTemplateText = (value: string): boolean => {
  const text = normalizeText(value, 260);
  if (!text) return false;
  return (
    /从事.+工作/.test(text) ||
    /相关工作/.test(text) ||
    /从业者/.test(text) ||
    /行业经验/.test(text) ||
    /进行.+活动/.test(text) ||
    /具备.+背景/.test(text) ||
    /经验$/.test(text) ||
    /经历$/.test(text) ||
    /业务$/.test(text)
  );
};

const shouldSemanticMergeCategory = (category: CareerProfileAtomicTagCategory): boolean =>
  category === 'fact_skill' ||
  category === 'fact_highlight' ||
  category === 'fact_constraint' ||
  category === 'experience' ||
  category === 'project' ||
  category === 'education';

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

const isSemanticKeyUsable = (key: string): boolean => {
  if (!key) return false;
  if (hasCjk(key)) return key.length >= 2;
  return key.length >= 4;
};

const scoreAtomicText = (value: string): number => {
  const text = normalizeText(value, 260);
  if (!text) return -999;
  let score = Math.min(text.length, 48);
  if (/\d/.test(text)) score += 6;
  if (/(增长|提升|优化|降本|上线|落地|主导|搭建|转化|营收|roi|gmv)/i.test(text)) score += 4;
  if (isGenericTemplateText(text)) score -= 10;
  if (isDurationOnlyText(text)) score -= 20;
  return score;
};

const buildTagId = (category: CareerProfileAtomicTagCategory, key: string, index: number): string =>
  `manual_${category}_${index + 1}_${String(key || '').slice(0, 24) || `item_${index + 1}`}`;

export const parseAtomicTagText = (value: string, maxItems: number, maxLen: number): string[] => {
  const items = String(value || '')
    .split(/[\n,，;；、]+/)
    .map((item) => normalizeText(item, maxLen))
    .filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const key = normalizeTextKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= maxItems) break;
  }
  return out;
};

export const toAtomicCategoryText = (
  tags: CareerProfileAtomicTag[] | undefined,
  category: CareerProfileAtomicTagCategory
): string => {
  if (!Array.isArray(tags) || tags.length === 0) return '';
  return tags
    .filter((item) => item.category === category)
    .map((item) => String(item.text || '').trim())
    .filter(Boolean)
    .join('\n');
};

const mergeAtomicTagsByKey = (tags: CareerProfileAtomicTag[]): CareerProfileAtomicTag[] => {
  const byKey = new Map<string, CareerProfileAtomicTag>();
  const bySemanticKey = new Map<string, CareerProfileAtomicTag>();
  const out: CareerProfileAtomicTag[] = [];
  for (const item of tags) {
    const text = normalizeText(item.text, 260);
    const key = normalizeTextKey(item.key || text);
    if (!text || !key) continue;
    if (shouldSemanticMergeCategory(item.category) && isDurationOnlyText(text)) {
      // Skip low-information time fragments such as "5年"/"3年".
      continue;
    }
    const hit = byKey.get(key);
    if (hit) {
      const aliasSet = new Set<CareerProfileAtomicTagCategory>([hit.category, ...(hit.aliases || [])]);
      aliasSet.add(item.category);
      hit.aliases = Array.from(aliasSet).filter((entry) => entry !== hit.category);
      const sourceSet = new Set<string>([...(hit.sourcePaths || []), ...(item.sourcePaths || [])]);
      hit.sourcePaths = Array.from(sourceSet);
      continue;
    }
    const semanticKey = normalizeSemanticKey(text);
    const semanticHit =
      isSemanticKeyUsable(semanticKey) &&
      shouldSemanticMergeCategory(item.category)
        ? bySemanticKey.get(semanticKey)
        : undefined;
    if (
      semanticHit &&
      shouldSemanticMergeCategory(semanticHit.category) &&
      (hasDirectOverlap(semanticHit.text, text) ||
        isGenericTemplateText(semanticHit.text) ||
        isGenericTemplateText(text))
    ) {
      const aliasSet = new Set<CareerProfileAtomicTagCategory>([
        semanticHit.category,
        ...(semanticHit.aliases || []),
      ]);
      aliasSet.add(item.category);
      semanticHit.aliases = Array.from(aliasSet).filter((entry) => entry !== semanticHit.category);
      const sourceSet = new Set<string>([
        ...(semanticHit.sourcePaths || []),
        ...(item.sourcePaths || []),
      ]);
      semanticHit.sourcePaths = Array.from(sourceSet);

      if (scoreAtomicText(text) > scoreAtomicText(semanticHit.text)) {
        const oldKey = semanticHit.key;
        semanticHit.text = text;
        semanticHit.key = key;
        if (oldKey !== key) {
          byKey.delete(oldKey);
          byKey.set(key, semanticHit);
        }
      }
      continue;
    }
    const next: CareerProfileAtomicTag = {
      ...item,
      text,
      key,
    };
    byKey.set(key, next);
    if (isSemanticKeyUsable(semanticKey) && shouldSemanticMergeCategory(item.category)) {
      bySemanticKey.set(semanticKey, next);
    }
    out.push(next);
  }
  return out;
};

export const replaceAtomicTagsByCategory = (
  tags: CareerProfileAtomicTag[] | undefined,
  category: CareerProfileAtomicTagCategory,
  texts: string[],
  categoryLabel?: string
): CareerProfileAtomicTag[] => {
  const current = Array.isArray(tags) ? tags : [];
  const shouldCascadeReplace = shouldSemanticMergeCategory(category);
  const keep = current.filter((item) => {
    if (item.category === category) return false;
    if (!shouldCascadeReplace) return true;
    if (!shouldSemanticMergeCategory(item.category)) return true;
    return !texts.some((nextText) => {
      if (hasDirectOverlap(item.text, nextText)) return true;
      const left = normalizeSemanticKey(item.text);
      const right = normalizeSemanticKey(nextText);
      if (!isSemanticKeyUsable(left) || !isSemanticKeyUsable(right)) return false;
      return left === right;
    });
  });
  const next = texts.map((text, index) => {
    const key = normalizeTextKey(text);
    return {
      id: buildTagId(category, key, index),
      category,
      text: normalizeText(text, 260),
      key,
      label: categoryLabel,
      sourcePaths: [`atomicTags.${category}`],
    } as CareerProfileAtomicTag;
  });
  return mergeAtomicTagsByKey([...keep, ...next]);
};

export const mergeAtomicTagsPreferManual = (
  generatedTags: CareerProfileAtomicTag[] | undefined,
  manualTags: CareerProfileAtomicTag[] | undefined
): CareerProfileAtomicTag[] => {
  const merged = [...(Array.isArray(manualTags) ? manualTags : []), ...(Array.isArray(generatedTags) ? generatedTags : [])];
  return mergeAtomicTagsByKey(merged);
};
