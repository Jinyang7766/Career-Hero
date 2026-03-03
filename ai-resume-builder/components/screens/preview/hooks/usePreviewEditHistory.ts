import React from 'react';
import type { ResumeData } from '../../../../types';
import {
  createPreviewHistoryState,
  pushPreviewHistory,
  redoPreviewHistory,
  undoPreviewHistory,
  type PreviewHistoryState,
} from '../history-stack';
import { resolvePreviewDirtyKeys } from '../preview-dirty';

type Params = {
  resumeData: ResumeData | null | undefined;
  setResumeData: (data: ResumeData | ((prev: ResumeData) => ResumeData)) => void;
  enabled: boolean;
  maxHistory?: number;
};

type ApplyEditMutationOptions = {
  dirtyKeys?: string[];
};

const DEFAULT_MAX_HISTORY = 40;

export const usePreviewEditHistory = ({
  resumeData,
  setResumeData,
  enabled,
  maxHistory = DEFAULT_MAX_HISTORY,
}: Params) => {
  const [history, setHistory] = React.useState<PreviewHistoryState<ResumeData>>(createPreviewHistoryState);
  const [dirtyFieldKeys, setDirtyFieldKeys] = React.useState<string[]>([]);

  const historyRef = React.useRef(history);
  const currentRef = React.useRef<ResumeData | null | undefined>(resumeData);
  const baselineRef = React.useRef<ResumeData | null | undefined>(null);
  const trackedDirtyKeysRef = React.useRef<Set<string>>(new Set());

  React.useEffect(() => {
    historyRef.current = history;
  }, [history]);

  React.useEffect(() => {
    currentRef.current = resumeData;
  }, [resumeData]);

  const refreshDirtyState = React.useCallback((nextData: ResumeData | null | undefined, incomingKeys?: string[]) => {
    if (incomingKeys?.length) {
      incomingKeys
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .forEach((item) => trackedDirtyKeysRef.current.add(item));
    }

    const baseline = baselineRef.current;
    if (!baseline || !nextData) {
      setDirtyFieldKeys([]);
      return;
    }

    const nextDirtyKeys = resolvePreviewDirtyKeys({
      baseline,
      current: nextData,
      trackedKeys: trackedDirtyKeysRef.current,
    });
    setDirtyFieldKeys(nextDirtyKeys);
  }, []);

  React.useEffect(() => {
    if (!enabled) {
      const reset = createPreviewHistoryState<ResumeData>();
      historyRef.current = reset;
      setHistory(reset);
      baselineRef.current = null;
      trackedDirtyKeysRef.current = new Set();
      setDirtyFieldKeys([]);
      return;
    }

    if (!baselineRef.current && resumeData) {
      baselineRef.current = resumeData;
      trackedDirtyKeysRef.current = new Set();
      setDirtyFieldKeys([]);
    }
  }, [enabled, resumeData]);

  const applyEditMutation = React.useCallback((
    updater: (current: ResumeData) => ResumeData,
    options?: ApplyEditMutationOptions
  ) => {
    if (!enabled) return;
    const current = currentRef.current;
    if (!current) return;
    const next = updater(current);
    if (!next || next === current) return;

    const nextHistory = pushPreviewHistory(historyRef.current, current, maxHistory);
    historyRef.current = nextHistory;
    setHistory(nextHistory);
    currentRef.current = next;
    refreshDirtyState(next, options?.dirtyKeys);
    setResumeData(next);
  }, [enabled, maxHistory, refreshDirtyState, setResumeData]);

  const undo = React.useCallback(() => {
    if (!enabled) return;
    const current = currentRef.current;
    if (!current) return;

    const result = undoPreviewHistory(historyRef.current, current);
    if (!result.snapshot) return;
    historyRef.current = result.history;
    setHistory(result.history);
    currentRef.current = result.snapshot;
    refreshDirtyState(result.snapshot);
    setResumeData(result.snapshot);
  }, [enabled, refreshDirtyState, setResumeData]);

  const redo = React.useCallback(() => {
    if (!enabled) return;
    const current = currentRef.current;
    if (!current) return;

    const result = redoPreviewHistory(historyRef.current, current);
    if (!result.snapshot) return;
    historyRef.current = result.history;
    setHistory(result.history);
    currentRef.current = result.snapshot;
    refreshDirtyState(result.snapshot);
    setResumeData(result.snapshot);
  }, [enabled, refreshDirtyState, setResumeData]);

  const dirtySet = React.useMemo(() => new Set(dirtyFieldKeys), [dirtyFieldKeys]);
  const isFieldDirty = React.useCallback((dirtyKey: string) => dirtySet.has(dirtyKey), [dirtySet]);

  return {
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    undo,
    redo,
    applyEditMutation,
    dirtyFieldKeys,
    hasDirtyChanges: dirtyFieldKeys.length > 0,
    isFieldDirty,
  };
};
