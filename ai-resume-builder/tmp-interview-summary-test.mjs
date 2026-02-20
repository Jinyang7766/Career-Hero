const cleanMarkdownText = (input) => {
  let text = String(input || '');
  text = text.replace(/\r\n/g, '\n');
  text = text.replace(/```[\s\S]*?```/g, '');
  text = text.replace(/^[ \t]*#{1,6}[ \t]*/gm, '');
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/\*([^*]+)\*/g, '$1');
  text = text.replace(/`([^`]+)`/g, '$1');
  text = text.replace(/\[(.*?)\]\((.*?)\)/g, '$1');
  text = text.replace(/^[ \t]*[-*][ \t]+/gm, '');
  text = text.replace(/[ \t]{2,}/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
};

const normalizeDisplayText = (text) => String(text||'').replace(/\r\n/g,'\n').replace(/(?<!\n)\n(?!\n)/g,'').replace(/\n{3,}/g,'\n\n').trim();

const parseStrictTemplateSections = (rawSummary) => {
  const src = cleanMarkdownText(rawSummary);
  if (!src) return null;
  const lines = src.replace(/\r\n/g, '\n').split('\n').map((x)=>String(x||'').trim()).filter(Boolean);
  if (!lines.length) return null;
  const normalizedHeader = (line) => String(line||'').replace(/[【】[\]]/g,'').replace(/[：:]/g,'').replace(/\s+/g,'').trim();
  const sectionFromHeader = (line) => {
    const h = normalizedHeader(line);
    if (!h) return null;
    if (h.includes('综合评价')) return 'evaluation';
    if (h.includes('表现亮点')) return 'highlights';
    if (h.includes('需要加强的地方') || h.includes('需要加强')) return 'improvements';
    if (h.includes('职位匹配度与缺口') || h.includes('匹配度与缺口')) return 'matchGap';
    if (h.includes('后续训练计划') || h.includes('训练计划')) return 'plan';
    return null;
  };

  const result = { evaluation:'', highlights:'', improvements:'', matchGap:'', plan:'' };
  let current = null;
  let hasTemplateHeading = false;
  for (const line of lines) {
    if (/^总分\s*[：:]/u.test(line)) continue;
    const sec = sectionFromHeader(line);
    if (sec) { hasTemplateHeading = true; current = sec; continue; }
    if (!current) continue;
    const item = line.replace(/^[-•●]\s*/u, '').trim();
    if (!item) continue;
    result[current] = [result[current], item].filter(Boolean).join('\n');
  }
  if (!hasTemplateHeading) return null;
  return result;
};

const splitImprovementItems = (raw) => {
  const source = normalizeDisplayText(String(raw || '').trim()).replace(/\s{2,}/g, ' ').trim();
  if (!source) return [];
  const issueStartRe = /^(?:问题|改进点|加强点)\s*[一二三四五六七八九十\d]+\s*[：:]/u;
  const hasIssueBlocks = /(?:问题|改进点|加强点)\s*[一二三四五六七八九十\d]+\s*[：:]/u.test(source);
  if (!hasIssueBlocks) return [source];
  const parts = source
    .split(/(?=(?:问题|改进点|加强点)\s*[一二三四五六七八九十\d]+\s*[：:])/gu)
    .map((x) => String(x || '').trim())
    .filter(Boolean);
  const grouped = [];
  let pendingIntro = '';
  for (const part of parts) {
    if (issueStartRe.test(part)) {
      const merged = pendingIntro ? `${pendingIntro} ${part}`.trim() : part;
      grouped.push(merged);
      pendingIntro = '';
      continue;
    }
    if (!grouped.length) {
      pendingIntro = pendingIntro ? `${pendingIntro} ${part}`.trim() : part;
      continue;
    }
    grouped[grouped.length - 1] = `${grouped[grouped.length - 1]} ${part}`.replace(/\s{2,}/g, ' ').trim();
  }
  return grouped;
};

const parseImprovementTriplet = (text) => {
  const source = String(text || '').trim();
  const byPipe = source.split(/[|｜]/u).map((x) => String(x || '').trim()).filter(Boolean);
  const chunks = byPipe.length > 1 ? byPipe : [source];
  let problem = '', improve = '', practice = '';
  const rest = [];
  for (const chunk of chunks) {
    if (!problem && /^问题\s*[：:]/u.test(chunk)) { problem = chunk.replace(/^问题\s*[：:]\s*/u, '').trim(); continue; }
    if (!improve && /^改进\s*[：:]/u.test(chunk)) { improve = chunk.replace(/^改进\s*[：:]\s*/u, '').trim(); continue; }
    if (!practice && /^(练习|建议练习)\s*[：:]/u.test(chunk)) { practice = chunk.replace(/^(练习|建议练习)\s*[：:]\s*/u, '').trim(); continue; }
    rest.push(chunk);
  }
  return { problem, improve, practice, fallback: rest.join(' ').trim() };
};

const mockSummary = `
总分：58/100
【综合评价】
- 证据不足，结论可信度一般。
- 表达基础可用，但深度不够。
【表现亮点】
- 结构尚清晰。
- 能回应核心问题。
【需要加强的地方】
- 问题1：职业转型叙事断裂｜改进：改为“能力迁移链路”三段式｜练习：准备1分钟版和3分钟版自我介绍
- 问题2：量化证据不足｜改进：每段经历至少给1个结果指标｜练习：按STAR重写3段项目经历
【职位匹配度与缺口】
- 平台规则：具备基础经验。
- 流量运营：深度证据不足。
【后续训练计划】
- 第1天：重写自我介绍并录音复盘
- 第2天：补齐3条量化成果
`;

const sections = parseStrictTemplateSections(mockSummary);
console.log('--- strict sections ---');
console.log(JSON.stringify(sections, null, 2));

const items = splitImprovementItems(sections?.improvements || '');
console.log('\n--- improvement items ---');
items.forEach((x, i) => {
  console.log(`#${i+1}`, x);
  console.log('triplet=', parseImprovementTriplet(x));
});

console.log('\n--- matchGap items raw ---');
console.log((sections?.matchGap || '').split('\n'));
