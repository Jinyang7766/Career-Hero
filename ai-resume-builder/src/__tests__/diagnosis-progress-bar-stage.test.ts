import { describe, expect, it } from 'vitest';
import { deriveDiagnosisStageStatuses } from '../../components/shared/DiagnosisProgressBar';

describe('DiagnosisProgressBar stage status', () => {
  it('marks initial diagnosis as current when only JD is filled', () => {
    expect(deriveDiagnosisStageStatuses('jd_input', 15, false)).toEqual(['current', 'todo', 'todo']);
  });

  it('marks initial diagnosis as current while analyzing', () => {
    expect(deriveDiagnosisStageStatuses('analyzing', 35, false)).toEqual(['current', 'todo', 'todo']);
  });

  it('marks initial diagnosis as done only when report is ready', () => {
    expect(deriveDiagnosisStageStatuses('report', 60, false)).toEqual(['done', 'todo', 'todo']);
  });

  it('marks micro interview stage as current during chat', () => {
    expect(deriveDiagnosisStageStatuses('chat', 82, false)).toEqual(['done', 'current', 'todo']);
  });

  it('marks final report stage as current when interview report is generating', () => {
    expect(deriveDiagnosisStageStatuses('interview_report', 95, false)).toEqual(['done', 'done', 'current']);
  });

  it('marks all stages as done after final report completion', () => {
    expect(deriveDiagnosisStageStatuses('final_report', 100, true)).toEqual(['done', 'done', 'done']);
  });
});

