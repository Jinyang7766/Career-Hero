export type PersistGuardStatus = 'skipped' | 'completed' | 'failed' | 'timed_out';

type PersistFn<State extends string, Patch extends object> = (
  state: State,
  patch?: Patch
) => Promise<void> | void;

type Params<State extends string, Patch extends object> = {
  persist?: PersistFn<State, Patch>;
  state: State;
  patch?: Patch;
  timeoutMs?: number;
  label?: string;
};

const DEFAULT_TIMEOUT_MS = 1600;

export const persistStateWithGuard = async <
  State extends string,
  Patch extends object,
>({
  persist,
  state,
  patch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  label,
}: Params<State, Patch>): Promise<PersistGuardStatus> => {
  if (!persist) return 'skipped';

  const stateLabel = String(label || state || 'session_state');
  let timer: ReturnType<typeof setTimeout> | null = null;

  const persistTask = Promise.resolve()
    .then(() => persist(state, patch))
    .then(() => 'completed' as const)
    .catch((error) => {
      console.warn(`Failed to persist ${stateLabel}:`, error);
      return 'failed' as const;
    });

  const timeoutTask = new Promise<'timed_out'>((resolve) => {
    timer = setTimeout(() => resolve('timed_out'), Math.max(0, timeoutMs));
  });

  const outcome = await Promise.race([persistTask, timeoutTask]);
  if (timer) clearTimeout(timer);

  if (outcome === 'timed_out') {
    console.warn(
      `Persist ${stateLabel} timed out after ${Math.max(0, timeoutMs)}ms; continue without blocking UI`
    );
  }

  return outcome;
};
