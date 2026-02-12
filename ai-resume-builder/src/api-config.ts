const DEFAULT_API_BASE_URL = 'http://localhost:5000';

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, '');

const envBase = (import.meta.env.VITE_API_BASE_URL || '').trim();
export const API_BASE_URL = normalizeBaseUrl(envBase || DEFAULT_API_BASE_URL);

export const buildApiUrl = (path: string) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
};
