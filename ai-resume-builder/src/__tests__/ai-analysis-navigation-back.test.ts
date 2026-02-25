import { describe, expect, it } from 'vitest';
import { popHistoryBackTarget } from '../../components/screens/ai-analysis/hooks/useAiAnalysisNavigation';

describe('popHistoryBackTarget', () => {
  it('drops duplicate-only current step history and returns no target', () => {
    const result = popHistoryBackTarget(['jd_input'], 'jd_input');
    expect(result.remainingHistory).toEqual([]);
    expect(result.targetStep).toBeNull();
  });

  it('skips duplicated current step and returns previous distinct step', () => {
    const result = popHistoryBackTarget(['resume_select', 'jd_input'], 'jd_input');
    expect(result.remainingHistory).toEqual([]);
    expect(result.targetStep).toBe('resume_select');
  });

  it('maps report->analyzing history to jd_input', () => {
    const result = popHistoryBackTarget(['analyzing'], 'report');
    expect(result.remainingHistory).toEqual([]);
    expect(result.targetStep).toBe('jd_input');
  });

  it('never returns analyzing when back from report if earlier step exists', () => {
    const result = popHistoryBackTarget(['jd_input', 'analyzing'], 'report');
    expect(result.remainingHistory).toEqual([]);
    expect(result.targetStep).toBe('jd_input');
  });

  it('maps report->micro_intro history to jd_input', () => {
    const result = popHistoryBackTarget(['micro_intro'], 'report');
    expect(result.remainingHistory).toEqual([]);
    expect(result.targetStep).toBe('jd_input');
  });

  it('skips micro_intro from report when earlier step exists', () => {
    const result = popHistoryBackTarget(['resume_select', 'micro_intro'], 'report');
    expect(result.remainingHistory).toEqual([]);
    expect(result.targetStep).toBe('resume_select');
  });
});
