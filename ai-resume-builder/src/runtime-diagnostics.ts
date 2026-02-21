type RuntimeTraceEntry = {
  ts: string;
  scope: string;
  event: string;
  payload?: any;
};

const TRACE_KEY = 'career_hero_runtime_trace';
const LAST_ERROR_KEY = 'career_hero_last_error';
const TRACE_LIMIT = 240;

const safeParse = (raw: string | null): RuntimeTraceEntry[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const pushRuntimeTrace = (scope: string, event: string, payload?: any) => {
  if (typeof window === 'undefined') return;
  try {
    const prev = safeParse(localStorage.getItem(TRACE_KEY));
    const next: RuntimeTraceEntry[] = [
      ...prev,
      {
        ts: new Date().toISOString(),
        scope: String(scope || '').trim() || 'unknown',
        event: String(event || '').trim() || 'event',
        payload: payload ?? undefined,
      },
    ].slice(-TRACE_LIMIT);
    localStorage.setItem(TRACE_KEY, JSON.stringify(next));
  } catch {
    // ignore diagnostics failures
  }
};

export const readRuntimeTrace = (): RuntimeTraceEntry[] => {
  if (typeof window === 'undefined') return [];
  return safeParse(localStorage.getItem(TRACE_KEY));
};

export const writeLastRuntimeError = (errorPayload: any) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      LAST_ERROR_KEY,
      JSON.stringify({
        ts: new Date().toISOString(),
        ...errorPayload,
        traceTail: readRuntimeTrace().slice(-80),
      })
    );
  } catch {
    // ignore diagnostics failures
  }
};

