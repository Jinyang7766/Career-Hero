import type { FollowupPrompt, PromptCategory } from './profile-followup-prompts';

export type UploadChoice = 'pending' | 'uploaded' | 'skipped';
export type FollowupCardStatus = 'pending' | 'completed' | 'missing';

export type FollowupProgressItem = {
  id: string;
  category: PromptCategory;
  text: string;
  status: FollowupCardStatus;
};

export type FollowupProgressSnapshot = {
  updatedAt: string;
  cards: FollowupProgressItem[];
};

export const UPLOAD_CHOICE_KEY = 'guided_flow_step1_upload_choice';
export const UPLOAD_SEED_KEY = 'guided_flow_step1_seed_text';
export const FOLLOWUP_PROGRESS_KEY = 'guided_flow_step2_followup_progress';

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

const sanitizeFollowupCard = (item: any): FollowupProgressItem | null => {
  if (!item || typeof item !== 'object') return null;
  const id = String(item.id || '').trim();
  const text = String(item.text || '').trim();
  const categoryRaw = String(item.category || '').trim();
  const statusRaw = String(item.status || '').trim();
  if (!id || !text) return null;
  if (
    categoryRaw !== 'experience' &&
    categoryRaw !== 'skills_education' &&
    categoryRaw !== 'personality' &&
    categoryRaw !== 'others'
  ) {
    return null;
  }
  if (statusRaw !== 'pending' && statusRaw !== 'completed' && statusRaw !== 'missing') {
    return null;
  }
  return {
    id,
    text,
    category: categoryRaw,
    status: statusRaw,
  } as FollowupProgressItem;
};

export const readFusionFollowupProgress = (
  progressKey: string
): FollowupProgressSnapshot | null => {
  const raw = safeRead(progressKey);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as FollowupProgressSnapshot;
    const cards = Array.isArray(parsed?.cards)
      ? parsed.cards.map(sanitizeFollowupCard).filter(Boolean) as FollowupProgressItem[]
      : [];
    if (!cards.length) return null;
    return {
      updatedAt: String(parsed?.updatedAt || '').trim() || new Date().toISOString(),
      cards,
    };
  } catch {
    return null;
  }
};

export const writeFusionFollowupProgress = (
  progressKey: string,
  cards: Array<Pick<FollowupPrompt, 'id' | 'category' | 'text'> & { status: FollowupCardStatus }>
) => {
  const normalizedCards = cards
    .map((item) => sanitizeFollowupCard(item))
    .filter(Boolean) as FollowupProgressItem[];
  if (!normalizedCards.length) {
    safeRemove(progressKey);
    return;
  }
  safeWrite(
    progressKey,
    JSON.stringify({
      updatedAt: new Date().toISOString(),
      cards: normalizedCards,
    })
  );
};

export const clearFusionFollowupProgress = (progressKey: string) => {
  safeRemove(progressKey);
};
