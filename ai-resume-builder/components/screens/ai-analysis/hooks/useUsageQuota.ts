import React from 'react';
import { View } from '../../../../types';
import { DatabaseService } from '../../../../src/database-service';
import { MembershipTier } from '../../../../types';
import { PLAN_MONTHLY_POINTS, USAGE_POINT_COST } from '../../../../src/points-config';

type Params = {
  currentUserId?: string;
  navigateToView: (view: View, opts?: { replace?: boolean; root?: boolean }) => void;
  showToast: (msg: string, type?: 'info' | 'success' | 'error', durationMs?: number) => void;
};

export type QuotaKind =
  | 'analysis'
  | 'micro_interview'
  | 'final_report'
  | 'interview'
  | 'interview_simple'
  | 'interview_comprehensive';

export const useUsageQuota = ({ currentUserId, navigateToView, showToast }: Params) => {
  const resolveNeededPoints = (kind: QuotaKind) => {
    if (kind === 'analysis') return USAGE_POINT_COST.analysis;
    if (kind === 'micro_interview') return USAGE_POINT_COST.micro_interview;
    if (kind === 'final_report') return USAGE_POINT_COST.final_report;
    if (kind === 'interview_simple') return USAGE_POINT_COST.interview_simple;
    if (kind === 'interview_comprehensive') return USAGE_POINT_COST.interview_comprehensive;
    return USAGE_POINT_COST.interview;
  };
  const isInterviewKind = (kind: QuotaKind) =>
    kind !== 'analysis' && kind !== 'final_report';
  const getKindLabel = (kind: QuotaKind) => {
    if (kind === 'analysis') return '诊断';
    if (kind === 'micro_interview') return '微访谈';
    if (kind === 'final_report') return '最终报告';
    return '面试';
  };
  const consumeUsageQuota = React.useCallback(async (kind: QuotaKind) => {
    const userId = String(currentUserId || '').trim();
    if (!userId) return true;

    const readResult = await DatabaseService.getUser(userId);
    if (!readResult.success || !readResult.data) {
      showToast('读取积分失败，请稍后重试', 'error');
      return false;
    }

    const row = (readResult.data as any) || {};
    const tier = String(row?.membership_tier || 'FREE').toUpperCase();
    const isFirstTime = tier === MembershipTier.FREE;
    const neededPoints = resolveNeededPoints(kind);
    const migratedFromLegacy = Number(row?.diagnoses_remaining ?? 0) * USAGE_POINT_COST.analysis
      + Number(row?.interviews_remaining ?? 0) * USAGE_POINT_COST.interview;
    const currentPoints = Number(row?.points_balance ?? migratedFromLegacy ?? 0);

    if (!Number.isFinite(currentPoints) || currentPoints < neededPoints) {
      const confirmMessage = isFirstTime
        ? `您的积分不足。是否立即开通 Starter（月赠 ${PLAN_MONTHLY_POINTS.STARTER} 积分）并继续？`
        : `您的积分不足，当前${getKindLabel(kind)}需 ${neededPoints} 积分。升级会员或购买积分包后可继续。`;

      let confirmed = false;
      try {
        const confirmAsync = (window as any).__careerHeroConfirm;
        if (typeof confirmAsync === 'function') {
          confirmed = await confirmAsync(confirmMessage);
        } else {
          confirmed = window.confirm(confirmMessage);
        }
      } catch {
        confirmed = false;
      }

      if (confirmed) {
        if (isFirstTime) {
          const starterPoints = PLAN_MONTHLY_POINTS.STARTER;
          const afterConsume = Math.max(0, starterPoints - neededPoints);
          const giftResult = await DatabaseService.updateUser(userId, {
            membership_tier: MembershipTier.STARTER,
            points_balance: afterConsume
          });
          if (giftResult.success) {
            await DatabaseService.createPointsLedger({
              userId,
              delta: -neededPoints,
              action: !isInterviewKind(kind) ? 'analysis_consume' : 'interview_consume',
              sourceType: !isInterviewKind(kind) ? 'analysis' : 'interview',
              note: `Starter 激活后扣减${getKindLabel(kind)}积分`,
              balanceAfter: afterConsume,
            });
            showToast(`Starter 已激活，已扣除 ${neededPoints} 积分`, 'success');
            return true;
          }
        }
        navigateToView(View.MEMBER_CENTER, { replace: true });
      }
      return false;
    }

    const nextPoints = Math.max(0, currentPoints - neededPoints);
    const updateResult = await DatabaseService.updateUser(userId, {
      points_balance: nextPoints
    });
    if (!updateResult.success) {
      showToast('扣减积分失败，请稍后重试', 'error');
      return false;
    }
    await DatabaseService.createPointsLedger({
      userId,
      delta: -neededPoints,
      action: !isInterviewKind(kind) ? 'analysis_consume' : 'interview_consume',
      sourceType: !isInterviewKind(kind) ? 'analysis' : 'interview',
      note: `AI ${getKindLabel(kind)}扣减`,
      balanceAfter: nextPoints,
    });

    return true;
  }, [currentUserId, navigateToView, showToast]);

  const refundUsageQuota = React.useCallback(async (
    kind: QuotaKind,
    note?: string
  ) => {
    const userId = String(currentUserId || '').trim();
    if (!userId) return false;

    const readResult = await DatabaseService.getUser(userId);
    if (!readResult.success || !readResult.data) {
      return false;
    }

    const row = (readResult.data as any) || {};
    const refundPoints = resolveNeededPoints(kind);
    const currentPoints = Number(row?.points_balance ?? 0);
    const nextPoints = Math.max(0, currentPoints + refundPoints);

    const updateResult = await DatabaseService.updateUser(userId, {
      points_balance: nextPoints
    });
    if (!updateResult.success) {
      return false;
    }

    await DatabaseService.createPointsLedger({
      userId,
      delta: refundPoints,
      action: !isInterviewKind(kind) ? 'analysis_refund' : 'interview_refund',
      sourceType: !isInterviewKind(kind) ? 'analysis' : 'interview',
      note: note || `AI ${getKindLabel(kind)}失败返还积分`,
      balanceAfter: nextPoints,
    });

    return true;
  }, [currentUserId]);

  return { consumeUsageQuota, refundUsageQuota };
};
