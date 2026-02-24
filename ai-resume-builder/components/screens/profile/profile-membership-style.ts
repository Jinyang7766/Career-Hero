import { MembershipTier } from '../../../types';

export const normalizeMembershipTier = (raw: any): MembershipTier => {
  const tier = String(raw || '').trim().toUpperCase();
  if (tier === MembershipTier.STARTER) return MembershipTier.STARTER;
  if (tier === MembershipTier.PLUS) return MembershipTier.PLUS;
  if (tier === MembershipTier.PRO) return MembershipTier.PRO;
  if (tier === MembershipTier.ULTRA) return MembershipTier.ULTRA;
  return MembershipTier.FREE;
};

export const getMembershipTierStyle = (tier: MembershipTier, isDarkMode: boolean) => {
  switch (tier) {
    case MembershipTier.STARTER:
      return {
        bg: 'bg-gradient-to-br from-slate-500 to-slate-600',
        icon: 'rocket_launch',
        iconColor: 'text-white',
        title: '入门版权益已生效',
        subtitle: '享有基础AI简历诊断与模拟面试权益',
        titleColor: 'text-white',
        subColor: 'text-slate-100',
        btnStyle: 'bg-white/20 border border-white/30 text-white backdrop-blur-md',
        shadow: 'shadow-lg shadow-slate-500/20',
      };
    case MembershipTier.PLUS:
      return {
        bg: 'bg-gradient-to-br from-blue-600 to-blue-700',
        icon: 'verified',
        iconColor: 'text-white',
        title: 'Plus 权益已生效',
        subtitle: '尊享更高积分额度与优先分析能力',
        titleColor: 'text-white',
        subColor: 'text-blue-100',
        btnStyle: 'bg-white/20 border border-white/30 text-white backdrop-blur-md',
        shadow: 'shadow-lg shadow-blue-500/20',
      };
    case MembershipTier.PRO:
      return {
        bg: 'bg-gradient-to-br from-indigo-600 to-indigo-700',
        icon: 'workspace_premium',
        iconColor: 'text-white',
        title: 'Pro 权益已生效',
        subtitle: '解锁PDF导出与海量AI模拟面试',
        titleColor: 'text-white',
        subColor: 'text-indigo-100',
        btnStyle: 'bg-white/20 border border-white/30 text-white backdrop-blur-md',
        shadow: 'shadow-lg shadow-indigo-500/20',
      };
    case MembershipTier.ULTRA:
      return {
        bg: 'bg-gradient-to-br from-slate-800 to-slate-900',
        icon: 'diamond',
        iconColor: 'text-amber-400',
        title: 'Ultra 尊享版权益已生效',
        subtitle: '全能旗舰体验，无限职业可能',
        titleColor: 'text-white',
        subColor: 'text-white/60',
        btnStyle: 'bg-amber-500 text-slate-900 font-bold',
        shadow: 'shadow-xl shadow-black/30',
      };
    default:
      return {
        bg: isDarkMode
          ? 'bg-surface-dark border border-white/5'
          : 'bg-white border border-slate-200',
        icon: 'auto_awesome',
        iconColor: 'text-primary',
        title: '升级解锁 AI 创作力',
        subtitle: '获取更多积分，开启智能面试与诊断',
        titleColor: 'text-slate-900 dark:text-white',
        subColor: 'text-slate-500 dark:text-slate-400',
        btnStyle: 'bg-primary text-white shadow-lg shadow-primary/20',
        shadow: 'shadow-md',
      };
  }
};
