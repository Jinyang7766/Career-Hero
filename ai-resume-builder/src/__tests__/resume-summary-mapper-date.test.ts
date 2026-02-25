import { describe, expect, it } from 'vitest';
import { mapDbResumeToSummary } from '../resume-summary-mapper';

describe('mapDbResumeToSummary date mapping', () => {
  it('prefers contentUpdatedAt over updated_at', () => {
    const summary = mapDbResumeToSummary({
      id: 1,
      title: '测试简历',
      updated_at: '2026-02-25T12:00:00+08:00',
      created_at: '2026-02-20T09:00:00+08:00',
      resume_data: {
        contentUpdatedAt: '2026-02-24T10:00:00+08:00',
      },
    } as any);

    expect(summary.date).toContain('2026-02-24');
    expect(summary.date).toContain('10:00:00');
  });
});
