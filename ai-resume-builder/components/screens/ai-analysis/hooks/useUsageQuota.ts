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
  | 'final_report'
  | 'interview'
  | 'interview_simple'
  | 'interview_comprehensive';

export const useUsageQuota = ({ currentUserId, navigateToView, showToast }: Params) => {
  const normalizeScenario = (raw?: string) => {
    const s = String(raw || '').trim().toLowerCase();
    if (s === 'technical') return 'technical';
    if (s === 'hr') return 'hr';
    return 'general';
  };
  const normalizeMode = (raw?: string) => {
    const m = String(raw || '').trim().toLowerCase();
    if (m === 'simple') return 'simple';
    if (m === 'comprehensive') return 'comprehensive';
    return '';
  };
  const getScenarioLabel = (scenario?: string) => {
    const s = normalizeScenario(scenario);
    if (s === 'technical') return '复试';
    if (s === 'hr') return 'HR面';
    return '初试';
  };
  const getModeLabel = (mode?: string) => {
    const m = normalizeMode(mode);
    if (m === 'simple') return '简单';
    if (m === 'comprehensive') return '全面';
    return '';
  };
  const buildLedgerContext = (kind: QuotaKind, context?: { scenario?: string; mode?: string }) => {
    const scenario = normalizeScenario(context?.scenario);
    const mode = normalizeMode(context?.mode);
    const isInterview = kind !== 'analysis' && kind !== 'final_report';
    const parts: string[] = [];
    if (isInterview) {
      parts.push(`${getScenarioLabel(scenario)}`);
      if (mode) parts.push(`${getModeLabel(mode)}`);
    }
    return {
      noteSuffix: parts.join(' '),
      metadata: isInterview
        ? {
          kind,
          scenario,
          mode: mode || null,
        }
        : {
          kind,
        }
    };
  };

  const resolveNeededPoints = (kind: QuotaKind) => {
    if (kind === 'analysis') return USAGE_POINT_COST.analysis;
    if (kind === 'final_report') return USAGE_POINT_COST.final_report;
    if (kind === 'interview_simple') return USAGE_POINT_COST.interview_simple;
    if (kind === 'interview_comprehensive') return USAGE_POINT_COST.interview_comprehensive;
    return USAGE_POINT_COST.interview;
  };
  const isInterviewKind = (kind: QuotaKind) =>
    kind !== 'analysis' && kind !== 'final_report';
  const getKindLabel = (kind: QuotaKind) => {
    if (kind === 'analysis') return '简历优化分析';
    if (kind === 'final_report') return '最终报告';
    return '面试';
  };
  const consumeUsageQuota = React.useCallback(async (
    kind: QuotaKind,
    context?: { scenario?: string; mode?: string }
  ) => {
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
          const ledgerContext = buildLedgerContext(kind, context);
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
              note: isInterviewKind(kind) ? ledgerContext.noteSuffix : getKindLabel(kind),
              balanceAfter: afterConsume,
              metadata: ledgerContext.metadata,
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

    const ledgerContext = buildLedgerContext(kind, context);
    const note = isInterviewKind(kind) ? ledgerContext.noteSuffix : getKindLabel(kind);

    await DatabaseService.createPointsLedger({
      userId,
      delta: -neededPoints,
      action: !isInterviewKind(kind) ? 'analysis_consume' : 'interview_consume',
      sourceType: !isInterviewKind(kind) ? 'analysis' : 'interview',
      note: note,
      balanceAfter: nextPoints,
      metadata: ledgerContext.metadata,
    });

    return true;
  }, [buildLedgerContext, currentUserId, navigateToView, showToast]);

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
