export type ToastType = 'info' | 'success' | 'error';

declare global {
  interface Window {
    __careerHeroToast?: (msg: string, type?: ToastType, ms?: number) => void;
    __careerHeroConfirm?: (msg: string) => Promise<boolean>;
  }
}

export function toast(msg: string, type: ToastType = 'info', ms: number = 2200) {
  const text = String(msg ?? '').trim();
  if (!text) return;
  if (typeof window !== 'undefined' && window.__careerHeroToast) {
    window.__careerHeroToast(text, type, ms);
    return;
  }

  // Fallback (should rarely happen): native alert may show URL in some browsers.
  // Keeping this as a last resort avoids completely dropping user-visible errors.
  // eslint-disable-next-line no-alert
  window.alert(text);
}

export async function confirmDialog(message: string): Promise<boolean> {
  const text = String(message ?? '').trim();
  if (!text) return false;
  if (typeof window !== 'undefined' && window.__careerHeroConfirm) {
    return await window.__careerHeroConfirm(text);
  }

  // Fallback (should rarely happen): native confirm may show URL in some browsers.
  // eslint-disable-next-line no-alert
  return window.confirm(text);
}

export {};

