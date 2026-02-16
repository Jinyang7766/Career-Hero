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
  const refLabel = '参考回复：';
  const nextLabel = '下一题：';
  const refIndex = text.indexOf(refLabel);
  if (refIndex === -1) return null;
  const afterRef = refIndex + refLabel.length;
  const nextIndex = text.indexOf(nextLabel, afterRef);
  const before = text.slice(0, refIndex).trim();
  const reference = (nextIndex === -1 ? text.slice(afterRef) : text.slice(afterRef, nextIndex)).trim();
  const after = nextIndex === -1 ? '' : text.slice(nextIndex).trim();
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
  const t = text.trim().toLowerCase();
  return ['好', '好的', '可以', '继续', '继续吧', '开始', '开始吧', '行', '嗯', 'ok', 'yes'].some((k) => t === k || t.includes(k));
};

export const isEndInterviewCommand = (text: string) => {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return false;
  const hits = ['结束面试', '面试结束', '结束', '结束了', '结束吧', 'stop', 'end', 'finish'];
  return hits.some((k) => t === k || t.includes(k));
};

