export type ParsedReference = { before?: string; reference: string; after?: string };

export const stripMarkdownTableSeparators = (text: string) => {
  const lines = String(text || '').split(/\r?\n/);
  const isSepLine = (line: string) => {
    const s = String(line || '').trim();
    if (!s) return false;
    return /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(s);
  };
  return lines.filter((l) => !isSepLine(l)).join('\n').trim();
};

export const parseReferenceReply = (text: string): ParsedReference | null => {
  const source = String(text || '');
  // Compatible forms:
  // - 参考回复：
  // - 参考回复如下：
  // - 参考回答：
  // - 参考答案：
  const refMatch = source.match(/(参考(?:回复|回答|答案)(?:如下)?\s*[：:])/);
  if (!refMatch || refMatch.index === undefined) return null;
  const refIndex = refMatch.index;
  const afterRef = refIndex + refMatch[0].length;

  const nextMatch = source.slice(afterRef).match(/(下一题|下一道问题|下一道具体问题|下一个问题)\s*[：:]/);
  const nextIndex = nextMatch && nextMatch.index !== undefined
    ? (afterRef + nextMatch.index)
    : -1;

  const before = source.slice(0, refIndex).trim();
  const reference = (nextIndex === -1 ? source.slice(afterRef) : source.slice(afterRef, nextIndex)).trim();
  const after = nextIndex === -1 ? '' : source.slice(nextIndex).trim();
  if (!reference) return null;
  return { before, reference, after };
};

export const splitNextQuestion = (text: string) => {
  const s = String(text || '');
  const m = s.match(/(下一题|下一道问题|下一道具体问题|下一个问题)\s*[:：]/);
  if (!m || m.index === undefined) return { cleaned: s, next: null };
  const nextIndex = m.index;
  let cleaned = s.slice(0, nextIndex).trim();
  cleaned = cleaned.replace(/[【\[（]\s*$/, '').trim();
  const next = s.slice(nextIndex + m[0].length).trim();
  return { cleaned, next: next || null };
};

export const isAffirmative = (text: string) => {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return false;
  // Only treat explicit start/continue commands as affirmative.
  // Avoid false positives like "你好" which contains "好".
  const exactMatches = new Set([
    '好',
    '好的',
    '可以',
    '继续',
    '继续吧',
    '开始',
    '开始吧',
    '行',
    '嗯',
    'ok',
    'yes',
    '准备好了',
    '我准备好了',
    '准备就绪',
  ]);
  if (exactMatches.has(t)) return true;
  return /^(可以开始|我们开始|开始面试|进入面试|继续面试)$/i.test(t);
};

export const isEndInterviewCommand = (text: string) => {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return false;
  const hits = ['结束面试', '面试结束', '结束', '结束了', '结束吧', 'stop', 'end', 'finish'];
  return hits.some((k) => t === k || t.includes(k));
};
