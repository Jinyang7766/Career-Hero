export type TimelineRange = { startDate: string; endDate: string; date: string };

const normalizeToken = (value: unknown) =>
  String(value || '')
    .trim()
    .replace(/^\[\[[^\]]+\]\]$/g, '')
    .replace(/\[\[[^\]]+\]\]/g, '')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^(present|current|now)$/i, '至今');

const isReasonableYearToken = (value: string) => {
  const text = String(value || '').trim();
  if (!/^\d{4}$/.test(text)) return true;
  const n = Number(text);
  return n >= 1900 && n <= 2099;
};

const sanitizeToken = (value: string) => {
  const text = normalizeToken(value);
  if (!text) return '';
  if (text.includes('[') || text.includes(']')) return '';
  if (/^\d+$/.test(text) && !isReasonableYearToken(text)) return '';
  if (/^[\-\s]+$/.test(text)) return '';
  return text;
};

const isOngoing = (value: string) => /^(至今|present|current|now)$/i.test(String(value || '').trim());

const DATE_TOKEN_REGEX = /(\d{4}(?:[./-]\d{1,2})?|至今|present|current|now)/gi;
const extractDateTokens = (value: unknown) => {
  const text = String(value || '').replace(/[\u2013\u2014]/g, '-');
  const matches = text.match(DATE_TOKEN_REGEX) || [];
  return matches
    .map((x) => sanitizeToken(x))
    .filter(Boolean)
    .filter((x) => {
      if (isOngoing(x)) return true;
      const yearMatch = String(x).match(/^(\d{4})/);
      if (!yearMatch) return false;
      const year = Number(yearMatch[1]);
      return year >= 1900 && year <= 2099;
    });
};

export const parseTimelineRange = (value: unknown): { startDate: string; endDate: string } => {
  const tokens = extractDateTokens(value);
  if (!tokens.length) return { startDate: '', endDate: '' };
  if (tokens.length === 1) return { startDate: tokens[0], endDate: '' };

  const ongoingIdx = tokens.findIndex((t) => isOngoing(t));
  if (ongoingIdx >= 0) {
    const startDate = tokens[0] || (ongoingIdx > 0 ? tokens[ongoingIdx - 1] : '');
    return { startDate, endDate: '至今' };
  }

  // For duplicated concatenations like "2013 - 2017 - 2013 - 2017", keep the first valid pair.
  return { startDate: tokens[0], endDate: tokens[1] || '' };
};

export const normalizeTimelineFields = (item: any): TimelineRange => {
  const rawStart = sanitizeToken(item?.startDate);
  const rawEnd = sanitizeToken(item?.endDate);
  const rawDate = sanitizeToken(item?.date);

  const parsedDate = parseTimelineRange(rawDate);
  const parsedEnd = parseTimelineRange(rawEnd);
  const parsedStart = parseTimelineRange(rawStart);

  let startDate = (parsedStart.startDate || rawStart || parsedDate.startDate || '').trim();
  let endDate = rawEnd || parsedDate.endDate;

  // startDate can be polluted like "2020.03 - 2020.10"; keep only the start token.
  if (rawStart && (rawStart.includes('-') || rawStart.includes('—') || rawStart.includes('–'))) {
    startDate = parsedStart.startDate || startDate;
    if (!endDate && parsedStart.endDate) {
      endDate = parsedStart.endDate;
    }
  }

  // endDate can be polluted like "2020.10 - 至今"; normalize to a single end token.
  if (rawEnd && (rawEnd.includes('-') || rawEnd.includes('—') || rawEnd.includes('–'))) {
    if (parsedEnd.endDate && isOngoing(parsedEnd.endDate)) {
      endDate = '至今';
      startDate = startDate || parsedEnd.startDate;
    } else {
      endDate = parsedEnd.endDate || parsedEnd.startDate || endDate;
    }
  }

  if (!startDate && endDate) {
    startDate = parsedDate.startDate || parsedEnd.startDate || '';
  }

  const date = startDate && endDate
    ? `${startDate} - ${endDate}`
    : (startDate || endDate || rawDate || '');

  return { startDate, endDate, date };
};

export const formatTimeline = (item: any): string => {
  const normalized = normalizeTimelineFields(item || {});
  return normalized.date;
};
