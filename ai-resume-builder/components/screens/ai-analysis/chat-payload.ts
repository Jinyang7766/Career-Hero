import type { ChatMessage } from './types';

export const createMasker = () => {
  const mapping = new Map<string, string>();
  let counter = 0;

  const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  const phoneRegex = /(?<!\d)(\+?\d[\d\s\-()]{7,}\d)(?!\d)/g;
  const timelineKeys = new Set(['date', 'startDate', 'endDate', 'start_date', 'end_date']);

  const looksLikeTimeline = (value: string) => {
    const text = String(value || '').trim();
    if (!text) return false;
    if (/^(至今|present|current|now)$/i.test(text)) return true;
    if (/^\d{4}([./-]\d{1,2})?$/.test(text)) return true;
    if (/^\d{4}([./-]\d{1,2})?\s*[-~—–至到]\s*(\d{4}([./-]\d{1,2})?|至今|present|current|now)$/i.test(text)) return true;
    return false;
  };

  const maskValue = (value: string, type: string) => {
    const token = `[[${type}_${++counter}]]`;
    mapping.set(token, value);
    return token;
  };

  const maskText = (text: string, opts?: { skipPhone?: boolean }) => {
    if (!text) return text;
    let result = text.replace(emailRegex, (m) => maskValue(m, 'EMAIL'));
    if (!opts?.skipPhone) {
      result = result.replace(phoneRegex, (m) => {
        if (looksLikeTimeline(m)) return m;
        return maskValue(m, 'PHONE');
      });
    }
    return result;
  };

  const companyKeys = new Set(['company', 'employer', 'organization', 'org', 'school']);
  const addressKeys = new Set(['address', 'location', 'city', 'province', 'state', 'country']);

  const maskObject = (input: any): any => {
    if (input === null || input === undefined) return input;
    if (typeof input === 'string') return maskText(input);
    if (Array.isArray(input)) return input.map((item) => maskObject(item));
    if (typeof input === 'object') {
      const out: any = {};
      Object.keys(input).forEach((key) => {
        const value = input[key];
        if (typeof value === 'string' && companyKeys.has(key)) {
          out[key] = maskValue(value, 'COMPANY');
          return;
        }
        if (typeof value === 'string' && addressKeys.has(key)) {
          out[key] = maskValue(value, 'ADDRESS');
          return;
        }
        if (typeof value === 'string' && timelineKeys.has(key)) {
          out[key] = value;
          return;
        }
        out[key] = maskObject(value);
      });
      return out;
    }
    return input;
  };

  const unmaskText = (text: string) => {
    if (!text) return text;
    let result = text;
    for (const [token, value] of mapping.entries()) {
      const bareToken = token.replace(/^\[\[/, '').replace(/\]\]$/, '');
      result = result.split(token).join(value);
      result = result.split(bareToken).join(value);
    }
    return result;
  };

  const unmaskObject = (input: any): any => {
    if (input === null || input === undefined) return input;
    if (typeof input === 'string') return unmaskText(input);
    if (Array.isArray(input)) return input.map((item) => unmaskObject(item));
    if (typeof input === 'object') {
      const out: any = {};
      Object.keys(input).forEach((key) => {
        out[key] = unmaskObject(input[key]);
      });
      return out;
    }
    return input;
  };

  return { maskText, maskObject, unmaskText, unmaskObject };
};

export const maskChatHistory = (
  messages: ChatMessage[],
  maskText: (text: string) => string
) => messages.map((m) => ({ ...m, text: maskText(m.text || '') }));
