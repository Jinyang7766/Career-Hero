import { persistStateWithGuard } from '../../../src/session-persist-guard';

type PersistInterviewInProgress<Patch extends object> = (
  state: 'interview_in_progress',
  patch?: Patch
) => Promise<void> | void;

type Params<Patch extends object> = {
  persist?: PersistInterviewInProgress<Patch>;
  patch: Patch;
  openChat?: (source: 'internal' | 'preview') => void;
  source?: 'internal' | 'preview';
  timeoutMs?: number;
  label?: string;
};

export const openChatWithInterviewCheckpoint = <Patch extends object>({
  persist,
  patch,
  openChat,
  source = 'internal',
  timeoutMs = 1600,
  label = 'interview_in_progress state',
}: Params<Patch>) => {
  void persistStateWithGuard({
    persist,
    state: 'interview_in_progress',
    patch,
    timeoutMs,
    label,
  });
  openChat?.(source);
};
