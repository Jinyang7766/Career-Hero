import { describe, expect, it } from 'vitest';
import {
  inferDiagnosisTargetStepFromSummary,
  shouldPreferReportOnResumeClick,
} from '../../components/screens/ai-analysis/pages/ResumeSelectPage';

describe('shouldPreferReportOnResumeClick', () => {
  it('diagnosis mode does not force report from analyzed=true only', () => {
    const prefer = shouldPreferReportOnResumeClick({
      id: 'resume-1',
      title: 'A',
      date: '2026-01-01 00:00:00',
      analyzed: true,
      diagnosisProgress: 0,
      latestAnalysisStep: '',
      thumbnail: null as any,
    } as any, false);
    expect(prefer).toBe(false);
  });

  it('diagnosis mode prefers report when diagnosis progress is recoverable', () => {
    const prefer = shouldPreferReportOnResumeClick({
      id: 'resume-2',
      title: 'B',
      date: '2026-01-01 00:00:00',
      analyzed: false,
      diagnosisProgress: 80,
      latestAnalysisStep: 'report',
      thumbnail: null as any,
    } as any, false);
    expect(prefer).toBe(true);
  });

  it('interview mode keeps original behavior', () => {
    const prefer = shouldPreferReportOnResumeClick({
      id: 'resume-3',
      title: 'C',
      date: '2026-01-01 00:00:00',
      analyzed: true,
      diagnosisProgress: 0,
      latestAnalysisStep: '',
      thumbnail: null as any,
    } as any, true);
    expect(prefer).toBe(true);
  });

  it('infers final_report target from summary progress', () => {
    const target = inferDiagnosisTargetStepFromSummary({
      id: 'resume-4',
      title: 'D',
      date: '2026-01-01 00:00:00',
      diagnosisProgress: 60,
      latestAnalysisStep: '',
      analyzed: true,
      thumbnail: null as any,
    } as any);
    expect(target).toBe('final_report');
  });

  it('infers final_report target from summary latest step', () => {
    const target = inferDiagnosisTargetStepFromSummary({
      id: 'resume-5',
      title: 'E',
      date: '2026-01-01 00:00:00',
      diagnosisProgress: 0,
      latestAnalysisStep: 'final_report',
      analyzed: true,
      thumbnail: null as any,
    } as any);
    expect(target).toBe('final_report');
  });
});
