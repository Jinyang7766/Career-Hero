import { supabase } from '../../../src/supabase-client';

const isLikelyJwt = (token?: string | null) => {
  const raw = (token || '').trim();
  if (!raw) return false;
  return raw.split('.').length === 3;
};

export const getBackendAuthToken = async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const sessionToken = session?.access_token?.trim();
    if (isLikelyJwt(sessionToken)) return sessionToken as string;
  } catch (error) {
    console.warn('Failed to get Supabase session token:', error);
  }

  try {
    const sessionStr = localStorage.getItem('supabase_session');
    if (sessionStr) {
      const parsed = JSON.parse(sessionStr);
      const token = (parsed?.access_token || parsed?.token || '').trim();
      if (isLikelyJwt(token)) return token;
    }
  } catch (error) {
    console.warn('Failed to parse supabase_session:', error);
  }

  const legacyToken = (localStorage.getItem('token') || '').trim();
  if (isLikelyJwt(legacyToken)) return legacyToken;
  return '';
};

