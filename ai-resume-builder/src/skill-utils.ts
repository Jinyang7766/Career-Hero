// Shared skill parsing/normalization utilities.
// Used by resume import and AI suggestions.

const LLM_RE =
  /(chatgpt|gpt[-\s]?\w*|openai|claude|anthropic|kimi|moonshot|gemini|qwen|通义千问|llama|deepseek|文心一言|ernie|智谱|glm)/i;
const CERT_RE =
  /(证书|认证|资格证|执业证|从业资格|等级证|证|PMP|CFA|FRM|CPA|ACCA|CISP|CISSP|软考|教师资格证|法律职业资格|基金从业|证券从业|银行从业|建造师|会计师|CET[-\s]?[46]|TEM[-\s]?[48]|IELTS|TOEFL|N2|N1|大学英语[四六]级|英语[四六]级|普通话[一二三]级(?:甲等|乙等)?|计算机(?:等级)?[一二三四]级|NCRE)/i;

const WEAK_NOUNS = new Set([
  '电商',
  '数据',
  '数据分析',
  '直播',
  '直播运营',
  '运营',
  '管理',
  '分析',
  '工具',
  '技术',
  '平台',
  '软件',
  '能力',
  '经验',
  '技能',
  '专业技能',
  '核心技能',
  '天猫',
  '京东',
  '钉钉'
]);

const HARD_SKILL_KEEP_RE = [
  /^(sql|mysql|postgresql|oracle|mongodb|redis|python|java|javascript|typescript|go|rust|c\+\+|c#|php|r|matlab)$/i,
  /^(excel|powerpoint|word|powerbi|tableau|spss|sas|vba|figma|photoshop|illustrator)$/i,
  /^(aws|gcp|azure|docker|kubernetes|linux|git|flask|django|react|vue|node\.?js|spring|tensorflow|pytorch)$/i,
  /^(seo|sem|ga4|scrm|crm|erp|wms|sap|ab\s*test|a\/b\s*test|ltv|roi|cpc|cpa|cpm|gmv)$/i,
  /(生意参谋|京东商智|万相台|直通车|引力魔方|京东快车|千川|巨量引擎|PowerBI|Tableau|LLM)/i
];

const stripEdge = (raw: string) =>
  String(raw ?? '')
    .replace(/[•·]/g, ' ')
    .replace(/[（(【\[]/g, ' ')
    .replace(/[）)】\]]/g, ' ')
    .replace(/^[,，;；:：\s]+/, '')
    .replace(/[,，;；:：\s]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

const stripCategoryPrefix = (raw: string) => {
  const s = stripEdge(raw);
  const m = s.match(/^([^:：]{1,16})\s*[:：]\s*(.+)$/);
  if (!m) return s;
  const left = m[1].trim();
  const right = m[2].trim();
  if (!right) return s;
  if (/(技能|专业技能|核心技能|工具|技术|技术栈|能力|语言|框架|平台|软件|数据库|编程|证书)/i.test(left)) {
    return right;
  }
  return s;
};

const splitSlashToken = (input: string) => {
  const s = input.trim();
  if (!s.includes('/')) return [s];
  if (/^[A-Za-z]\s*\/\s*[A-Za-z]/.test(s)) return [s.replace(/\s*\/\s*/g, '/')];
  return s.split('/').map((v) => v.trim()).filter(Boolean);
};

const normalizeCertificate = (token: string) => {
  const t = token.toUpperCase();
  if (t.includes('PMP')) return 'PMP认证';
  if (t.includes('CFA')) return 'CFA';
  if (t.includes('FRM')) return 'FRM';
  if (t.includes('CPA')) return 'CPA';
  if (t.includes('ACCA')) return 'ACCA';
  if (t.includes('CISP')) return 'CISP';
  if (t.includes('CISSP')) return 'CISSP';
  if (token.includes('软考')) return '软考证书';
  if (token.includes('教师资格')) return '教师资格证';
  if (token.includes('法律职业资格')) return '法律职业资格证';
  if (token.includes('基金从业')) return '基金从业资格证';
  if (token.includes('证券从业')) return '证券从业资格证';
  if (token.includes('银行从业')) return '银行从业资格证';
  if (token.includes('一级建造师')) return '一级建造师';
  if (token.includes('二级建造师')) return '二级建造师';
  if (token.includes('会计师')) return '会计师证书';
  if (/CET[-\s]?4/i.test(token) || token.includes('大学英语四级') || token.includes('英语四级')) return 'CET-4';
  if (/CET[-\s]?6/i.test(token) || token.includes('大学英语六级') || token.includes('英语六级')) return 'CET-6';
  if (/TEM[-\s]?4/i.test(token)) return 'TEM-4';
  if (/TEM[-\s]?8/i.test(token)) return 'TEM-8';
  if (/IELTS/i.test(token)) return 'IELTS';
  if (/TOEFL/i.test(token)) return 'TOEFL';
  if (token.includes('普通话')) return token.includes('甲等') || token.includes('乙等') ? stripEdge(token) : '普通话等级证书';
  if (token.includes('计算机') || /NCRE/i.test(token)) return '计算机等级证书';
  return stripEdge(token).slice(0, 20);
};

const toHardSkillToken = (raw: string) => {
  let t = stripCategoryPrefix(raw);
  if (!t) return '';

  t = t
    .replace(/^(熟练|熟悉|掌握|精通|了解|擅长|能够|会)\s*/g, '')
    .replace(/^(使用|运用|应用)\s*/g, '')
    .replace(/(搭建|构建|设计|训练|微调|精调|调优|优化|执行|推进|落地|负责|主导|打造|协同|沟通|复盘|维护|实现|开发)/g, '')
    .replace(/(能力|经验|实践|相关|方向)$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!t) return '';
  if (LLM_RE.test(t)) return 'LLM';
  if (CERT_RE.test(t)) return normalizeCertificate(t);
  if (/^(ab\s*test|a\/b\s*test|b\s*test)$/i.test(t)) return 'A/B Test';
  if (/^power\s*bi$/i.test(t)) return 'PowerBI';
  return t;
};

const isHardSkill = (token: string) => {
  const t = stripEdge(token);
  if (!t || t.length < 2 || t.length > 24) return false;
  if (WEAK_NOUNS.has(t)) return false;
  if (/^(与|和|及|等)$/.test(t)) return false;
  if (/(全链路|策略|流程|方案|运营|协同|沟通|策划|看板|分镜|内容|直播|直播间|私域|社群)/.test(t)) return false;
  if (CERT_RE.test(t)) return true;
  if (HARD_SKILL_KEEP_RE.some((re) => re.test(t))) return true;
  // Keep concise noun-like technical terms (Chinese 2-8 chars / English tokens).
  if (/^[A-Za-z][A-Za-z0-9.+#\-/\s]{1,20}$/.test(t)) return true;
  if (/^[\u4e00-\u9fa5]{2,8}$/.test(t) && !WEAK_NOUNS.has(t)) return true;
  return false;
};

const canonicalKey = (token: string) => {
  const t = stripEdge(token);
  if (!t) return '';
  if (t === 'LLM') return 'cat:llm';
  if (CERT_RE.test(t)) return `cat:cert:${normalizeCertificate(t).toLowerCase()}`;
  return t.toLowerCase().replace(/[\s，,；;（()）\[\]【】"'`]+/g, '');
};

export const toSkillList = (value: any): string[] => {
  const rawList = Array.isArray(value)
    ? value
    : String(value ?? '')
        .split(/[\n,，;；、]+/)
        .map((v) => v.trim())
        .filter(Boolean);

  const expanded = rawList.flatMap((item: any) => {
    const s = String(item ?? '').trim();
    if (!s) return [];
    return s
      .split(/[|｜]+/)
      .map((x) => x.trim())
      .filter(Boolean)
      .flatMap(splitSlashToken);
  });

  const cleaned = expanded
    .map(toHardSkillToken)
    .filter(Boolean)
    .filter(isHardSkill);

  const out: string[] = [];
  const seen = new Set<string>();
  cleaned.forEach((token) => {
    const key = canonicalKey(token);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(token);
  });
  return out;
};

export const mergeSkills = (existing: any, incoming: any) => {
  const existingArr = Array.isArray(existing) ? existing : existing ? [existing] : [];
  const incomingArr = Array.isArray(incoming) ? incoming : incoming ? [incoming] : [];
  return toSkillList([...existingArr, ...incomingArr]);
};
