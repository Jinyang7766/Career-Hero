export type PreviewHistoryState<T> = {
  past: T[];
  future: T[];
};

export const createPreviewHistoryState = <T,>(): PreviewHistoryState<T> => ({
  past: [],
  future: [],
});

export const pushPreviewHistory = <T,>(
  state: PreviewHistoryState<T>,
  current: T,
  maxSize: number
): PreviewHistoryState<T> => {
  const boundedMaxSize = Math.max(1, maxSize);
  const nextPast = [...state.past, current];
  const past = nextPast.length > boundedMaxSize
    ? nextPast.slice(nextPast.length - boundedMaxSize)
    : nextPast;
  return {
    past,
    future: [],
  };
};

export const undoPreviewHistory = <T,>(
  state: PreviewHistoryState<T>,
  current: T
): { history: PreviewHistoryState<T>; snapshot: T | null } => {
  if (state.past.length === 0) {
    return { history: state, snapshot: null };
  }
  const snapshot = state.past[state.past.length - 1];
  return {
    history: {
      past: state.past.slice(0, -1),
      future: [...state.future, current],
    },
    snapshot,
  };
};

export const redoPreviewHistory = <T,>(
  state: PreviewHistoryState<T>,
  current: T
): { history: PreviewHistoryState<T>; snapshot: T | null } => {
  if (state.future.length === 0) {
    return { history: state, snapshot: null };
  }
  const snapshot = state.future[state.future.length - 1];
  return {
    history: {
      past: [...state.past, current],
      future: state.future.slice(0, -1),
    },
    snapshot,
  };
};

