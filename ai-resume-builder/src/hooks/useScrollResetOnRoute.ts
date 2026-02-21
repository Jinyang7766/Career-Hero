import { useEffect } from 'react';
import type { RefObject } from 'react';

export const useScrollResetOnRoute = ({
  pathname,
  appContainerRef,
}: {
  pathname: string;
  appContainerRef: RefObject<HTMLDivElement | null>;
}) => {
  useEffect(() => {
    const scrollToTop = () => {
      try {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      } catch {
        window.scrollTo(0, 0);
      }

      const scroller = document.scrollingElement as HTMLElement | null;
      if (scroller) scroller.scrollTop = 0;

      const docEl = document.documentElement as HTMLElement | null;
      if (docEl) docEl.scrollTop = 0;

      const bodyEl = document.body as HTMLElement | null;
      if (bodyEl) bodyEl.scrollTop = 0;

      if (appContainerRef.current) appContainerRef.current.scrollTop = 0;
    };

    scrollToTop();
    const raf = window.requestAnimationFrame(scrollToTop);
    const timer = window.setTimeout(scrollToTop, 60);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [pathname, appContainerRef]);
};

