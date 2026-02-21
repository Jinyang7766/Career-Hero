export type SectionKey = 'evaluation' | 'highlights' | 'improvements' | 'matchGap' | 'plan';
type ParsedSections = Record<SectionKey, string>;
export type TrainingDay = { title: string; content: string };
export type TrainingWeek = { title: string; intro: string; days: TrainingDay[] };

const cleanMarkdownText = (input: string) => {
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

const normalizeBlockBody = (text: string) =>
  String(text || '')
    .replace(/^[：:\-\s]+/, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

const normalizeDisplayText = (text: string) =>
  String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/(?<!\n)\n(?!\n)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const cleanupAwkwardSummarySentence = (text: string) =>
  String(text || '')
    .replace(/以下分析将以下是您的面试综合分析[:：]?/g, '以下是您的面试综合分析：')
    .replace(/以下分析将(?=以下是)/g, '')
    .replace(/以下分析[:：]?\s*以下是/g, '以下是')
    .replace(/\s{2,}/g, ' ')
    .trim();

const dedupeEvaluationSentences = (text: string) => {
  const source = String(text || '').trim();
  if (!source) return '';
  const parts = source
    .split(/(?<=[。！？!?；;])/u)
    .map((s) => String(s || '').trim())
    .filter(Boolean);
  if (!parts.length) return source;

  const norm = (s: string) =>
    String(s || '')
      .replace(/[“”"'`（）()【】\[\]\s，,。！？!?；;：:、\-—]/g, '')
      .toLowerCase();

  const keep: string[] = [];
  const seen = new Set<string>();
  for (const sentence of parts) {
    const key = norm(sentence);
    if (!key) continue;
    if (seen.has(key)) continue;
    const duplicated = Array.from(seen).some((k) => (
      (key.length > 10 && k.includes(key)) ||
      (k.length > 10 && key.includes(k))
    ));
    if (duplicated) continue;
    seen.add(key);
    keep.push(sentence);
  }
  return keep.join('');
};

const cleanupInlineNumbering = (text: string) =>
  String(text || '')
    .replace(/([：:]\s*)(?:\d+|[一二三四五六七八九十]+)[、.)]\s*/gu, '$1')
    .replace(/(^|[。！？!?；;\n]\s*)(?:\d+|[一二三四五六七八九十]+)[、.)]\s*/gu, '$1')
    .trim();

export const parseScoreFromText = (text: string): number | null => {
  const raw = String(text || '');
  const hit =
    raw.match(/总分[:：]?\s*(\d{1,3})\s*\/\s*100/i) ||
    raw.match(/(\d{1,3})\s*\/\s*100/);
  if (!hit) return null;
  const n = Number(hit[1]);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
};

const stripResumeOnlyScoring = (text: string) =>
  String(text || '')
    .replace(/若仅评估简历质量[^。！？!?]*[。！？!?]?/g, '')
    .replace(/仅评估简历[^。！？!?]*[。！？!?]?/g, '')
    .replace(/简历分(?:约)?\s*[:：]?\s*\d{1,3}\s*\/\s*100/g, '')
    .replace(/完全基于您[的\s]*[【\[]?简历内容[】\]]?[^。！？!?]*[。！？!?]?/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const normalizeHeading = (line: string) =>
  String(line || '')
    .replace(/^[#\s]+/, '')
    .replace(/^第?[一二三四五六七八九十\d]+[、.)：:\s]*/u, '')
    .trim();

const headingToSection = (line: string): SectionKey | null => {
  const normalized = normalizeHeading(line);
  if (!normalized) return null;
  if (/(综合评价|总体评价|评估结论|总结)/.test(normalized)) return 'evaluation';
  if (/(表现亮点|亮点)/.test(normalized)) return 'highlights';
  if (/(需要加强|主要问题|优化建议|改进建议)/.test(normalized)) return 'improvements';
  if (/(匹配度|匹配情况|缺口)/.test(normalized)) return 'matchGap';
  if (/(训练计划|学习计划|行动计划)/.test(normalized)) return 'plan';
  return null;
};

const parseStrictTemplateSections = (rawSummary: string): ParsedSections | null => {
  const src = cleanMarkdownText(rawSummary);
  if (!src) return null;
  const lines = src
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((x) => String(x || '').trim())
    .filter(Boolean);
  if (!lines.length) return null;

  const normalizedHeader = (line: string) =>
    String(line || '')
      .replace(/[【】[\]]/g, '')
      .replace(/[：:]/g, '')
      .replace(/\s+/g, '')
      .trim();

  const sectionFromHeader = (line: string): SectionKey | null => {
    const h = normalizedHeader(line);
    if (!h) return null;
    if (h.includes('综合评价')) return 'evaluation';
    if (h.includes('表现亮点')) return 'highlights';
    if (h.includes('需要加强的地方') || h.includes('需要加强')) return 'improvements';
    if (h.includes('职位匹配度与缺口') || h.includes('匹配度与缺口')) return 'matchGap';
    if (h.includes('后续训练计划') || h.includes('训练计划')) return 'plan';
    return null;
  };

  const result: ParsedSections = {
    evaluation: '',
    highlights: '',
    improvements: '',
    matchGap: '',
    plan: '',
  };
  let current: SectionKey | null = null;
  let hasTemplateHeading = false;

  for (const line of lines) {
    if (/^总分\s*[：:]/u.test(line)) continue;
    const key = sectionFromHeader(line);
    if (key) {
      current = key;
      hasTemplateHeading = true;
      continue;
    }
    if (!current) continue;
    result[current] += `${line}\n`;
  }

  if (!hasTemplateHeading) return null;
  (Object.keys(result) as SectionKey[]).forEach((k) => {
    result[k] = normalizeDisplayText(result[k]);
  });
  return result;
};

export const parseSummarySections = (rawSummary: string): ParsedSections => {
  const strict = parseStrictTemplateSections(rawSummary);
  if (strict) {
    strict.evaluation = cleanupInlineNumbering(
      cleanupAwkwardSummarySentence(
        dedupeEvaluationSentences(stripResumeOnlyScoring(strict.evaluation))
      )
    );
    return strict;
  }

  const src = cleanMarkdownText(rawSummary);
  const lines = src.split('\n');
  const result: ParsedSections = {
    evaluation: '',
    highlights: '',
    improvements: '',
    matchGap: '',
    plan: '',
  };
  let current: SectionKey = 'evaluation';

  lines.forEach((line) => {
    const key = headingToSection(line);
    if (key) {
      current = key;
      return;
    }
    const body = normalizeBlockBody(line);
    if (!body) return;
    result[current] += `${body}\n`;
  });

  (Object.keys(result) as SectionKey[]).forEach((k) => {
    result[k] = normalizeDisplayText(result[k]);
  });
  result.evaluation = cleanupInlineNumbering(
    cleanupAwkwardSummarySentence(
      dedupeEvaluationSentences(stripResumeOnlyScoring(result.evaluation))
    )
  );
  return result;
};

export const splitModuleItems = (raw: string): string[] => {
  const src = String(raw || '').trim();
  if (!src) return [];
  const lines = src
    .split('\n')
    .map((l) => String(l || '').trim())
    .filter(Boolean);
  const parts: string[] = [];
  let cur = '';
  const itemStartRe = /^(?:[-*•]\s+|(?:亮点|评估项|问题|建议|改进|练习)\s*\d*\s*[：:]|(?:\d+|[一二三四五六七八九十]+)[、.)]\s*)/u;

  lines.forEach((line) => {
    if (itemStartRe.test(line)) {
      if (cur) parts.push(cur.trim());
      cur = line.replace(itemStartRe, '').trim();
    } else {
      cur = `${cur} ${line}`.trim();
    }
  });
  if (cur) parts.push(cur.trim());
  return parts.filter(Boolean);
};

export const splitImprovementItems = (raw: string): string[] => {
  const src = String(raw || '').trim();
  if (!src) return [];
  const lines = src
    .split('\n')
    .map((l) => String(l || '').trim())
    .filter(Boolean);
  const items: string[] = [];
  let current = '';

  const flush = () => {
    const text = current.trim();
    if (text) items.push(text);
    current = '';
  };

  for (const line of lines) {
    const isStart = /^(?:问题|改进|练习)\s*\d*\s*[：:]/u.test(line)
      || /^(?:\d+|[一二三四五六七八九十]+)[、.)]\s*/u.test(line)
      || /^[-*•]\s+/u.test(line);
    if (isStart) {
      flush();
      current = line
        .replace(/^(?:\d+|[一二三四五六七八九十]+)[、.)]\s*/u, '')
        .replace(/^[-*•]\s+/u, '')
        .trim();
      continue;
    }
    current = `${current} ${line}`.trim();
  }
  flush();

  return items.filter(Boolean);
};

export const parseTrainingPlanGroups = (raw: string): TrainingWeek[] => {
  const splitLineByDayMarkers = (line: string): string[] => {
    const source = String(line || '').trim();
    if (!source) return [];
    const re = /(Day\s*\d+|第?\s*\d+\s*天)\s*[：:]?/giu;
    const matches = Array.from(source.matchAll(re));
    if (!matches.length) return [source];

    const parts: string[] = [];
    const firstIdx = Number(matches[0].index || 0);
    if (firstIdx > 0) {
      const prefix = source.slice(0, firstIdx).trim();
      if (prefix) parts.push(prefix);
    }
    for (let i = 0; i < matches.length; i += 1) {
      const start = Number(matches[i].index || 0);
      const end = i + 1 < matches.length ? Number(matches[i + 1].index || source.length) : source.length;
      const seg = source.slice(start, end).trim();
      if (seg) parts.push(seg);
    }
    return parts;
  };

  const lines = String(raw || '')
    .split('\n')
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .flatMap(splitLineByDayMarkers);
  if (!lines.length) return [];

  const result: TrainingWeek[] = [];
  let currentWeek: TrainingWeek | null = null;

  const weekMatch = (line: string) => line.match(/^(?:第?\s*\d+\s*周|Week\s*\d+|训练计划)\s*[：:]?\s*(.*)$/i);
  const dayMatch = (line: string) => line.match(/^(Day\s*\d+|第?\s*\d+\s*天)\s*[：:]?\s*(.*)$/i);

  for (const line of lines) {
    const w = weekMatch(line);
    if (w) {
      currentWeek = {
        title: String(w[0] || '').replace(/[：:]\s*.*$/, '').trim() || '训练计划',
        intro: String(w[1] || '').trim(),
        days: [],
      };
      result.push(currentWeek);
      continue;
    }

    const d = dayMatch(line);
    if (d) {
      if (!currentWeek) {
        currentWeek = { title: '训练计划', intro: '', days: [] };
        result.push(currentWeek);
      }
      currentWeek.days.push({
        title: String(d[1] || '').trim(),
        content: String(d[2] || '').trim() || '待补充',
      });
      continue;
    }

    if (!currentWeek) {
      currentWeek = { title: '训练计划', intro: line, days: [] };
      result.push(currentWeek);
      continue;
    }

    if (!currentWeek.days.length && !currentWeek.intro) {
      currentWeek.intro = line;
      continue;
    }
    if (currentWeek.days.length > 0) {
      const last = currentWeek.days[currentWeek.days.length - 1];
      last.content = `${last.content} ${line}`.trim();
    } else {
      currentWeek.intro = `${currentWeek.intro} ${line}`.trim();
    }
  }

  return result
    .map((week) => ({
      ...week,
      intro: String(week.intro || '').trim(),
      days: week.days.map((d) => ({
        title: String(d.title || '').trim(),
        content: String(d.content || '').trim(),
      })),
    }))
    .filter((week) => week.intro || week.days.length > 0);
};

export const splitPracticeSuggestion = (item: string) => {
  const source = String(item || '').trim();
  if (!source) return { main: '', practice: '' };
  const hit = source.match(/(?:建议练习|建议准备素材)\s*[：:]\s*(.+)$/u);
  if (!hit) return { main: source, practice: '' };
  const idx = hit.index ?? source.length;
  return {
    main: source.slice(0, idx).trim(),
    practice: String(hit[1] || '').trim(),
  };
};

export const extractIssueHeading = (text: string, fallbackIndex: number) => {
  const source = String(text || '').trim();
  const m = source.match(/^(?:问题|改进点|建议)\s*(\d+)?\s*[：:]\s*(.+)$/u);
  if (m) {
    return {
      title: `问题 ${m[1] || fallbackIndex + 1}`,
      body: String(m[2] || '').trim(),
    };
  }
  return {
    title: `问题 ${fallbackIndex + 1}`,
    body: source,
  };
};

export const parseImprovementTriplet = (text: string) => {
  const source = String(text || '').trim();
  if (!source) return { problem: '', improve: '', practice: '', fallback: '' };

  const cleanTripletField = (value: string) =>
    String(value || '')
      .replace(/^[\s|｜、，,;；:：\-]+/u, '')
      .replace(/[\s|｜、，,;；:：\-]+$/u, '')
      .trim();

  const readField = (name: string) => {
    const re = new RegExp(`${name}\\s*[：:]\\s*([\\s\\S]*?)(?=(?:问题|改进|练习)\\s*[：:]|$)`, 'u');
    const m = source.match(re);
    return cleanTripletField(String(m?.[1] || ''));
  };
  const problem = readField('问题');
  const improve = readField('改进');
  const practice = readField('练习');

  if (problem || improve || practice) {
    return { problem, improve, practice, fallback: '' };
  }
  return { problem: '', improve: '', practice: '', fallback: cleanTripletField(source) };
};
