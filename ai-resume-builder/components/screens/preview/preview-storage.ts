export const PREVIEW_RESUME_ID_KEY = 'preview_resume_id';
export const PREVIEW_BACK_TARGET_KEY = 'preview_back_target';
export const PREVIEW_RESUME_SNAPSHOT_KEY = 'preview_resume_snapshot';

export type PreviewSnapshot = {
  id: string;
  data: any;
};

const safeRead = (key: string) => {
  try {
    return String(localStorage.getItem(key) || '').trim();
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

export const readPreviewResumeId = () => safeRead(PREVIEW_RESUME_ID_KEY);
export const writePreviewResumeId = (id: string) => {
  const normalized = String(id || '').trim();
  if (!normalized) return;
  safeWrite(PREVIEW_RESUME_ID_KEY, normalized);
};

export const readPreviewBackTarget = () => safeRead(PREVIEW_BACK_TARGET_KEY).toLowerCase();
export const writePreviewBackTarget = (target: string) => {
  const normalized = String(target || '').trim().toLowerCase();
  if (!normalized) return;
  safeWrite(PREVIEW_BACK_TARGET_KEY, normalized);
};

export const readPreviewSnapshot = (): PreviewSnapshot | null => {
  try {
    const raw = localStorage.getItem(PREVIEW_RESUME_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const id = String(parsed?.id || '').trim();
    const data = parsed?.data;
    if (!id || !data || typeof data !== 'object') return null;
    return { id, data };
  } catch {
    return null;
  }
};

export const writePreviewSnapshot = (snapshot: PreviewSnapshot) => {
  const normalizedId = String(snapshot?.id || '').trim();
  if (!normalizedId || !snapshot?.data || typeof snapshot.data !== 'object') return;
  try {
    localStorage.setItem(
      PREVIEW_RESUME_SNAPSHOT_KEY,
      JSON.stringify({
        id: normalizedId,
        data: snapshot.data,
      })
    );
  } catch {
    // ignore storage failures
  }
};
