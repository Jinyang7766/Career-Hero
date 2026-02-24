export const pickLatestByUpdatedAt = <T extends { updatedAt?: string }>(
  items: T[]
): T | null => {
  if (!Array.isArray(items) || items.length === 0) return null;
  return items.reduce((acc: T | null, curr: T) => {
    if (!acc) return curr;
    const accAt = Date.parse(String(acc?.updatedAt || ''));
    const currAt = Date.parse(String(curr?.updatedAt || ''));
    if (!Number.isFinite(accAt)) return curr;
    if (!Number.isFinite(currAt)) return acc;
    return currAt > accAt ? curr : acc;
  }, null as T | null);
};
