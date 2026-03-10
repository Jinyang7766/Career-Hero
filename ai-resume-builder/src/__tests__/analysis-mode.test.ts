import { describe, expect, it } from 'vitest';
import {
  getAnalysisModeLabel,
  isJdRequiredForAnalysisMode,
  normalizeAnalysisMode,
  shouldPromptForMissingJd,
} from '../../components/screens/ai-analysis/analysis-mode';

describe('analysis mode helpers', () => {
  it('normalizes analysis mode with targeted fallback', () => {
    expect(normalizeAnalysisMode('generic')).toBe('generic');
    expect(normalizeAnalysisMode('targeted')).toBe('targeted');
    expect(normalizeAnalysisMode('')).toBe('targeted');
    expect(normalizeAnalysisMode(undefined)).toBe('targeted');
  });

  it('knows which mode requires JD', () => {
    expect(isJdRequiredForAnalysisMode('targeted')).toBe(true);
    expect(isJdRequiredForAnalysisMode('generic')).toBe(false);
  });

  it('provides stable mode labels', () => {
    expect(getAnalysisModeLabel('generic')).toBe('通用优化');
    expect(getAnalysisModeLabel('targeted')).toBe('定向精修');
  });

  it('prompts missing JD only for targeted diagnosis mode', () => {
    expect(
      shouldPromptForMissingJd({
        isInterviewMode: false,
        jdText: '',
        analysisMode: 'targeted',
      })
    ).toBe(true);
    expect(
      shouldPromptForMissingJd({
        isInterviewMode: false,
        jdText: '',
        analysisMode: 'generic',
      })
    ).toBe(false);
    expect(
      shouldPromptForMissingJd({
        isInterviewMode: true,
        jdText: '',
        analysisMode: 'targeted',
      })
    ).toBe(false);
  });
});
