const parseBoolEnv = (value: unknown): boolean => {
  const raw = String(value ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
};

export const isGuidedFlowEnabled = (): boolean =>
  parseBoolEnv((import.meta as any)?.env?.VITE_GUIDED_FLOW_ENABLED ?? '0');

