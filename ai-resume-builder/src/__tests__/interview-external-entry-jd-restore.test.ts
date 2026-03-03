import { describe, expect, it } from 'vitest';
import { shouldRestoreInterviewJdOnExternalEntry } from '../../components/screens/ai-analysis/hooks/useAiInterviewExternalEntry';

describe('shouldRestoreInterviewJdOnExternalEntry', () => {
  it('restores JD on scene_select entry', () => {
    expect(shouldRestoreInterviewJdOnExternalEntry('scene_select')).toBe(true);
  });

  it('restores JD on chat entry mode', () => {
    expect(shouldRestoreInterviewJdOnExternalEntry('chat')).toBe(true);
  });

  it('defaults to restore when mode is empty', () => {
    expect(shouldRestoreInterviewJdOnExternalEntry('')).toBe(true);
  });
});
