import { describe, expect, it } from 'vitest';
import { resolvePostInterviewSaveResult } from '../../components/screens/ai-analysis/pages/PostInterviewReportPage';

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
