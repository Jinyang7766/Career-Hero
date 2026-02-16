import React, { useEffect, useRef, useState } from 'react';

type ToastType = 'info' | 'success' | 'error';
type ToastState = { msg: string; type: ToastType } | null;

export const useToastOverlay = () => {
  const [toast, setToast] = useState<ToastState>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = (msg: string, type: ToastType = 'info', ms: number = 2200) => {
    const text = String(msg || '').trim();
    if (!text) return;
    setToast({ msg: text, type });
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, ms);
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const ToastOverlay: React.FC = () => {
    if (!toast) return null;
    const tone = 'bg-red-500/80 backdrop-blur-md text-white border-red-400/30';
    return (
      <div className="fixed left-1/2 top-16 -translate-x-1/2 z-[220] px-4 pointer-events-none">
        <div className={`pointer-events-auto flex items-center gap-2.5 rounded-full px-4 py-2 shadow-xl shadow-red-500/20 border ${tone} max-w-[90vw]`}>
          <span className="material-symbols-outlined text-[18px] shrink-0 opacity-80">notifications</span>
          <div className="text-[14px] font-bold whitespace-nowrap overflow-hidden text-ellipsis">{toast.msg}</div>
        </div>
      </div>
    );
  };

  return { showToast, ToastOverlay };
};

