import { supabase } from './supabase-client';

const normalizeToken = (value: unknown): string => String(value || '').trim();

const isLikelyJwt = (token?: string | null) => {
  const raw = normalizeToken(token);
  return raw.split('.').length === 3;
};

const readTokenFromStoredSession = () => {
  if (typeof localStorage === 'undefined') return '';
  const sessionStr = localStorage.getItem('supabase_session');
  if (!sessionStr) return '';
  try {
    const parsed = JSON.parse(sessionStr);
    return normalizeToken(parsed?.access_token || parsed?.token);
  } catch (_error) {
    return '';
  }
};

export const getBackendAuthToken = async (): Promise<string> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const sessionToken = normalizeToken(session?.access_token);
    if (isLikelyJwt(sessionToken)) return sessionToken;
  } catch (_error) {
    // ignore
  }

  const storedSessionToken = readTokenFromStoredSession();
  if (isLikelyJwt(storedSessionToken)) return storedSessionToken;

  if (typeof localStorage === 'undefined') return '';
  const legacyToken = normalizeToken(localStorage.getItem('token'));
  return isLikelyJwt(legacyToken) ? legacyToken : '';
};
