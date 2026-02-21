export type TimelineRange = { startDate: string; endDate: string; date: string };

const normalizeToken = (value: unknown) =>
  String(value || '')
    .trim()
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^(present|current|now)$/i, '至今');

const isOngoing = (value: string) => /^(至今|present|current|now)$/i.test(String(value || '').trim());

const splitRangeTokens = (value: unknown) =>
  String(value || '')
    .replace(/[\u2013\u2014]/g, '-')
    .split(/\s*-\s*/)
    .map((x) => normalizeToken(x))
    .filter(Boolean);

export const parseTimelineRange = (value: unknown): { startDate: string; endDate: string } => {
  const tokens = splitRangeTokens(value);
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
  const rawStart = normalizeToken(item?.startDate);
  const rawEnd = normalizeToken(item?.endDate);
  const rawDate = normalizeToken(item?.date);

  const parsedDate = parseTimelineRange(rawDate);
  const parsedEnd = parseTimelineRange(rawEnd);

  let startDate = rawStart || parsedDate.startDate;
  let endDate = rawEnd || parsedDate.endDate;

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
