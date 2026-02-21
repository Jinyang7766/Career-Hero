import { useEffect, useRef } from 'react';

export const useRouteHistoryStack = ({
  currentRoute,
  navigationType,
}: {
  currentRoute: string;
  navigationType: 'POP' | 'PUSH' | 'REPLACE';
}) => {
  const routeHistoryRef = useRef<string[]>([]);

  useEffect(() => {
    const stack = routeHistoryRef.current;
    if (!stack.length) {
      routeHistoryRef.current = [currentRoute];
      return;
    }

    const last = stack[stack.length - 1];
    if (last === currentRoute) return;

    if (navigationType === 'REPLACE') {
      routeHistoryRef.current = [...stack.slice(0, -1), currentRoute];
      return;
    }

    if (navigationType === 'POP') {
      const idx = stack.lastIndexOf(currentRoute);
      if (idx >= 0) {
        routeHistoryRef.current = stack.slice(0, idx + 1);
      } else {
        routeHistoryRef.current = [...stack, currentRoute];
      }
      return;
    }

    routeHistoryRef.current = [...stack, currentRoute];
  }, [currentRoute, navigationType]);

  return {
    routeHistoryRef,
    clearHistory: () => {
      routeHistoryRef.current = [];
    },
    setSingleHistory: (route: string) => {
      routeHistoryRef.current = [route];
    },
    popPrevRoute: () => {
      const stack = routeHistoryRef.current;
      if (stack.length <= 1) return null;
      const prev = stack[stack.length - 2];
      routeHistoryRef.current = stack.slice(0, -1);
      return prev;
    },
  };
};

