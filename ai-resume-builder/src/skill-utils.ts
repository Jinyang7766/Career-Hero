// Shared skill parsing/normalization utilities.
// This is the single source of truth for skill tokenization used by:
// - resume import (parse-resume / parse-pdf results)
// - AI analysis suggestions (skills suggestedValue normalization)

const normalizeSkillToken = (raw: any) => {
  const text = String(raw ?? '')
    .replace(/[•·]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  return text;
};

const toNounSkillToken = (raw: string) => {
  let t = String(raw ?? '').trim();
  if (!t) return '';

  // Remove common action/process words and keep noun-like "tool/tech/method" tokens.
  const actionWords = [
    '搭建',
    '构建',
    '设计',
    '训练',
    '微调',
    '精调',
    '调优',
    '优化',
    '执行',
    '推进',
    '落地',
    '管理',
    '脚本',
    '自动化',
    '开发',
    '实现',
    '运营',
    '打造',
    '分析',
    '监控',
    '维护',
    '产出'
  ];
  actionWords.forEach((w) => {
    t = t.replace(new RegExp(w, 'g'), '');
  });

  // Cleanup conjunction leftovers like "模型与", "流程和".
  t = t
    .replace(/[与和及、,\s]+$/g, '')
    .replace(/^[与和及、,\s]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Drop pure action remnants.
  if (/^(微调|精调|调优|优化|自动化|搭建|构建|设计|训练|开发|实现|运营|管理)$/.test(t)) {
    return '';
  }

  // Semantic normalization.
  t = t
    .replace(/智能化数据看板/g, '数据可视化')
    .replace(/数据看板/g, '数据可视化')
    .replace(/AI短视频分镜/g, '短视频内容策划');

  return t;
};

const isProfessionalSkillToken = (token: string) => {
  const t = String(token ?? '').trim();
  if (!t || t.length < 2) return false;

  const keepPatterns = [
    /^(sql|python|java|javascript|typescript|excel|tableau|power\s?bi|scrm|crm|ltv|roi|cpc|cpa|cpm|gmv|erp|wms|sap|vba|ga4|seo|sem|a\/b\s?test|ab\s?test)$/i,
    /(生意参谋|京东商智|万相台|直通车|引力魔方|京东快车|千川|巨量引擎|飞书|钉钉|notion|chatgpt|zapier|make|airtable|supabase|photoshop|figma)/i,
    /(数据分析|数据建模|数据可视化|用户分层|增长模型|库存预测|供应链scm|供应链管理|定价模型)/i
  ];
  if (keepPatterns.some((p) => p.test(t))) return true;

  const rejectPatterns = [
    /(全链路|运营|打法|策略|构建|打造|推进|落地|执行|管理|策划|复盘|对接|沟通|协同|增长|提效|优化|闭环|主导|负责)/,
    /(直播间|店群|主播|私域|社群)/,
    /(体系|方案|流程|SOP)/i,
    /^(与|和|及).*/,
    /(微调|精调|调优|自动化)$/,
    /(短视频分镜|内容策划|智能化|看板)$/
  ];
  if (rejectPatterns.some((p) => p.test(t))) return false;

  // Default: keep short noun-like tokens, drop sentence-like ones.
  return t.length <= 12;
};

export const toSkillList = (value: any): string[] => {
  const rawList = Array.isArray(value)
    ? value
    : String(value ?? '')
        .split(/[\n,，;；、]+/)
        .map((v) => v.trim())
        .filter(Boolean);

  const expanded = rawList.flatMap((item: any) =>
    String(item)
      .split(/[\/|｜]+/)
      .map((v) => v.trim())
      .filter(Boolean)
  );

  const cleaned = expanded
    .map(normalizeSkillToken)
    .map(toNounSkillToken)
    .filter(Boolean)
    .map((v) => (v.length > 24 ? v.slice(0, 24).trim() : v))
    .filter((v) => isProfessionalSkillToken(v));

  // De-dupe:
  // - ignore casing
  // - ignore whitespace and common separators
  const makeKey = (s: string) =>
    s
      .toLowerCase()
      .replace(/[\s，,；;（()）\[\]【】"'`]+/g, '')
      .trim();

  const seen = new Set<string>();
  const out: string[] = [];
  cleaned.forEach((t) => {
    const k = makeKey(t);
    if (!k) return;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(t);
  });
  return out;
};

export const mergeSkills = (existing: any, incoming: any) => {
  const existingArr = Array.isArray(existing) ? existing : existing ? [existing] : [];
  const incomingArr = Array.isArray(incoming) ? incoming : incoming ? [incoming] : [];
  // `toSkillList` preserves first occurrence order; existing stays first, then new ones.
  return toSkillList([...existingArr, ...incomingArr]);
};
