import React from 'react';
import { View } from '../../../../types';
import { DatabaseService } from '../../../../src/database-service';

type Params = {
  currentUserId?: string;
  navigateToView: (view: View, opts?: { replace?: boolean; root?: boolean }) => void;
  showToast: (msg: string, type?: 'info' | 'success' | 'error', durationMs?: number) => void;
};

export const useUsageQuota = ({ currentUserId, navigateToView, showToast }: Params) => {
  const consumeUsageQuota = React.useCallback(async (kind: 'analysis' | 'interview') => {
    const userId = String(currentUserId || '').trim();
    if (!userId) return true;

    const readResult = await DatabaseService.getUser(userId);
    if (!readResult.success || !readResult.data) {
      showToast('读取次数失败，请稍后重试', 'error');
      return false;
    }

    const tier = String((readResult.data as any)?.membership_tier || 'FREE').toUpperCase();
    const isFirstTime = tier === 'FREE';
    const field = kind === 'analysis' ? 'diagnoses_remaining' : 'interviews_remaining';
    const remaining = Number((readResult.data as any)?.[field] ?? 0);

    if (!Number.isFinite(remaining) || remaining <= 0) {
      const confirmMessage = isFirstTime
        ? '您的免费次数已用完。既然体验不错，不如开启『Starter 免费试用礼包』？内含 10 次诊断和 3 场面试，首月 0 元，立即领取并继续？'
        : (kind === 'analysis'
          ? '您的简历诊断次数已用尽。升级会员即可解锁更多深度分析、针对性优化建议及高通过率模板，助您斩获心仪 Offer！'
          : '您的模拟面试次数已用尽。升级会员即可重新开启沉浸式 AI 对话练习，更有全方位面试报告助您查漏补缺！');

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
          const newDiagnoses = kind === 'analysis' ? 9 : 10;
          const newInterviews = kind === 'interview' ? 2 : 3;
          const giftResult = await DatabaseService.updateUser(userId, {
            membership_tier: 'STARTER',
            diagnoses_remaining: newDiagnoses,
            interviews_remaining: newInterviews
          });
          if (giftResult.success) {
            showToast('Starter 免费试用礼包已激活，立即为您继续！', 'success');
            return true;
          }
        }
        navigateToView(View.MEMBER_CENTER, { replace: true });
      }
      return false;
    }

    const updateResult = await DatabaseService.updateUser(userId, { [field]: Math.max(0, remaining - 1) });
    if (!updateResult.success) {
      showToast('扣减次数失败，请稍后重试', 'error');
      return false;
    }

    return true;
  }, [currentUserId, navigateToView, showToast]);

  return { consumeUsageQuota };
};

