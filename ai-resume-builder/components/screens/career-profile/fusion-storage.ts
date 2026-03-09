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

export type FollowupSessionSnapshot = {
  updatedAt: string;
  sourcePath: string;
  supplementText: string;
  uploadedResumeTitle: string;
  uploadedResume: Record<string, any> | null;
  prompts: Array<Pick<FollowupPrompt, 'id' | 'category' | 'text'>>;
  answersByPromptId: Record<string, string>;
  draftByPromptId: Record<string, string>;
  skippedPromptIds: string[];
  currentIndex: number;
};

export const UPLOAD_CHOICE_KEY = 'guided_flow_step1_upload_choice';
export const UPLOAD_SEED_KEY = 'guided_flow_step1_seed_text';
export const FOLLOWUP_PROGRESS_KEY = 'guided_flow_step2_followup_progress';
export const FOLLOWUP_SESSION_KEY = 'guided_flow_step2_followup_session';

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

const sanitizePromptCategory = (raw: string): PromptCategory | null => {
  if (
    raw === 'experience' ||
    raw === 'skills_education' ||
    raw === 'personality' ||
    raw === 'others'
  ) {
    return raw;
  }
  return null;
};

const sanitizeFollowupCard = (item: any): FollowupProgressItem | null => {
  if (!item || typeof item !== 'object') return null;
  const id = String(item.id || '').trim();
  const text = String(item.text || '').trim();
  const category = sanitizePromptCategory(String(item.category || '').trim());
  const statusRaw = String(item.status || '').trim();
  if (!id || !text || !category) return null;
  if (statusRaw !== 'pending' && statusRaw !== 'completed' && statusRaw !== 'missing') {
    return null;
  }
  return {
    id,
    text,
    category,
    status: statusRaw,
  };
};

const sanitizeFollowupPrompt = (
  item: any
): Pick<FollowupPrompt, 'id' | 'category' | 'text'> | null => {
  if (!item || typeof item !== 'object') return null;
  const id = String(item.id || '').trim();
  const text = String(item.text || '').trim();
  const category = sanitizePromptCategory(String(item.category || '').trim());
  if (!id || !text || !category) return null;
  return {
    id,
    text,
    category,
  };
};

const sanitizeAnswerMap = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const next: Record<string, string> = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, raw]) => {
    const id = String(key || '').trim();
    if (!id) return;
    const text = String(raw || '').trim();
    if (!text) return;
    next[id] = text;
  });
  return next;
};

const sanitizeSkippedIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const next: string[] = [];
  value.forEach((item) => {
    const id = String(item || '').trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    next.push(id);
  });
  return next;
};

export const readFusionFollowupProgress = (
  progressKey: string
): FollowupProgressSnapshot | null => {
  const raw = safeRead(progressKey);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as FollowupProgressSnapshot;
    const cards = Array.isArray(parsed?.cards)
      ? (parsed.cards.map(sanitizeFollowupCard).filter(Boolean) as FollowupProgressItem[])
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

export const readFusionFollowupSession = (
  sessionKey: string
): FollowupSessionSnapshot | null => {
  const raw = safeRead(sessionKey);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as FollowupSessionSnapshot;
    const prompts = Array.isArray(parsed?.prompts)
      ? (parsed.prompts.map(sanitizeFollowupPrompt).filter(Boolean) as Array<
        Pick<FollowupPrompt, 'id' | 'category' | 'text'>
      >)
      : [];

    const answersByPromptId = sanitizeAnswerMap(parsed?.answersByPromptId);
    const draftByPromptId = sanitizeAnswerMap(parsed?.draftByPromptId);
    const skippedPromptIds = sanitizeSkippedIds(parsed?.skippedPromptIds);
    const currentIndexRaw = Number(parsed?.currentIndex);
    const currentIndex = Number.isFinite(currentIndexRaw)
      ? prompts.length > 0
        ? Math.max(0, Math.min(prompts.length - 1, Math.floor(currentIndexRaw)))
        : 0
      : 0;

    return {
      updatedAt: String(parsed?.updatedAt || '').trim() || new Date().toISOString(),
      sourcePath: String(parsed?.sourcePath || '/career-profile/upload').trim() || '/career-profile/upload',
      supplementText: String(parsed?.supplementText || ''),
      uploadedResumeTitle: String(parsed?.uploadedResumeTitle || '').trim(),
      uploadedResume:
        parsed?.uploadedResume && typeof parsed.uploadedResume === 'object' && !Array.isArray(parsed.uploadedResume)
          ? (parsed.uploadedResume as Record<string, any>)
          : null,
      prompts,
      answersByPromptId,
      draftByPromptId,
      skippedPromptIds,
      currentIndex,
    };
  } catch {
    return null;
  }
};

export const writeFusionFollowupSession = (
  sessionKey: string,
  session: Omit<FollowupSessionSnapshot, 'updatedAt'>
) => {
  const prompts = (session?.prompts || [])
    .map((item) => sanitizeFollowupPrompt(item))
    .filter(Boolean) as Array<Pick<FollowupPrompt, 'id' | 'category' | 'text'>>;

  const answersByPromptId = sanitizeAnswerMap(session.answersByPromptId);
  const draftByPromptId = sanitizeAnswerMap(session.draftByPromptId);
  const skippedPromptIds = sanitizeSkippedIds(session.skippedPromptIds);
  const currentIndexRaw = Number(session.currentIndex);
  const currentIndex = Number.isFinite(currentIndexRaw)
    ? prompts.length > 0
      ? Math.max(0, Math.min(prompts.length - 1, Math.floor(currentIndexRaw)))
      : 0
    : 0;

  safeWrite(
    sessionKey,
    JSON.stringify({
      updatedAt: new Date().toISOString(),
      sourcePath: String(session.sourcePath || '/career-profile/upload').trim() || '/career-profile/upload',
      supplementText: String(session.supplementText || ''),
      uploadedResumeTitle: String(session.uploadedResumeTitle || '').trim(),
      uploadedResume:
        session.uploadedResume && typeof session.uploadedResume === 'object' && !Array.isArray(session.uploadedResume)
          ? session.uploadedResume
          : null,
      prompts,
      answersByPromptId,
      draftByPromptId,
      skippedPromptIds,
      currentIndex,
    } as FollowupSessionSnapshot)
  );
};

export const clearFusionFollowupSession = (sessionKey: string) => {
  safeRemove(sessionKey);
};
