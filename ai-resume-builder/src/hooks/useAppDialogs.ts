import { useCallback, useEffect, useRef, useState } from 'react';

type ToastType = 'info' | 'success' | 'error';
type ConfirmState = null | { message: string; resolve: (ok: boolean) => void };

export const useAppDialogs = () => {
  const toastTimerRef = useRef<number | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: ToastType } | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);

  const showToast = useCallback((msg: string, type: ToastType = 'info', ms: number = 2200) => {
    const text = String(msg ?? '').trim();
    if (!text) return;
    setToast({ msg: text, type });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, ms);
  }, []);

  const confirmAsync = useCallback((message: string) => {
    return new Promise<boolean>((resolve) => {
      const text = String(message ?? '').trim();
      if (!text) return resolve(false);
      setConfirmState({ message: text, resolve });
    });
  }, []);

  useEffect(() => {
    const originalAlert = window.alert;
    (window as any).__careerHeroToast = (msg: string, type?: ToastType, ms?: number) =>
      showToast(msg, type ?? 'info', ms ?? 2200);
    (window as any).__careerHeroConfirm = (msg: string) => confirmAsync(msg);

    window.alert = (message?: any) => {
      showToast(String(message ?? ''), 'info', 2600);
    };

    return () => {
      window.alert = originalAlert;
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
      try {
        delete (window as any).__careerHeroToast;
        delete (window as any).__careerHeroConfirm;
      } catch {
        // ignore
      }
    };
  }, [showToast, confirmAsync]);

  return {
    toast,
    setToast,
    confirmState,
    setConfirmState,
    showToast,
    confirmAsync,
  };
};

