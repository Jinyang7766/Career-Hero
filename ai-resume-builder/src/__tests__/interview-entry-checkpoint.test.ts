import { describe, expect, it, vi } from 'vitest';
import { openChatWithInterviewCheckpoint } from '../../components/screens/ai-analysis/interview-entry-checkpoint';

describe('openChatWithInterviewCheckpoint', () => {
  it('opens chat immediately without waiting for persist resolution', async () => {
    vi.useFakeTimers();
    const persist = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, 500);
        })
    );
    const openChat = vi.fn();

    openChatWithInterviewCheckpoint({
      persist,
      patch: { step: 'chat', force: true },
      openChat,
      source: 'internal',
      timeoutMs: 50,
    });

    expect(openChat).toHaveBeenCalledTimes(1);
    expect(openChat).toHaveBeenCalledWith('internal');
    await Promise.resolve();
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith('interview_in_progress', { step: 'chat', force: true });

    vi.useRealTimers();
  });

  it('still opens chat when persist function is absent', () => {
    const openChat = vi.fn();

    openChatWithInterviewCheckpoint({
      patch: { step: 'chat' },
      openChat,
      source: 'preview',
    });

    expect(openChat).toHaveBeenCalledTimes(1);
    expect(openChat).toHaveBeenCalledWith('preview');
  });
});
