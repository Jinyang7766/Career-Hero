import { MembershipTier } from '../types';

export const PLAN_MONTHLY_POINTS: Record<MembershipTier, number> = {
  [MembershipTier.FREE]: 0,
  [MembershipTier.STARTER]: 220,
  [MembershipTier.PLUS]: 800,
  [MembershipTier.PRO]: 1500,
  [MembershipTier.ULTRA]: 3000,
};

export const ADDON_POINT_PACKAGES = [
  { priceLabel: '¥9.9', points: 100 },
  { priceLabel: '¥29.9', points: 500 },
  { priceLabel: '¥49.9', points: 1000 },
] as const;

export const USAGE_POINT_COST = {
  analysis: 10,
  interview: 20,
} as const;

export const REFERRAL_BONUS_POINTS = {
  inviter: 100,
  invited: 100,
} as const;

export const resolveMonthlyPointsByTier = (tierRaw: string | null | undefined) => {
  const tier = String(tierRaw || MembershipTier.FREE).toUpperCase() as MembershipTier;
  return PLAN_MONTHLY_POINTS[tier] ?? 0;
};
