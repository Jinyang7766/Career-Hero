export const getRagEnabledFlag = () => {
  try {
    const raw = (localStorage.getItem('rag_enabled_test') || '').trim().toLowerCase();
    if (!raw) return true;
    if (raw === '0' || raw === 'false' || raw === 'off' || raw === 'no') return false;
    if (raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes') return true;
    return true;
  } catch {
    return true;
  }
};
