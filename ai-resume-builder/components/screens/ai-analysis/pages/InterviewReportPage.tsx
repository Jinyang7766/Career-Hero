import React from 'react';
import AiDisclaimer from '../AiDisclaimer';
import BackButton from '../../../shared/BackButton';
import ReportFeedback from '../ReportFeedback';
import { useAppStore } from '../../../../src/app-store';
import { recordResumeExportHistory } from '../../../../src/export-history';

type Props = {
  summary: string;
  score: number;
  advice: string[];
  onBack: () => void;
  onFeedback?: (rating: 'up' | 'down', reason?: string) => Promise<boolean> | boolean;
};

type SectionKey = 'evaluation' | 'highlights' | 'improvements' | 'matchGap' | 'plan';
type ParsedSections = Record<SectionKey, string>;
type TrainingDay = { title: string; content: string };
type TrainingWeek = { title: string; intro: string; days: TrainingDay[] };
type ReportIconName = 'analytics' | 'auto_awesome' | 'lightbulb' | 'target' | 'event_upcoming' | 'format_quote' | 'download';

const estimateDataUrlBytes = (dataUrl: string) => {
  const base64 = String(dataUrl || '').split(',')[1] || '';
  if (!base64) return 0;
  const padding = (base64.match(/=*$/)?.[0].length || 0);
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
};

const downloadDataUrl = (dataUrl: string, filename: string) => {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  return estimateDataUrlBytes(dataUrl);
};

const downloadCanvasWithChunking = (canvas: HTMLCanvasElement, baseName: string) => {
  const exported: Array<{ filename: string; size: number }> = [];
  const MAX_SAFE_HEIGHT = 14000;
  if (canvas.height <= MAX_SAFE_HEIGHT) {
    const filename = `${baseName}.png`;
    const size = downloadDataUrl(canvas.toDataURL('image/png', 1.0), filename);
    exported.push({ filename, size });
    return exported;
  }

  const parts = Math.ceil(canvas.height / MAX_SAFE_HEIGHT);
  for (let i = 0; i < parts; i += 1) {
    const y = i * MAX_SAFE_HEIGHT;
    const h = Math.min(MAX_SAFE_HEIGHT, canvas.height - y);
    const piece = document.createElement('canvas');
    piece.width = canvas.width;
    piece.height = h;
    const ctx = piece.getContext('2d');
    if (!ctx) continue;
    ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, piece.width, piece.height);
    const filename = `${baseName}-part${i + 1}.png`;
    const size = downloadDataUrl(piece.toDataURL('image/png', 1.0), filename);
    exported.push({ filename, size });
  }
  return exported;
};

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
    // Merge accidental hard wraps while preserving paragraph breaks.
    .replace(/(?<!\n)\n(?!\n)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const cleanupAwkwardSummarySentence = (text: string) =>
  String(text || '')
    // Remove duplicated transitional phrase artifacts.
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
    // Near-duplicate suppression: if one sentence is mostly contained in another.
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
    // Remove inline numbering like "：1) 总分..." in single-paragraph summaries.
    .replace(/([：:]\s*)(?:\d+|[一二三四五六七八九十]+)[、.)]\s*/gu, '$1')
    // Remove sentence-start numbering like "1) ...".
    .replace(/(^|[。！？!?；;\n]\s*)(?:\d+|[一二三四五六七八九十]+)[、.)]\s*/gu, '$1')
    .trim();

const parseScoreFromText = (text: string): number | null => {
  const raw = String(text || '');
  const hit =
    raw.match(/总分[:：]?\s*(\d{1,3})\s*\/\s*100/i) ||
    raw.match(/(\d{1,3})\s*\/\s*100/);
  if (!hit) return null;
  const n = Number(hit[1]);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
};

const getScoreColorClass = (score: number) => {
  if (score >= 90) return 'text-green-500';
  if (score >= 70) return 'text-primary';
  return 'text-orange-500';
};

const getScoreDotClass = (score: number) => {
  if (score >= 90) return 'bg-green-500';
  if (score >= 70) return 'bg-primary';
  return 'bg-orange-500';
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
    if (/^总分\s*[：:]/u.test(line)) {
      // Keep score line out of sections; score parser handles it.
      continue;
    }
    const sec = sectionFromHeader(line);
    if (sec) {
      hasTemplateHeading = true;
      current = sec;
      continue;
    }
    if (!current) continue;
    const item = line.replace(/^[-•●]\s*/u, '').trim();
    if (!item) continue;
    result[current] = [result[current], item].filter(Boolean).join('\n');
  }

  if (!hasTemplateHeading) return null;
  return result;
};

const parseSummarySections = (rawSummary: string): ParsedSections => {
  const strict = parseStrictTemplateSections(rawSummary);
  if (strict) return strict;

  const cleaned = cleanMarkdownText(rawSummary);
  const text = stripResumeOnlyScoring(cleaned);
  const initial: ParsedSections = {
    evaluation: '',
    highlights: '',
    improvements: '',
    matchGap: '',
    plan: '',
  };
  if (!text) return initial;

  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return initial;

  const sections: ParsedSections = { ...initial };
  let current: SectionKey = 'evaluation';
  let anyStructuredHeading = false;

  for (const line of lines) {
    const detected = headingToSection(line);
    if (detected) {
      anyStructuredHeading = true;
      current = detected;
      const trailing = String(line).replace(/^[^：:]+[：:]\s*/, '').trim();
      if (trailing && trailing !== line) {
        sections[current] = [sections[current], trailing].filter(Boolean).join('\n');
      }
      continue;
    }
    sections[current] = [sections[current], line].filter(Boolean).join('\n');
  }

  if (!anyStructuredHeading) {
    sections.evaluation = text;
  }

  (Object.keys(sections) as SectionKey[]).forEach((key) => {
    const normalized = cleanupAwkwardSummarySentence(
      normalizeDisplayText(normalizeBlockBody(sections[key]))
    );
    sections[key] = key === 'evaluation'
      ? dedupeEvaluationSentences(cleanupInlineNumbering(normalized))
      : normalized;
  });
  return sections;
};

const splitModuleItems = (raw: string): string[] => {
  const source = String(raw || '').trim();
  if (!source) return [];
  const normalizeSegmentList = (items: string[]) => {
    const cleaned = items
      .map((line) => String(line || '').trim())
      .filter(Boolean)
      .map((line) =>
        line
          .replace(/^注\s*[：:]\s*/u, '')
          .replace(/^[^。；;\n]*JD分析匹配点\s*[：:]\s*/u, '')
          .replace(/^(?:\d+|[一二三四五六七八九十]+)\s*[、.)：:]\s*/u, '')
          .replace(/^简历可改进点\s*\d+\s*[、.)：: ]*/u, '')
          .replace(/\s*\d+\)\s*简历可改进点\.?\s*$/u, '')
          .replace(/\s*简历可改进点\s*\d+\.?\s*$/u, '')
          .replace(/\s*(?:\d+|[一二三四五六七八九十]+)\s*[、.)：:]\s*$/u, '')
          .replace(/\s{2,}/g, ' ')
          .trim()
      )
      .filter(Boolean)
      .filter((line) => !/^(?:\d+|[一二三四五六七八九十]+)[、.)：:]?$/u.test(line));

    if (!cleaned.length) return cleaned;
    const merged: string[] = [];
    for (const curr of cleaned) {
      const prev = merged[merged.length - 1] || '';
      // Merge accidental split fragments like "规模具体化：...处," + "补充团队具体人数..."
      if (prev && /[，,、：:]\s*$/.test(prev)) {
        merged[merged.length - 1] = `${prev} ${curr}`.replace(/\s{2,}/g, ' ').trim();
      } else {
        merged.push(curr);
      }
    }
    const splitDenseLabelItem = (text: string) => {
      const value = String(text || '').trim();
      if (!value) return [];
      const re = /(^|[。；;，,、\s])([A-Za-z\u4e00-\u9fa5][A-Za-z0-9\u4e00-\u9fa5/（）()“”"'·-]{1,18})[：:]/gu;
      const starts: number[] = [];
      for (const hit of value.matchAll(re)) {
        const boundary = String(hit[1] || '');
        const label = String(hit[2] || '').trim();
        if (label.length < 2) continue;
        const start = Number(hit.index || 0) + boundary.length;
        if (Number.isFinite(start)) starts.push(start);
      }
      if (starts.length < 2) return [value];
      const out: string[] = [];
      for (let i = 0; i < starts.length; i += 1) {
        const s = starts[i];
        const e = i + 1 < starts.length ? starts[i + 1] : value.length;
        const piece = value.slice(s, e).trim();
        if (piece) out.push(piece);
      }
      const intro = value.slice(0, starts[0]).trim();
      if (intro && out[0]) out[0] = `${intro} ${out[0]}`.trim();
      return out;
    };

    return merged.flatMap((item) => splitDenseLabelItem(item));
  };

  const preNormalizedSource = source
    .replace(/\r\n/g, '\n')
    // Put numbered label entries on their own virtual lines: "2. 类目明确：..."
    .replace(/([。；;])\s*(\d+)\.\s*(?=[\u4e00-\u9fa5A-Za-z]{2,}[：:])/gu, '$1\n$2. ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const compactInline = source
    .replace(/\r\n/g, '\n')
    .replace(/\n+/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  const inlineIssueMarkerRe = /(问题|改进点|加强点)\s*[一二三四五六七八九十\d]+\s*[：:]/gu;
  const inlineMarkers = compactInline.match(inlineIssueMarkerRe) || [];
  if (inlineMarkers.length >= 1) {
    const issueSplitRe = /(?=(?:问题|改进点|加强点)\s*[一二三四五六七八九十\d]+\s*[：:])/gu;
    const segments = compactInline
      .split(issueSplitRe)
      .map((line) => String(line || '').trim())
      .filter(Boolean);
    if (segments.length >= 1 && !/^(?:问题|改进点|加强点)\s*[一二三四五六七八九十\d]+\s*[：:]/u.test(segments[0])) {
      const intro = segments.shift() || '';
      if (intro) {
        segments.unshift(intro);
      }
    }
    return normalizeSegmentList(segments
      .map((line) => normalizeBlockBody(line))
      .map((line) => line.replace(/^["'“”‘’)\]]+\s*/u, '').replace(/\s+[("“”‘’]+$/u, '').trim())
      .filter(Boolean));
  }
  const inlineLabelRe = /(^|[。；;，,、\s])([A-Za-z\u4e00-\u9fa5][A-Za-z0-9\u4e00-\u9fa5/（）()“”"'·-]{1,18})[：:]/gu;
  const inlineLabelStarts: number[] = [];
  for (const hit of compactInline.matchAll(inlineLabelRe)) {
    const boundary = String(hit[1] || '');
    const label = String(hit[2] || '').trim();
    // Require label to be at least 2 chars to avoid accidental single-char splitting.
    if (label.length < 2) continue;
    const start = Number(hit.index || 0) + boundary.length;
    if (Number.isFinite(start)) inlineLabelStarts.push(start);
  }
  // Handle dense clauses like "平台规则：... 流量运营：... 数据分析：...".
  if (inlineLabelStarts.length >= 2) {
    const segments: string[] = [];
    for (let i = 0; i < inlineLabelStarts.length; i += 1) {
      const start = inlineLabelStarts[i];
      const end = i + 1 < inlineLabelStarts.length ? inlineLabelStarts[i + 1] : compactInline.length;
      const piece = compactInline.slice(start, end).trim();
      if (piece) segments.push(piece);
    }
    const intro = compactInline.slice(0, inlineLabelStarts[0]).trim();
    if (intro && segments[0]) segments[0] = `${intro} ${segments[0]}`.trim();
    return normalizeSegmentList(segments
      .map((line) => normalizeBlockBody(line))
      .map((line) => line.replace(/^["'“”‘’)\]]+\s*/u, '').replace(/\s+[("“”‘’]+$/u, '').trim())
      .filter(Boolean));
  }
  const normalized = normalizeDisplayText(preNormalizedSource)
    .replace(/([。；;])\s*(?=(?:\d+|[一二三四五六七八九十]+)[、.)：:])/g, '$1\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const lines = normalized
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  const markerRe = /^(?:[-•●]|(?:\d+|[一二三四五六七八九十]+)[、.)：:])\s*/u;
  const markerCount = lines.filter((line) => markerRe.test(line)).length;

  // Only split into multiple bullets when explicit list markers exist.
  if (markerCount >= 2) {
    const grouped: string[] = [];
    let current = '';
    for (const line of lines) {
      if (markerRe.test(line)) {
        if (current.trim()) grouped.push(current.trim());
        current = line.replace(markerRe, '').trim();
      } else {
        current = current ? `${current} ${line}` : line;
      }
    }
    if (current.trim()) grouped.push(current.trim());
    return normalizeSegmentList(grouped
      .map((line) => normalizeBlockBody(line))
      .map((line) => line.replace(/^["'“”‘’)\]]+\s*/u, '').replace(/\s+[("“”‘’]+$/u, '').trim())
      .filter(Boolean));
  }

  // Fallback: keep as a single item to avoid breaking quotes/brackets into fake bullets.
  return normalizeSegmentList([normalizeBlockBody(normalized)]);
};

const splitImprovementItems = (raw: string): string[] => {
  const source = normalizeDisplayText(String(raw || '').trim())
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!source) return [];

  const issueStartRe = /^(?:问题|改进点|加强点)\s*[一二三四五六七八九十\d]+\s*[：:]/u;
  const hasIssueBlocks = /(?:问题|改进点|加强点)\s*[一二三四五六七八九十\d]+\s*[：:]/u.test(source);
  if (!hasIssueBlocks) return splitModuleItems(source);

  const parts = source
    .split(/(?=(?:问题|改进点|加强点)\s*[一二三四五六七八九十\d]+\s*[：:])/gu)
    .map((x) => String(x || '').trim())
    .filter(Boolean);
  if (!parts.length) return splitModuleItems(source);

  const grouped: string[] = [];
  let pendingIntro = '';
  for (const part of parts) {
    if (issueStartRe.test(part)) {
      const merged = pendingIntro ? `${pendingIntro} ${part}`.trim() : part;
      grouped.push(merged);
      pendingIntro = '';
      continue;
    }
    // Non-issue fragment before first issue -> prepend to first issue block if exists.
    if (!grouped.length) {
      pendingIntro = pendingIntro ? `${pendingIntro} ${part}`.trim() : part;
      continue;
    }
    // Non-issue fragment after issue block -> treat as continuation of previous issue.
    grouped[grouped.length - 1] = `${grouped[grouped.length - 1]} ${part}`.replace(/\s{2,}/g, ' ').trim();
  }

  const cleaned = grouped
    .map((line) =>
      String(line || '')
        .replace(/^\s*[-•●]\s*/u, '')
        .replace(/\s{2,}/g, ' ')
        .trim()
    )
    .filter(Boolean);

  return cleaned.length ? cleaned : splitModuleItems(source);
};

const parseTrainingPlanGroups = (raw: string): TrainingWeek[] => {
  const source = String(raw || '').trim();
  if (!source) return [];
  const normalized = normalizeDisplayText(source)
    .replace(/\s*(第[一二三四五六七八九十\d]+周[：:])/gu, '\n$1')
    .replace(/\s*(day\s*\d+(?:\s*-\s*\d+)?[^：:\n]{0,40}[：:])/giu, '\n$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const lines = normalized
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  const weekRe = /^(第[一二三四五六七八九十\d]+周)\s*[：:]?\s*(.*)$/u;
  const dayRe = /^(day\s*\d+(?:\s*-\s*\d+)?(?:\s*[（(][^)）]{0,40}[)）])?)\s*[：:]?\s*(.*)$/iu;
  const groups: TrainingWeek[] = [];
  let currentWeek: TrainingWeek | null = null;
  let currentDay: TrainingDay | null = null;

  const ensureWeek = () => {
    if (!currentWeek) currentWeek = { title: '训练计划', intro: '', days: [] };
  };

  const flushDay = () => {
    if (!currentWeek || !currentDay) return;
    currentWeek.days.push({
      title: normalizeBlockBody(currentDay.title),
      content: normalizeBlockBody(currentDay.content),
    });
    currentDay = null;
  };

  const flushWeek = () => {
    if (!currentWeek) return;
    flushDay();
    currentWeek.intro = normalizeBlockBody(currentWeek.intro);
    groups.push(currentWeek);
    currentWeek = null;
  };

  for (const line of lines) {
    const weekHit = line.match(weekRe);
    if (weekHit) {
      flushWeek();
      currentWeek = {
        title: String(weekHit[1] || '').trim(),
        intro: String(weekHit[2] || '').trim(),
        days: [],
      };
      continue;
    }

    const dayHit = line.match(dayRe);
    if (dayHit) {
      ensureWeek();
      flushDay();
      currentDay = {
        title: String(dayHit[1] || '').trim(),
        content: String(dayHit[2] || '').trim(),
      };
      continue;
    }

    ensureWeek();
    if (currentDay) {
      currentDay.content = `${currentDay.content} ${line}`.trim();
    } else {
      currentWeek!.intro = `${currentWeek!.intro} ${line}`.trim();
    }
  }

  flushWeek();
  return groups.filter((g) => g.title || g.intro || g.days.length > 0);
};

const splitPracticeSuggestion = (item: string) => {
  const source = String(item || '').trim();
  if (!source) return { main: '', practice: '' };
  const markerRe = /(建议练习|建议准备素材)\s*[：:]/u;
  const hit = source.match(markerRe);
  if (!hit || typeof hit.index !== 'number') {
    return { main: source, practice: '' };
  }
  const idx = hit.index;
  const main = source.slice(0, idx).trim();
  const practice = source.slice(idx).trim();
  return { main: main || source, practice: main ? practice : '' };
};

const extractIssueHeading = (text: string, fallbackIndex: number) => {
  const source = String(text || '').trim();
  const m = source.match(/^(问题\s*[一二三四五六七八九十\d]+)\s*[：:]\s*/u);
  if (!m) {
    return {
      title: `问题 ${fallbackIndex + 1}`,
      body: source,
    };
  }
  const title = String(m[1] || '').replace(/\s+/g, '');
  const body = source.slice((m[0] || '').length).trim();
  return {
    title: title || `问题 ${fallbackIndex + 1}`,
    body: body || source,
  };
};

const parseImprovementTriplet = (text: string) => {
  const source = String(text || '').trim();
  if (!source) return { problem: '', improve: '', practice: '', fallback: '' };

  const byPipe = source
    .split(/[|｜]/u)
    .map((x) => String(x || '').trim())
    .filter(Boolean);
  const chunks = byPipe.length > 1 ? byPipe : [source];

  let problem = '';
  let improve = '';
  let practice = '';
  const rest: string[] = [];

  for (const chunk of chunks) {
    if (!problem && /^问题\s*[一二三四五六七八九十\d]*\s*[：:]/u.test(chunk)) {
      problem = chunk.replace(/^问题\s*[一二三四五六七八九十\d]*\s*[：:]\s*/u, '').trim();
      continue;
    }
    if (!improve && /^改进\s*[：:]/u.test(chunk)) {
      improve = chunk.replace(/^改进\s*[：:]\s*/u, '').trim();
      continue;
    }
    if (!practice && /^(练习|建议练习)\s*[：:]/u.test(chunk)) {
      practice = chunk.replace(/^(练习|建议练习)\s*[：:]\s*/u, '').trim();
      continue;
    }
    rest.push(chunk);
  }

  if (!problem && chunks.length === 1) {
    problem = source.replace(/^问题\s*[：:]\s*/u, '').trim();
  }
  const fallback = rest.join(' ').trim();
  return { problem, improve, practice, fallback };
};

const ReportIcon: React.FC<{ name: ReportIconName; className?: string }> = ({ name, className = 'size-5' }) => {
  const common = `shrink-0 ${className}`;
  if (name === 'analytics') {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 19V5h16v14H4z" />
        <path d="M8 15v-3" />
        <path d="M12 15V9" />
        <path d="M16 15v-6" />
      </svg>
    );
  }
  if (name === 'auto_awesome') {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="currentColor" aria-hidden="true">
        <path d="M12 2l1.6 4.4L18 8l-4.4 1.6L12 14l-1.6-4.4L6 8l4.4-1.6L12 2zM5 13l1.1 2.9L9 17l-2.9 1.1L5 21l-1.1-2.9L1 17l2.9-1.1L5 13zm14 3l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z" />
      </svg>
    );
  }
  if (name === 'lightbulb') {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 18h6" />
        <path d="M10 22h4" />
        <path d="M12 2a7 7 0 0 0-4 12.8c.7.5 1 1 1 1.7V17h6v-.5c0-.7.3-1.2 1-1.7A7 7 0 0 0 12 2z" />
      </svg>
    );
  }
  if (name === 'target') {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (name === 'event_upcoming') {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M8 3v4M16 3v4M3 10h18M8 14h4" />
      </svg>
    );
  }
  if (name === 'download') {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3v12" />
        <path d="m7 10 5 5 5-5" />
        <path d="M5 21h14" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={common} fill="currentColor" aria-hidden="true">
      <path d="M8 7h8v2H8zM6 11h10v2H6zM8 15h8v2H8z" />
    </svg>
  );
};

const ReportSection: React.FC<{
  title: string;
  icon: ReportIconName;
  iconColor: string;
  children: React.ReactNode;
}> = ({ title, icon, iconColor, children }) => (
  <div className="bg-white dark:bg-[#1c2936] rounded-[24px] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)] border border-slate-100 dark:border-white/5 animate-in fade-in slide-in-from-bottom-2 duration-500">
    <div className="flex items-center gap-2.5 mb-5">
      <div className={`size-8 rounded-xl ${iconColor} flex items-center justify-center`}>
        <ReportIcon name={icon} className="size-5" />
      </div>
      <h3 className="font-black text-slate-900 dark:text-white text-base tracking-tight">{title}</h3>
    </div>
    <div className="space-y-4">{children}</div>
  </div>
);


const InterviewReportPage: React.FC<Props> = ({ summary, score, advice, onBack, onFeedback }) => {
  const resumeData = useAppStore((state) => state.resumeData);
  const reportRef = React.useRef<HTMLDivElement | null>(null);
  const [isExporting, setIsExporting] = React.useState(false);
  const parsedSections = React.useMemo(
    () => parseSummarySections(String(summary || '').trim()),
    [summary]
  );
  const summaryScore = React.useMemo(
    () => parseScoreFromText(String(summary || '').trim()),
    [summary]
  );
  const highlightItems = React.useMemo(() => splitModuleItems(parsedSections.highlights), [parsedSections.highlights]);
  const improvementItems = React.useMemo(() => {
    const fromSummary = splitImprovementItems(parsedSections.improvements);
    if (fromSummary.length > 0) return fromSummary;
    return (advice || []).map((x) => String(x || '').trim()).filter(Boolean);
  }, [parsedSections.improvements, advice]);
  const matchGapItems = React.useMemo(() => splitModuleItems(parsedSections.matchGap), [parsedSections.matchGap]);
  const planItems = React.useMemo(() => splitModuleItems(parsedSections.plan), [parsedSections.plan]);
  const trainingPlanGroups = React.useMemo(() => parseTrainingPlanGroups(parsedSections.plan), [parsedSections.plan]);

  const handleSaveImage = async () => {
    if (!reportRef.current || isExporting) return;
    setIsExporting(true);
    try {
      const mod: any = await import('html2pdf.js');
      const html2pdf = mod?.default || mod;
      const node = reportRef.current;
      const worker = html2pdf()
        .set({
          margin: 0,
          filename: `面试报告-${Date.now()}.pdf`,
          image: { type: 'png', quality: 1 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            scrollY: 0,
            windowWidth: node.scrollWidth,
            windowHeight: node.scrollHeight,
            backgroundColor: '#ffffff',
          },
          jsPDF: { unit: 'px', format: [node.scrollWidth, node.scrollHeight], orientation: 'portrait' },
        })
        .from(node)
        .toCanvas();

      const canvas = await worker.get('canvas');
      const exports = downloadCanvasWithChunking(canvas, `面试报告-${Date.now()}`);
      for (const item of exports) {
        await recordResumeExportHistory(resumeData as any, {
          filename: item.filename,
          size: item.size,
          type: 'IMAGE',
        });
      }
    } catch (err) {
      console.error('Failed to export interview report image:', err);
      window.alert('保存图片失败，请稍后重试');
    } finally {
      setIsExporting(false);
    }
  };

  const scoreNum = Number.isFinite(summaryScore as number)
    ? Math.round(summaryScore as number)
    : Math.round(score || 0);

  return (
    <div className="flex flex-col min-h-screen bg-background-light dark:bg-[#0b1219] animate-in fade-in duration-500">
      <header className="fixed top-0 left-0 right-0 z-40 bg-background-light/80 dark:bg-[#0b1219]/80 backdrop-blur-xl border-b border-slate-200/50 dark:border-white/5">
        <div className="flex items-center justify-between h-14 px-4 relative">
          <BackButton onClick={onBack} className="-ml-2 size-9" iconClassName="text-[22px]" />
          <h1 className="text-base font-black tracking-tight text-slate-900 dark:text-white">面试深度反馈</h1>
          <div className="w-10"></div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pt-[72px] p-4 pb-[calc(3.75rem+env(safe-area-inset-bottom))] space-y-6">
        <div ref={reportRef} className="space-y-6">
          {/* Score Card */}
          <div className="relative overflow-hidden bg-white dark:bg-[#1c2936] rounded-[28px] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 dark:border-white/5 group">
            <div className="absolute top-0 right-0 -mr-8 -mt-8 size-48 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-colors duration-700" />

            <div className="relative z-10 flex flex-col items-center text-center">
              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-4">综合评估得分</span>
              <div className="flex items-baseline gap-1">
                <span className={`text-[72px] font-black tracking-tighter leading-none drop-shadow-sm ${getScoreColorClass(scoreNum)}`}>
                  {scoreNum}
                </span>
                <span className="text-xl font-bold text-slate-300 dark:text-slate-600 tracking-tight">/ 100</span>
              </div>
              <div className="mt-6 flex items-center gap-2 px-3 py-1 bg-primary/5 dark:bg-primary/10 rounded-full border border-primary/10">
                <div className={`size-1.5 rounded-full ${getScoreDotClass(scoreNum)} animate-pulse`} />
                <span className="text-[11px] font-black text-primary dark:text-blue-400 uppercase tracking-wider">
                  {scoreNum >= 90 ? '卓越表现' : scoreNum >= 80 ? '优秀表现' : scoreNum >= 70 ? '良好表现' : scoreNum >= 60 ? '及格表现' : '仍需努力'}
                </span>
              </div>
            </div>
          </div>

          {/* Summary Card */}
          <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 to-primary rounded-[32px] p-px shadow-xl shadow-primary/20 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="relative bg-white/95 dark:bg-[#1c2936]/95 backdrop-blur-md rounded-[31px] px-7 py-7">
              {/* Decorative Background Icon */}
              <div className="absolute -right-4 -bottom-4 opacity-[0.03] dark:opacity-[0.05] pointer-events-none">
                <ReportIcon name="format_quote" className="size-[140px]" />
              </div>

              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="size-9 rounded-xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center">
                    <ReportIcon name="analytics" className="size-5 text-primary" />
                  </div>
                  <h3 className="font-black text-slate-900 dark:text-white text-base tracking-tight">综合评价总结</h3>
                </div>
                <div className="px-3 py-1 rounded-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10">
                  <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Analysis Result</span>
                </div>
              </div>

              <div className="relative space-y-4">
                {(parsedSections.evaluation || '面试已结束，本次深度总结分析当前不可用，请稍后再试。')
                  .split('\n')
                  .filter(Boolean)
                  .map((p, i) => (
                    <p key={`summary-p-${i}`} className="text-[15px] text-slate-700 dark:text-slate-200 leading-[1.8] font-bold text-justify">
                      {p.trim()}
                    </p>
                  ))}
              </div>
            </div>
          </div>
          {!isExporting && onFeedback && <ReportFeedback onFeedback={onFeedback} showTitle={false} />}

          {/* Detailed Sections */}
          {highlightItems.length > 0 && (
            <>
              <ReportSection title="表现亮点" icon="auto_awesome" iconColor="bg-primary/10 dark:bg-primary/20 text-primary dark:text-blue-400">
                <div className="space-y-3 rounded-2xl border border-slate-100 dark:border-white/10 bg-slate-50/70 dark:bg-white/5 p-4">
                  {highlightItems.map((item, idx) => (
                    <div key={`highlight-${idx}`} className="rounded-xl bg-white dark:bg-[#1c2936] border border-slate-100 dark:border-white/10 p-3 shadow-sm">
                      <div className="flex items-start gap-2.5">
                        <div className="shrink-0 mt-1.5 size-1.5 rounded-full bg-primary" />
                        <div className="flex-1">
                          <p className="text-[13px] font-black text-primary dark:text-blue-400 mb-1 uppercase tracking-wider">亮点 {idx + 1}</p>
                          <p className="text-[14px] font-bold text-slate-700 dark:text-slate-200 leading-[1.6]">
                            {item}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ReportSection>
              {!isExporting && onFeedback && <ReportFeedback onFeedback={onFeedback} showTitle={false} />}
            </>
          )}

          <>
            <ReportSection title="需要加强的地方" icon="lightbulb" iconColor="bg-primary/10 dark:bg-primary/20 text-primary dark:text-blue-400">
              <div className="space-y-3 rounded-2xl border border-slate-100 dark:border-white/10 bg-slate-50/70 dark:bg-white/5 p-4">
                {(improvementItems.length > 0 ? improvementItems : [
                  '建议围绕岗位要求补充案例细节、决策过程与量化结果。',
                  '加强对个人职业价值观的表达，体现长期稳定性。',
                  '对过往失败经历进行更深度的复盘总结。'
                ]).map((item, idx) => {
                  const { main, practice } = splitPracticeSuggestion(item);
                  const issue = extractIssueHeading(main, idx);
                  const triplet = parseImprovementTriplet(issue.body);
                  const problemText = triplet.problem || issue.body;
                  const improveText = triplet.improve;
                  const practiceText = triplet.practice || practice;
                  const fallbackText = triplet.fallback;
                  return (
                    <div key={`improvement-${idx}`} className="rounded-xl bg-white dark:bg-[#1c2936] border border-slate-100 dark:border-white/10 p-3 shadow-sm">
                      <div className="flex items-start gap-2.5">
                        <div className="shrink-0 mt-1.5 size-1.5 rounded-full bg-primary/60" />
                        <div className="flex-1">
                          <p className="text-[13px] font-black text-primary dark:text-blue-400 mb-1 uppercase tracking-wider">{issue.title}</p>
                          <p className="text-[14px] font-bold text-slate-700 dark:text-slate-200 leading-[1.6]">
                            {problemText}
                          </p>
                          {improveText ? (
                            <div className="mt-3 pt-3 border-t border-slate-50 dark:border-white/5">
                              <p className="text-[12px] font-black text-primary dark:text-blue-400 mb-1">改进</p>
                              <p className="text-[13px] font-bold text-slate-600 dark:text-slate-400 leading-[1.6]">
                                {improveText}
                              </p>
                            </div>
                          ) : null}
                          {practiceText ? (
                            <div className="mt-3 pt-3 border-t border-slate-50 dark:border-white/5">
                              <p className="text-[12px] font-black text-primary dark:text-blue-400 mb-1">练习</p>
                              <p className="text-[13px] font-bold text-slate-600 dark:text-slate-400 leading-[1.6]">
                                {practiceText.replace(/^(建议练习|建议准备素材)\s*[：:]\s*/u, '')}
                              </p>
                            </div>
                          ) : null}
                          {fallbackText ? (
                            <p className="mt-3 text-[13px] font-bold text-slate-600 dark:text-slate-400 leading-[1.6]">
                              {fallbackText}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ReportSection>
            {!isExporting && onFeedback && <ReportFeedback onFeedback={onFeedback} showTitle={false} />}
          </>

          {matchGapItems.length > 0 && (
            <>
              <ReportSection title="职位匹配度与缺口" icon="target" iconColor="bg-primary/10 dark:bg-primary/20 text-primary dark:text-blue-400">
                <div className="space-y-3 rounded-2xl border border-slate-100 dark:border-white/10 bg-slate-50/70 dark:bg-white/5 p-4">
                  {matchGapItems.map((item, idx) => (
                    <div key={`gap-${idx}`} className="rounded-xl bg-white dark:bg-[#1c2936] border border-slate-100 dark:border-white/10 p-3 shadow-sm">
                      <div className="flex items-start gap-2.5">
                        <div className="shrink-0 mt-1.5 size-1.5 rounded-full bg-primary" />
                        <div className="flex-1">
                          <p className="text-[13px] font-black text-primary dark:text-blue-400 mb-1 uppercase tracking-wider">评估项 {idx + 1}</p>
                          <p className="text-[14px] font-bold text-slate-700 dark:text-slate-200 leading-[1.6]">
                            {item}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ReportSection>
              {!isExporting && onFeedback && <ReportFeedback onFeedback={onFeedback} showTitle={false} />}
            </>
          )}

          {planItems.length > 0 && (
            <>
              <ReportSection title="后续训练计划" icon="event_upcoming" iconColor="bg-primary/10 dark:bg-primary/20 text-primary dark:text-blue-400">
                {trainingPlanGroups.length > 0 ? (
                  <div className="space-y-3">
                    {trainingPlanGroups.map((week, weekIdx) => (
                      <div key={`week-${weekIdx}`} className="rounded-2xl border border-slate-100 dark:border-white/10 bg-slate-50/70 dark:bg-white/5 p-4">
                        <h4 className="text-[15px] font-black text-slate-900 dark:text-white mb-2">{week.title}</h4>
                        {week.intro ? (
                          <p className="text-[13px] font-bold text-slate-700 dark:text-slate-300 leading-[1.6] mb-2">{week.intro}</p>
                        ) : null}
                        <div className="space-y-2">
                          {week.days.map((day, dayIdx) => (
                            <div key={`week-${weekIdx}-day-${dayIdx}`} className="rounded-xl bg-white dark:bg-[#1c2936] border border-slate-100 dark:border-white/10 p-3">
                              <p className="text-[13px] font-black text-primary dark:text-blue-400 mb-1">{day.title}</p>
                              <p className="text-[13px] font-bold text-slate-700 dark:text-slate-300 leading-[1.6]">{day.content}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3 rounded-2xl border border-slate-100 dark:border-white/10 bg-slate-50/70 dark:bg-white/5 p-4">
                    {planItems.map((item, idx) => (
                      <div key={`plan-${idx}`} className="rounded-xl bg-white dark:bg-[#1c2936] border border-slate-100 dark:border-white/10 p-3 shadow-sm">
                        <div className="flex items-start gap-2.5">
                          <div className="shrink-0 mt-1.5 size-1.5 rounded-full bg-primary" />
                          <p className="text-[14px] font-bold text-slate-700 dark:text-slate-200 leading-[1.6]">
                            {item}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ReportSection>
              {!isExporting && onFeedback && <ReportFeedback onFeedback={onFeedback} showTitle={false} />}
            </>
          )}
        </div>

        {/* Global Action */}
        <div className="pt-4 space-y-6">
          <div className="pt-2">
            <button
              type="button"
              onClick={() => { void handleSaveImage(); }}
              disabled={isExporting}
              className={`group w-full py-4 rounded-2xl bg-primary text-white text-[15px] font-black shadow-xl shadow-primary/25 hover:bg-blue-600 active:scale-[0.98] transition-all flex items-center justify-center gap-2 ${isExporting ? 'opacity-70 cursor-not-allowed shadow-none' : ''}`}
            >
              <div className="flex items-center justify-center gap-2">
                {isExporting ? (
                  <>
                    <span className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>报告生成中...</span>
                  </>
                ) : (
                  <>
                    <ReportIcon name="download" className="size-5 transition-transform group-hover:translate-y-[-2px]" />
                    <span>保存面试报告图片</span>
                  </>
                )}
              </div>
            </button>
            <p className="mt-3 text-[11px] text-center text-slate-400 dark:text-slate-500 font-bold opacity-60">报告将保存至您的本地相册</p>
          </div>

          <AiDisclaimer className="pt-4 opacity-40 text-center" />
        </div>
      </main>
    </div>
  );
};

export default InterviewReportPage;
