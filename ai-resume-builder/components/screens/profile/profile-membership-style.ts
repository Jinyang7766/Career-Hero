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

export const getMembershipTagStyle = (tier: MembershipTier) => {
  switch (tier) {
    case MembershipTier.STARTER:
      return {
        label: 'Starter 体验',
        icon: 'rocket_launch',
        className: 'bg-slate-100/80 text-slate-600 border-slate-200/50 dark:bg-slate-800/80 dark:text-slate-400 dark:border-slate-700/50',
      };
    case MembershipTier.PLUS:
      return {
        label: 'Plus 会员',
        icon: 'verified',
        className: 'bg-blue-50/80 text-blue-600 border-blue-100/50 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800/50 shadow-sm shadow-blue-500/5',
      };
    case MembershipTier.PRO:
      return {
        label: 'Pro 专家',
        icon: 'workspace_premium',
        className: 'bg-indigo-50/80 text-indigo-600 border-indigo-100/50 dark:bg-indigo-900/40 dark:text-indigo-300 dark:border-indigo-800/50 shadow-sm shadow-indigo-500/5',
      };
    case MembershipTier.ULTRA:
      return {
        label: 'Ultra 旗舰',
        icon: 'diamond',
        className: 'bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-amber-400 border-amber-500/40 shadow-md shadow-amber-900/30',
      };
    default:
      return {
        label: '免费版',
        icon: 'person',
        className: 'bg-slate-50/80 text-slate-500 border-slate-200 dark:bg-slate-800/30 dark:text-slate-500 dark:border-slate-700/50',
      };
  }
};
