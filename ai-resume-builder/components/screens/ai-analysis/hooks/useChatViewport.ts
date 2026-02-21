import { useEffect, useRef, useState } from 'react';

type Params = {
  currentStep: string;
  chatMessages: unknown[];
  isSending: boolean;
};

export const useChatViewport = ({ currentStep, chatMessages, isSending }: Params) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputBarRef = useRef<HTMLDivElement>(null);

  const pendingScrollTimersRef = useRef<number[]>([]);
  const shouldAutoScrollRef = useRef(true);

  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [inputBarHeight, setInputBarHeight] = useState(76);
  const keyboardOffsetRef = useRef(0);
  const isKeyboardOpenRef = useRef(false);
  const inputBarHeightRef = useRef(76);

  const clearPendingScrollTimers = () => {
    pendingScrollTimersRef.current.forEach((id) => window.clearTimeout(id));
    pendingScrollTimersRef.current = [];
  };

  const isDebugEnabled = () => {
    try {
      return localStorage.getItem('debug_react_185') === '1';
    } catch {
      return false;
    }
  };

  const debugLog = (message: string, data?: Record<string, unknown>) => {
    if (!isDebugEnabled()) return;
    if (data) {
      console.debug(`[useChatViewport] ${message}`, data);
      return;
    }
    console.debug(`[useChatViewport] ${message}`);
  };

  const applyKeyboardOffset = (next: number) => {
    const normalized = Math.max(0, Math.round(next));
    if (Math.abs(normalized - keyboardOffsetRef.current) < 2) return;
    keyboardOffsetRef.current = normalized;
    setKeyboardOffset(normalized);
  };

  const applyKeyboardOpen = (next: boolean) => {
    if (next === isKeyboardOpenRef.current) return;
    isKeyboardOpenRef.current = next;
    setIsKeyboardOpen(next);
  };

  const applyInputBarHeight = (next: number) => {
    const normalized = Math.max(60, Math.round(next));
    if (Math.abs(normalized - inputBarHeightRef.current) < 2) return;
    inputBarHeightRef.current = normalized;
    setInputBarHeight(normalized);
  };

  const isNearBottom = (el: HTMLElement, threshold = 120) => {
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    return distance <= threshold;
  };

  const onMessagesScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    shouldAutoScrollRef.current = isNearBottom(el);
  };

  const scrollToBottom = (behavior: ScrollBehavior = 'auto') => {
    const container = messagesContainerRef.current;
    if (container) {
      if (behavior === 'smooth') {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      } else {
        container.scrollTop = container.scrollHeight;
      }
      shouldAutoScrollRef.current = true;
      return;
    }
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior, block: 'end' });
    }
  };

  const scheduleScrollToBottom = (immediate = false, force = false) => {
    if (currentStep !== 'chat') return;
    if (!force && !shouldAutoScrollRef.current) return;
    const behavior: ScrollBehavior = immediate ? 'auto' : 'smooth';

    clearPendingScrollTimers();
    scrollToBottom(behavior);

    requestAnimationFrame(() => scrollToBottom('auto'));
    const t1 = window.setTimeout(() => scrollToBottom('auto'), 120);
    const t2 = window.setTimeout(() => scrollToBottom('auto'), 260);
    pendingScrollTimersRef.current = [t1, t2];
  };

  useEffect(() => {
    if (currentStep !== 'chat') return clearPendingScrollTimers;
    shouldAutoScrollRef.current = true;
    scheduleScrollToBottom(false, true);
    return clearPendingScrollTimers;
  }, [currentStep]);

  useEffect(() => {
    if (currentStep === 'chat') {
      scheduleScrollToBottom(false);
    }
    return clearPendingScrollTimers;
  }, [chatMessages.length, isSending, currentStep]);

  useEffect(() => {
    if (currentStep !== 'chat') return;

    const vv = (window as any).visualViewport as VisualViewport | undefined;
    const baselineHeight = vv ? vv.height : window.innerHeight;
    const rafRef = { id: 0 };

    const computeNow = () => {
      if (!vv) {
        applyKeyboardOffset(0);
        applyKeyboardOpen(false);
        return;
      }
      const overlap = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
      const heightDelta = Math.max(0, window.innerHeight - vv.height);
      const inferred = Math.max(overlap, heightDelta, 0);
      const maxReasonable = Math.max(0, Math.round(window.innerHeight * 0.7));
      applyKeyboardOffset(Math.min(inferred, maxReasonable));

      const shrinkage = baselineHeight - vv.height;
      applyKeyboardOpen(shrinkage > 100);
    };

    const compute = () => {
      if (rafRef.id) return;
      rafRef.id = window.requestAnimationFrame(() => {
        rafRef.id = 0;
        computeNow();
      });
    };

    const onFocusIn = (e: FocusEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') applyKeyboardOpen(true);
    };
    const onFocusOut = (e: FocusEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') {
        setTimeout(() => {
          if (
            document.activeElement?.tagName?.toLowerCase() !== 'input' &&
            document.activeElement?.tagName?.toLowerCase() !== 'textarea'
          ) {
            applyKeyboardOpen(false);
          }
        }, 120);
      }
    };

    compute();
    if (vv) {
      vv.addEventListener('resize', compute);
      vv.addEventListener('scroll', compute);
    }
    window.addEventListener('resize', compute);
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('focusout', onFocusOut, true);

    return () => {
      if (rafRef.id) {
        window.cancelAnimationFrame(rafRef.id);
      }
      if (vv) {
        vv.removeEventListener('resize', compute);
        vv.removeEventListener('scroll', compute);
      }
      window.removeEventListener('resize', compute);
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('focusout', onFocusOut, true);
    };
  }, [currentStep]);

  useEffect(() => {
    if (currentStep !== 'chat') return;
    const el = inputBarRef.current;
    if (!el) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      applyInputBarHeight(rect.height);
    };

    update();
    const ResizeObs = (window as any).ResizeObserver as any;
    if (!ResizeObs) {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }

    const ro = new ResizeObs(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [currentStep]);

  useEffect(() => {
    keyboardOffsetRef.current = keyboardOffset;
  }, [keyboardOffset]);

  useEffect(() => {
    isKeyboardOpenRef.current = isKeyboardOpen;
  }, [isKeyboardOpen]);

  useEffect(() => {
    inputBarHeightRef.current = inputBarHeight;
  }, [inputBarHeight]);

  useEffect(() => {
    if (currentStep !== 'chat') return;
    debugLog('state_update', {
      keyboardOffset,
      inputBarHeight,
      isKeyboardOpen,
      messageCount: chatMessages.length,
      isSending,
    });
  }, [currentStep, keyboardOffset, inputBarHeight, isKeyboardOpen, chatMessages.length, isSending]);

  useEffect(() => {
    if (currentStep !== 'chat') return;
    scheduleScrollToBottom(true);
    return clearPendingScrollTimers;
  }, [keyboardOffset, inputBarHeight, isKeyboardOpen, currentStep]);

  return {
    messagesEndRef,
    messagesContainerRef,
    inputBarRef,
    keyboardOffset,
    isKeyboardOpen,
    inputBarHeight,
    onMessagesScroll,
  };
};
