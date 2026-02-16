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

const stripCategoryPrefix = (raw: string) => {
  const s = String(raw ?? '').trim();
  const m = s.match(/^([^:：]{1,16})\s*[:：]\s*(.+)$/);
  if (!m) return s;
  const left = m[1].trim();
  const right = m[2].trim();
  if (!right) return s;

  // Common section/category labels from imported resumes, e.g.:
  // "AI工具: 熟练使用ChatGPT", "技术栈：Python/SQL".
  const labelPattern =
    /(技能|专业技能|工具|AI工具|技术|技术栈|能力|语言|框架|平台|软件|数据库|编程|办公|数据分析|开发)/i;
  if (labelPattern.test(left)) return right;
  return s;
};

const stripEdgeWrappers = (raw: string) => {
  let t = (raw || '').trim();
  if (!t) return '';
  // Strip common leading/trailing wrappers caused by splitting (e.g. "(PowerBI", "Tableau)").
  // Run twice to handle cases like "((PowerBI" or "Tableau))".
  for (let i = 0; i < 2; i++) {
    t = t
      .replace(/^[（(【\[]+\s*/g, '')
      .replace(/\s*[）)】\]]+$/g, '')
      .replace(/^[,，;；:：]+/g, '')
      .replace(/[,，;；:：]+$/g, '')
      .trim();
  }

  // Handle mixed tokens like "数据可视化（PowerBI" after splitting:
  // If there's an opening wrapper in the middle, prefer the trailing token.
  const opens = ['（', '(', '【', '['];
  let lastOpen = -1;
  opens.forEach((ch) => {
    lastOpen = Math.max(lastOpen, t.lastIndexOf(ch));
  });
  if (lastOpen >= 0 && lastOpen < t.length - 1) {
    const tail = t.slice(lastOpen + 1).trim();
    // Only apply when it looks like a "tool-like" token (latin/digits) to avoid stripping normal Chinese skills.
    if (tail && /[A-Za-z0-9]/.test(tail)) {
      t = tail;
    }
  }

  // Similarly, if there's a closing wrapper, prefer the leading token.
  const closes = ['）', ')', '】', ']'];
  let firstClose = -1;
  closes.forEach((ch) => {
    const idx = t.indexOf(ch);
    if (idx >= 0 && (firstClose < 0 || idx < firstClose)) firstClose = idx;
  });
  if (firstClose > 0) {
    const head = t.slice(0, firstClose).trim();
    if (head) t = head;
  }
  return t;
};

const toNounSkillToken = (raw: string) => {
  let t = String(raw ?? '').trim();
  if (!t) return '';

  // Remove common proficiency/verb prefixes from imported sentence-style skills.
  // Example: "熟练使用ChatGPT" -> "ChatGPT"
  t = t
    .replace(/^[：:]\s*/g, '')
    .replace(/^(熟练|熟悉|掌握|精通|了解|擅长|能够|会)\s*/g, '')
    .replace(/^(使用|运用|应用)\s*/g, '')
    .trim();

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
    '投放',
    '打造',
    '分析',
    '监控',
    '维护',
    '产出',
    '使用',
    '运用',
    '应用',
    '熟练',
    '熟悉',
    '掌握',
    '精通',
    '了解',
    '擅长',
    '能够'
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

  // Sentence-like token still containing an LLM provider/model -> normalize to LLM.
  if (/(chatgpt|gpt[-\s]?(\d+(\.\d+)?|4o|4\.1|3\.5)|claude|kimi|moonshot|gemini|qwen|llama|deepseek|openai|anthropic|通义千问|文心一言|智谱|glm)/i.test(t)) {
    return 'LLM';
  }

  // Normalize common variants.
  // "A/B Test" often appears as "AB Test" or gets accidentally broken into "B Test".
  if (/^(ab\s*test|a\s*\/\s*b\s*test|a\/b\s*test|b\s*test)$/i.test(t)) {
    t = 'A/B Test';
  }
  if (/^power\s*bi$/i.test(t)) {
    t = 'PowerBI';
  }

  // Category merge: LLM providers/models are the same "kind of skill" for our UI.
  // We prefer a single "LLM" chip instead of listing GPT-4 / Claude 3 / Kimi / etc separately.
  const llmPatterns: RegExp[] = [
    /^llm$/i,
    /^chatgpt$/i,
    /^gpt[-\s]?(\d+(\.\d+)?|4o|4\.1|3\.5)(\s*(turbo|mini|pro|max))?$/i,
    /^openai$/i,
    /^claude(\s*[-]?\s*\d+(\.\d+)*)?$/i,
    /^anthropic$/i,
    /^kimi$/i,
    /^moonshot$/i,
    /^gemini(\s*[-]?\s*[\w.]+)?$/i,
    /^google\s*ai$/i,
    /^qwen(\s*[-]?\s*\d+(\.\d+)*)?$/i,
    /^通义千问$/,
    /^llama(\s*[-]?\s*\d+(\.\d+)*)?$/i,
    /^meta\s*ai$/i,
    /^ernie.*$/i,
    /^文心一言$/,
    /^智谱.*$/,
    /^glm.*$/i,
    /^deepseek.*$/i,
  ];
  if (llmPatterns.some((p) => p.test(t))) {
    t = 'LLM';
  }

  return t;
};

const isProfessionalSkillToken = (token: string) => {
  const t = String(token ?? '').trim();
  if (!t || t.length < 2) return false;

  const keepPatterns = [
    /^(sql|python|java|javascript|typescript|excel|tableau|power\s?bi|scrm|crm|ltv|roi|cpc|cpa|cpm|gmv|erp|wms|sap|vba|ga4|seo|sem|a\/b\s?test|ab\s?test)$/i,
    /(生意参谋|京东商智|万相台|直通车|引力魔方|京东快车|千川|巨量引擎|飞书|钉钉|notion|chatgpt|llm|zapier|make|airtable|supabase|photoshop|figma)/i,
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

  const splitByPipes = (input: string) =>
    input
      .split(/[|｜]+/)
      .map((v) => v.trim())
      .filter(Boolean);

  const splitBySlashes = (input: string) => {
    const s = input.trim();
    if (!s.includes('/')) return [s];

    // Keep A/B style tokens intact even when written as "A / B ..." (spaces around slash).
    // Otherwise, splitting would produce "A" and "B Test)".
    if (/^[A-Za-z]\s*\/\s*[A-Za-z]/.test(s)) {
      return [s.replace(/\s*\/\s*/g, '/')];
    }

    // First split on " / " (slash used as a separator).
    const spacedParts = s
      .split(/\s+\/\s+/)
      .map((v) => v.trim())
      .filter(Boolean);

    return spacedParts.flatMap((part) => {
      // Keep A/B style tokens intact (e.g. "A/B Test"), otherwise we get "A" and "B Test".
      if (/^[A-Za-z]\s*\/\s*[A-Za-z]/.test(part)) return [part];
      // Unspaced slash is commonly used to join tool names like "PowerBI/Tableau".
      return part
        .split('/')
        .map((v) => v.trim())
        .filter(Boolean);
    });
  };

  const expanded = rawList.flatMap((item: any) => {
    const s = String(item ?? '').trim();
    if (!s) return [];
    return splitByPipes(s).flatMap(splitBySlashes).map(stripCategoryPrefix);
  });

  const cleaned = expanded
    .map(normalizeSkillToken)
    .map(stripEdgeWrappers)
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
