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

  const clearPendingScrollTimers = () => {
    pendingScrollTimersRef.current.forEach((id) => window.clearTimeout(id));
    pendingScrollTimersRef.current = [];
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

    const compute = () => {
      if (!vv) {
        setKeyboardOffset(0);
        return;
      }
      const overlap = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
      const heightDelta = Math.max(0, window.innerHeight - vv.height);
      const inferred = Math.max(overlap, heightDelta);
      setKeyboardOffset(inferred);

      const shrinkage = baselineHeight - vv.height;
      setIsKeyboardOpen(shrinkage > 100);
    };

    const onFocusIn = (e: FocusEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') setIsKeyboardOpen(true);
    };
    const onFocusOut = (e: FocusEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') {
        setTimeout(() => {
          if (
            document.activeElement?.tagName?.toLowerCase() !== 'input' &&
            document.activeElement?.tagName?.toLowerCase() !== 'textarea'
          ) {
            setIsKeyboardOpen(false);
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
      setInputBarHeight(Math.max(60, Math.round(rect.height)));
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
