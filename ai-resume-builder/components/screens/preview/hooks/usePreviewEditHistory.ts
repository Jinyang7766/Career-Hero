import React from 'react';
import type { ResumeData } from '../../../../types';
import {
  createPreviewHistoryState,
  pushPreviewHistory,
  redoPreviewHistory,
  undoPreviewHistory,
  type PreviewHistoryState,
} from '../history-stack';

type Params = {
  resumeData: ResumeData | null | undefined;
  setResumeData: (data: ResumeData | ((prev: ResumeData) => ResumeData)) => void;
  enabled: boolean;
  maxHistory?: number;
};

const DEFAULT_MAX_HISTORY = 40;

export const usePreviewEditHistory = ({
  resumeData,
  setResumeData,
  enabled,
  maxHistory = DEFAULT_MAX_HISTORY,
}: Params) => {
  const [history, setHistory] = React.useState<PreviewHistoryState<ResumeData>>(createPreviewHistoryState);
  const historyRef = React.useRef(history);
  const currentRef = React.useRef<ResumeData | null | undefined>(resumeData);

  React.useEffect(() => {
    historyRef.current = history;
  }, [history]);

  React.useEffect(() => {
    currentRef.current = resumeData;
  }, [resumeData]);

  React.useEffect(() => {
    if (enabled) return;
    const reset = createPreviewHistoryState<ResumeData>();
    historyRef.current = reset;
    setHistory(reset);
  }, [enabled]);

  const applyEditMutation = React.useCallback((updater: (current: ResumeData) => ResumeData) => {
    if (!enabled) return;
    const current = currentRef.current;
    if (!current) return;
    const next = updater(current);
    if (!next || next === current) return;

    const nextHistory = pushPreviewHistory(historyRef.current, current, maxHistory);
    historyRef.current = nextHistory;
    setHistory(nextHistory);
    currentRef.current = next;
    setResumeData(next);
  }, [enabled, maxHistory, setResumeData]);

  const undo = React.useCallback(() => {
    if (!enabled) return;
    const current = currentRef.current;
    if (!current) return;

    const result = undoPreviewHistory(historyRef.current, current);
    if (!result.snapshot) return;
    historyRef.current = result.history;
    setHistory(result.history);
    currentRef.current = result.snapshot;
    setResumeData(result.snapshot);
  }, [enabled, setResumeData]);

  const redo = React.useCallback(() => {
    if (!enabled) return;
    const current = currentRef.current;
    if (!current) return;

    const result = redoPreviewHistory(historyRef.current, current);
    if (!result.snapshot) return;
    historyRef.current = result.history;
    setHistory(result.history);
    currentRef.current = result.snapshot;
    setResumeData(result.snapshot);
  }, [enabled, setResumeData]);

  return {
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    undo,
    redo,
    applyEditMutation,
  };
};

