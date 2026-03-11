import { describe, expect, it } from 'vitest';
import {
  SELECTION_REWRITE_MAX_CHARS,
  applySelectionRewriteToText,
  resolvePostInterviewSaveResult,
  resolveSelectionRewriteBoundaryReason,
} from '../../components/screens/ai-analysis/pages/PostInterviewReportPage';

describe('resolvePostInterviewSaveResult', () => {
  it('keeps user on current page and only opens success modal when save succeeds', () => {
    const outcome = resolvePostInterviewSaveResult(true);
    expect(outcome.shouldOpenSuccessModal).toBe(true);
    expect(outcome.shouldNavigateImmediately).toBe(false);
  });

  it('does not open success modal when save fails', () => {
    const outcome = resolvePostInterviewSaveResult(false);
    expect(outcome.shouldOpenSuccessModal).toBe(false);
    expect(outcome.shouldNavigateImmediately).toBe(false);
  });
});

describe('selection rewrite boundary', () => {
  it('requires user to select a non-empty text span first', () => {
    expect(resolveSelectionRewriteBoundaryReason('')).toBe('empty');
    expect(resolveSelectionRewriteBoundaryReason('   ')).toBe('empty');
  });

  it('blocks overlong selection to keep rewrite trigger bounded', () => {
    expect(resolveSelectionRewriteBoundaryReason('a'.repeat(SELECTION_REWRITE_MAX_CHARS + 1))).toBe('too_long');
    expect(resolveSelectionRewriteBoundaryReason('a'.repeat(SELECTION_REWRITE_MAX_CHARS))).toBeNull();
  });
});

describe('applySelectionRewriteToText', () => {
  it('replaces selected range and keeps prefix/suffix unchanged', () => {
    const source = '负责增长策略制定与实验复盘';
    const result = applySelectionRewriteToText(source, 2, 6, '主导增长策略与实验体系搭建');
    expect(result).toBe('负责主导增长策略与实验体系搭建制定与实验复盘');
  });

  it('returns source text when selection range is invalid', () => {
    const source = '项目描述';
    expect(applySelectionRewriteToText(source, 3, 3, 'X')).toBe(source);
    expect(applySelectionRewriteToText(source, 99, 120, 'X')).toBe(source);
  });
});
