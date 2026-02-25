import { describe, expect, it } from 'vitest';
import {
  buildResumeDataForJdEntry,
  inferDiagnosisTargetStep,
  shouldRestoreJdInputFromResume,
} from '../../components/screens/ai-analysis/hooks/useResumeSelection';

describe('useResumeSelection JD restore rules', () => {
  it('does not restore JD input for fresh diagnosis entry', () => {
    expect(shouldRestoreJdInputFromResume(false, false)).toBe(false);
  });

  it('restores JD input for report recovery entry', () => {
    expect(shouldRestoreJdInputFromResume(true, false)).toBe(true);
  });

  it('restores JD input when inferred target is report even if preferReport=false', () => {
    expect(shouldRestoreJdInputFromResume(false, false, 'report')).toBe(true);
  });

  it('does not restore JD input in interview mode even when preferReport=true', () => {
    expect(shouldRestoreJdInputFromResume(true, true)).toBe(false);
  });

  it('clears JD and target company when entering fresh JD page', () => {
    const raw = {
      id: 'resume-1',
      lastJdText: 'old jd',
      targetCompany: 'old company',
      resumeTitle: 'My Resume',
    };
    const sanitized = buildResumeDataForJdEntry(raw, false);
    expect(sanitized.lastJdText).toBe('');
    expect(sanitized.targetCompany).toBe('');
    expect(sanitized.resumeTitle).toBe('My Resume');
  });

  it('uses resume summary progress to enter report when row data lacks derived fields', () => {
    const target = inferDiagnosisTargetStep(
      {
        id: 'resume-1',
        resume_data: {},
      },
      {},
      {
        id: 'resume-1',
        latestAnalysisStep: 'report',
        diagnosisProgress: 80,
      } as any,
      undefined
    );
    expect(target).toBe('report');
  });

  it('enters report when target resume has analysis snapshot score', () => {
    const target = inferDiagnosisTargetStep(
      {
        id: 'resume-3',
        resume_data: {
          analysisSnapshot: { score: 72 },
        },
      },
      {
        diagnosisProgress: 0,
        latestAnalysisStep: 'jd_input',
      },
      null,
      undefined
    );
    expect(target).toBe('report');
  });

  it('uses resume summary step to enter final report', () => {
    const target = inferDiagnosisTargetStep(
      {
        id: 'resume-2',
        resume_data: {},
      },
      {},
      {
        id: 'resume-2',
        latestAnalysisStep: 'final_report',
        diagnosisProgress: 100,
      } as any,
      undefined
    );
    expect(target).toBe('final_report');
  });
});
