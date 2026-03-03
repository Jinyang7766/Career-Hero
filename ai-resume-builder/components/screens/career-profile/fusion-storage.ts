export type UploadChoice = 'pending' | 'uploaded' | 'skipped';

export const UPLOAD_CHOICE_KEY = 'guided_flow_step1_upload_choice';
export const UPLOAD_SEED_KEY = 'guided_flow_step1_seed_text';

export const getScopedFusionStorageKey = (key: string, userId?: string | null): string => {
  const uid = String(userId || '').trim();
  return uid ? `${key}:${uid}` : key;
};

const safeRead = (key: string): string => {
  try {
    return String(localStorage.getItem(key) || '');
  } catch {
    return '';
  }
};

const safeWrite = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore storage failures
  }
};

const safeRemove = (key: string) => {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore storage failures
  }
};

export const readFusionUploadChoice = (choiceKey: string): UploadChoice => {
  const rawChoice = String(safeRead(choiceKey) || '').trim().toLowerCase();
  if (rawChoice === 'uploaded' || rawChoice === 'skipped') return rawChoice;
  return 'pending';
};

export const writeFusionUploadChoice = (choiceKey: string, choice: UploadChoice) => {
  if (choice === 'pending') {
    safeRemove(choiceKey);
    return;
  }
  safeWrite(choiceKey, choice);
};

export const readFusionSeedText = (seedKey: string): string =>
  String(safeRead(seedKey) || '').trim();

export const writeFusionSeedText = (seedKey: string, seedText: string) => {
  const next = String(seedText || '').trim();
  if (!next) {
    safeRemove(seedKey);
    return;
  }
  safeWrite(seedKey, next);
};

export const clearFusionSeedText = (seedKey: string) => {
  safeRemove(seedKey);
};

