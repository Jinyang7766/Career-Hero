import { describe, expect, it } from 'vitest';
import {
  retainInterviewAnalysisSessionsForRediagnose,
  retainInterviewSessionsForRediagnose,
} from '../../components/screens/ai-analysis/hooks/useAnalysisResetActions';

describe('rediagnose retain interview progress', () => {
  it('keeps interview chat sessions including legacy scene-key records', () => {
    const kept = retainInterviewSessionsForRediagnose({
      'k1': { chatMode: 'interview', messages: [{ id: 'm1' }] },
      'k2': { chatMode: 'micro', messages: [{ id: 'm2' }] },
      'jd_123__technical__comprehensive__scene_s_1': {
        messages: [{ id: 'm3' }],
        interviewType: 'technical',
        interviewMode: 'comprehensive',
      },
    });
    expect(Object.keys(kept).sort()).toEqual([
      'jd_123__technical__comprehensive__scene_s_1',
      'k1',
    ]);
    expect((kept as any)['jd_123__technical__comprehensive__scene_s_1']?.chatMode).toBe('interview');
  });

  it('keeps legacy ambiguous analysis session when it matches retained interview session', () => {
    const interviewSessions = {
      'jd_999__technical__comprehensive__scene_s_9': {
        chatMode: 'interview',
        jdKey: 'jd_999',
        interviewType: 'technical',
        interviewMode: 'comprehensive',
        resumeId: 'resume-1',
        messages: [{ id: 'x' }],
      },
    };

    const kept = retainInterviewAnalysisSessionsForRediagnose(
      {
        // Legacy row missing chatMode; should be retained by signature matching.
        'jd_999__technical__comprehensive': {
          jdKey: 'jd_999',
          interviewType: 'technical',
          interviewMode: 'comprehensive',
          resumeId: 'resume-1',
          step: 'chat',
          state: 'paused',
        },
        // Explicit micro row should be dropped.
        'jd_999__technical__comprehensive__micro': {
          chatMode: 'micro',
          jdKey: 'jd_999',
          interviewType: 'technical',
          interviewMode: 'comprehensive',
          resumeId: 'resume-1',
          step: 'chat',
          state: 'paused',
        },
        // Unmatched legacy row should be dropped.
        'jd_other__technical__comprehensive': {
          jdKey: 'jd_other',
          interviewType: 'technical',
          interviewMode: 'comprehensive',
          resumeId: 'resume-1',
          step: 'chat',
          state: 'paused',
        },
      },
      interviewSessions
    );

    expect(Object.keys(kept)).toEqual(['jd_999__technical__comprehensive']);
    expect((kept as any)['jd_999__technical__comprehensive']?.chatMode).toBe('interview');
  });
});
