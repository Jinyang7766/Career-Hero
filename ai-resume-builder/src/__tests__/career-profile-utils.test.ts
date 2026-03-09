import { describe, expect, it } from 'vitest';
import {
  buildCareerProfileFingerprint,
  getLatestCareerProfile,
  normalizeCareerProfile,
} from '../career-profile-utils';

describe('career-profile-utils', () => {
  it('normalizes profile payload', () => {
    const normalized = normalizeCareerProfile({
      summary: '负责增长策略',
      coreSkills: ['SQL', 'SQL', 'A/B Test'],
      experiences: [
        {
          title: '增长项目',
          actions: '主导实验设计',
          results: '提升转化',
          inResume: 'no',
          confidence: 'high',
        },
      ],
    });

    expect(normalized).toBeTruthy();
    expect(normalized?.summary).toContain('负责增长策略');
    expect(normalized?.coreSkills).toHaveLength(2);
    expect(normalized?.coreSkills).toContain('SQL');
    expect(normalized?.coreSkills).toContain('A/B Test');
    expect(normalized?.experiences?.[0]?.inResume).toBe('no');
  });

  it('extracts latest profile from user record', () => {
    const profile = getLatestCareerProfile({
      career_profile_latest: {
        summary: '测试画像',
      },
    });
    expect(profile?.summary).toBe('测试画像');
  });

  it('changes fingerprint when profile changes', () => {
    const first = normalizeCareerProfile({ summary: 'A' });
    const second = normalizeCareerProfile({ summary: 'B' });
    expect(buildCareerProfileFingerprint(first)).not.toBe(buildCareerProfileFingerprint(second));
  });
});
