import { describe, expect, it, vi } from 'vitest';
import { persistStateWithGuard } from '../session-persist-guard';

describe('persistStateWithGuard', () => {
  it('returns skipped when persist handler is missing', async () => {
    const result = await persistStateWithGuard({
      state: 'interview_in_progress',
      patch: { step: 'chat' },
    });

    expect(result).toBe('skipped');
  });

  it('returns completed when persist resolves in time', async () => {
    const persist = vi.fn(async () => {});
    const result = await persistStateWithGuard({
      persist,
      state: 'interview_in_progress',
      patch: { step: 'chat' },
      timeoutMs: 200,
    });

    expect(result).toBe('completed');
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('returns failed when persist rejects', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const persist = vi.fn(async () => {
      throw new Error('db down');
    });

    const result = await persistStateWithGuard({
      persist,
      state: 'interview_in_progress',
      patch: { step: 'chat' },
      timeoutMs: 200,
    });

    expect(result).toBe('failed');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('returns timed_out when persist is slower than timeout', async () => {
    vi.useFakeTimers();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const persist = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, 500);
        })
    );

    const resultPromise = persistStateWithGuard({
      persist,
      state: 'interview_in_progress',
      patch: { step: 'chat' },
      timeoutMs: 50,
    });

    await vi.advanceTimersByTimeAsync(50);
    await expect(resultPromise).resolves.toBe('timed_out');

    warnSpy.mockRestore();
    vi.useRealTimers();
  });
});
