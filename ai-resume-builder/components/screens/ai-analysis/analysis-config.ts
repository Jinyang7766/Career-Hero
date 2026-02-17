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

export const getTargetCompanyAutofillMinConfidence = () => {
  try {
    const local = (localStorage.getItem('target_company_autofill_min_confidence') || '').trim();
    const env = String((import.meta as any)?.env?.VITE_TARGET_COMPANY_AUTOFILL_MIN_CONFIDENCE || '').trim();
    const raw = local || env || '0.7';
    const value = Number(raw);
    if (Number.isNaN(value)) return 0.7;
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
  } catch {
    return 0.7;
  }
};
