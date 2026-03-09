import { describe, expect, it } from 'vitest';
import {
  canApplyDiagnosisStepRecovery,
  shouldSkipInterviewAutoRecovery,
} from '../../components/screens/ai-analysis/hooks/useAnalysisSessionRecovery';

describe('canApplyDiagnosisStepRecovery', () => {
  it('never forces diagnosis flow back to jd_input', () => {
    expect(canApplyDiagnosisStepRecovery('resume_select', 'jd_input')).toBe(false);
    expect(canApplyDiagnosisStepRecovery('report', 'jd_input')).toBe(false);
  });

  it('allows recovering final_report from diagnosis steps only', () => {
    expect(canApplyDiagnosisStepRecovery('resume_select', 'final_report')).toBe(false);
    expect(canApplyDiagnosisStepRecovery('jd_input', 'final_report')).toBe(true);
    expect(canApplyDiagnosisStepRecovery('analyzing', 'final_report')).toBe(true);
    expect(canApplyDiagnosisStepRecovery('final_report', 'final_report')).toBe(false);
  });

  it('allows recovering final_report from legacy report step only', () => {
    expect(canApplyDiagnosisStepRecovery('comparison', 'final_report')).toBe(false);
    expect(canApplyDiagnosisStepRecovery('report', 'final_report')).toBe(true);
  });
});

describe('shouldSkipInterviewAutoRecovery', () => {
  it('blocks auto recovery on interview resume_select/interview_scene only', () => {
    expect(shouldSkipInterviewAutoRecovery(true, 'resume_select')).toBe(true);
    expect(shouldSkipInterviewAutoRecovery(true, 'jd_input')).toBe(false);
  });

  it('allows recovery checks on chat/final_report when in interview mode', () => {
    expect(shouldSkipInterviewAutoRecovery(true, 'chat')).toBe(false);
    expect(shouldSkipInterviewAutoRecovery(true, 'final_report')).toBe(false);
  });

  it('never blocks diagnosis mode', () => {
    expect(shouldSkipInterviewAutoRecovery(false, 'resume_select')).toBe(false);
    expect(shouldSkipInterviewAutoRecovery(false, 'jd_input')).toBe(false);
  });
});
