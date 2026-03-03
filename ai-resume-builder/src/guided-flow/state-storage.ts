import type { GuidedFlowState } from './types';

const ACTIVE_KEY_PREFIX = 'guided_flow_active';
const LAST_STATE_KEY_PREFIX = 'guided_flow_state_last_payload';

const normalizeUserId = (userId: string | null | undefined): string =>
  String(userId || '').trim();

const activeKey = (userId: string | null | undefined): string => {
  const uid = normalizeUserId(userId);
  return uid ? `${ACTIVE_KEY_PREFIX}:${uid}` : ACTIVE_KEY_PREFIX;
};

const lastStateKey = (userId: string): string => `${LAST_STATE_KEY_PREFIX}:${normalizeUserId(userId)}`;

const safeStorage = {
  get(key: string): string {
    try {
      return String(localStorage.getItem(key) || '');
    } catch {
      return '';
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // ignore storage failures
    }
  },
  remove(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore storage failures
    }
  },
};

export const setGuidedFlowActive = (userId: string | null | undefined, active: boolean) => {
  const key = activeKey(userId);
  if (active) {
    safeStorage.set(key, '1');
    return;
  }
  safeStorage.remove(key);
};

export const isGuidedFlowActive = (userId: string | null | undefined): boolean =>
  safeStorage.get(activeKey(userId)) === '1';

type PersistResult = {
  success: boolean;
  schemaMissing?: boolean;
  skipped?: boolean;
  error?: any;
};

type PersistParams = {
  userId: string;
  state: GuidedFlowState;
  updateUser: (userId: string, updates: any) => Promise<{ success: boolean; error?: any }>;
};

const isSchemaMissingError = (error: any): boolean => {
  const msg = String(error?.message || error || '').toLowerCase();
  return (
    msg.includes('guided_flow_state') &&
    (msg.includes('column') || msg.includes('does not exist') || msg.includes('schema'))
  );
};

export const persistGuidedFlowState = async ({
  userId,
  state,
  updateUser,
}: PersistParams): Promise<PersistResult> => {
  const uid = normalizeUserId(userId);
  if (!uid) return { success: false, error: new Error('missing user id') };
  if (!state || !state.step) return { success: false, error: new Error('missing guided flow step') };

  const stablePayload: GuidedFlowState = {
    step: state.step,
    resume_id: state.resume_id || undefined,
    jd_key: state.jd_key || undefined,
    analysis_mode: state.analysis_mode,
    source: state.source || 'guided_flow',
  };
  const serialized = JSON.stringify(stablePayload);
  const dedupeKey = lastStateKey(uid);
  if (safeStorage.get(dedupeKey) === serialized) {
    return { success: true, skipped: true };
  }

  const payload: GuidedFlowState = {
    ...stablePayload,
    updated_at: new Date().toISOString(),
  };

  const result = await updateUser(uid, { guided_flow_state: payload });
  if (!result?.success) {
    return {
      success: false,
      schemaMissing: isSchemaMissingError(result?.error),
      error: result?.error,
    };
  }

  safeStorage.set(dedupeKey, serialized);
  return { success: true };
};
