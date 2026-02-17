import React, { useRef, useState, Fragment } from 'react';
import { View, ScreenProps, MembershipTier } from '../../types';
import { useUserProfile } from '../../src/useUserProfile';
import { useAppContext } from '../../src/app-context';
import { ReferralModal } from '../ReferralModal';



const MenuItem: React.FC<{ onClick: () => void, icon: string, label: string, color: string, badge?: string }> = ({ onClick, icon, label, color, badge }) => (
  <button
    onClick={onClick}
    className="w-full flex items-center justify-between py-3.5 px-4 active:bg-slate-100 dark:active:bg-white/5 transition-colors group"
  >
    <div className="flex items-center gap-3">
      <div className={`w-9 h-9 rounded-xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center text-primary`}>
        <span className="material-symbols-outlined text-[20px] font-medium">{icon}</span>
      </div>
      <span className="text-sm font-semibold text-slate-900 dark:text-white">{label}</span>
    </div>
    <div className="flex items-center gap-2">
      {badge && (
        <span className="text-[10px] font-bold bg-primary text-white px-2 py-0.5 rounded-full uppercase tracking-wider shadow-sm shadow-primary/30">
          {badge}
        </span>
      )}
      <span className="material-symbols-outlined text-slate-400 dark:text-slate-600 text-[20px] group-hover:translate-x-0.5 transition-transform group-hover:text-primary">chevron_right</span>
    </div>
  </button>
);

const Profile: React.FC<ScreenProps> = () => {
  const navigateToView = useAppContext((s) => s.navigateToView);
  const currentUser = useAppContext((s) => s.currentUser);
  const isDarkMode = useAppContext((s) => s.isDarkMode);
  const DEFAULT_AVATAR = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='12' fill='%23f1f5f9'/%3E%3Cg transform='translate(4.8, 4.8) scale(0.6)' fill='%2394a3b8'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'%3E%3C/path%3E%3C/g%3E%3C/svg%3E`;
  const [avatar, setAvatar] = React.useState(DEFAULT_AVATAR);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load avatar from localStorage
  React.useEffect(() => {
    const savedAvatar = localStorage.getItem('user_avatar');
    if (savedAvatar) {
      setAvatar(savedAvatar);
    }
  }, []);

  // Get user profile with real name
  const { userProfile, loading, error } = useUserProfile(currentUser?.id, currentUser);
  const displayName =
    userProfile?.name ||
    currentUser?.user_metadata?.name ||
    currentUser?.email?.split('@')[0] ||
    '';
  const displayEmail =
    userProfile?.email ||
    currentUser?.email ||
    '';

  // Format creation date
  const joinedDate = React.useMemo(() => {
    const dateStr = userProfile?.created_at || currentUser?.created_at;
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
  }, [userProfile, currentUser]);

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          const newAvatar = e.target.result as string;
          setAvatar(newAvatar);
          localStorage.setItem('user_avatar', newAvatar);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const [showReferralModal, setShowReferralModal] = useState(false);

  // Mock referral code - in real app, derive from user ID or backend
  const referralCode = React.useMemo(() => {
    return userProfile?.referral_code || (currentUser?.id ? currentUser.id.substring(0, 6).toUpperCase() : 'AI8888');
  }, [currentUser, userProfile?.referral_code]);

  // Mock user subscription data - keeps consistent with Member Center
  const userSub = {
    tier: MembershipTier.FREE,
    expireDate: '2024-12-31',
    diagnosesRemaining: Number(userProfile?.diagnoses_remaining ?? 0),
    interviewsRemaining: Number(userProfile?.interviews_remaining ?? 0),
  };

  return (
    <div className="flex flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))] animate-in fade-in duration-300">
      <ReferralModal
        isOpen={showReferralModal}
        onClose={() => setShowReferralModal(false)}
        referralCode={referralCode}
      />

      <header className="sticky top-0 z-40 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md border-b border-gray-200 dark:border-white/5">
        <div className="flex items-center justify-center h-14 px-4 relative">
          <h1 className="absolute inset-0 flex items-center justify-center text-lg font-bold tracking-tight text-slate-900 dark:text-white pointer-events-none">个人中心</h1>
        </div>
      </header>

      <main className="flex flex-col gap-4 p-4">
        {/* Profile Info Card */}
        <div className="bg-white dark:bg-surface-dark rounded-2xl shadow-md border border-slate-200 dark:border-white/5 relative group overflow-hidden">
          <div className="p-4">
            <div className="flex items-center gap-4 relative z-10">
              <div className="relative shrink-0 cursor-pointer" onClick={handleAvatarClick}>
                <div
                  className="w-16 h-16 rounded-full bg-cover bg-center border-2 border-white dark:border-slate-700 shadow-sm transition-opacity hover:opacity-80"
                  style={{ backgroundImage: `url("${avatar}")` }}
                ></div>
                <div className="absolute bottom-0 right-0 bg-primary text-white p-0.5 rounded-full border border-white dark:border-surface-dark flex items-center justify-center pointer-events-none">
                  <span className="material-symbols-outlined text-[10px]">edit</span>
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/*"
                  onChange={handleFileChange}
                />
              </div>
              <div className="flex flex-col flex-1 min-w-0 pr-2">
                <div className="flex items-center gap-2 mb-1 min-w-0">
                  <h2 className="text-xl font-bold truncate text-slate-900 dark:text-white">
                    {displayName || ' '}
                  </h2>
                  <span className="shrink-0 px-2 py-0.5 rounded-full text-[9px] font-black bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-current opacity-90 uppercase tracking-tight">
                    {userSub.tier === MembershipTier.FREE ? '免费版' : userSub.tier}
                  </span>
                </div>
                {displayEmail && (
                  <p className="text-slate-500 dark:text-slate-400 text-[11px] truncate font-medium">
                    {displayEmail}
                  </p>
                )}
              </div>
            </div>

            {/* Integrated Usage Stats (Synced style) */}
            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-white/5 flex items-center divide-x divide-slate-100 dark:divide-white/5">
              <div className="flex-1 flex flex-col items-center">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-0.5">剩余诊断</span>
                <span className="text-lg font-black text-slate-800 dark:text-slate-200 leading-none">{userSub.diagnosesRemaining}</span>
              </div>
              <div className="flex-1 flex flex-col items-center">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-0.5">剩余面试</span>
                <span className="text-lg font-black text-slate-800 dark:text-slate-200 leading-none">{userSub.interviewsRemaining}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic Upgrade Card */}
        {(() => {
          // Mock user subscription - in real app this comes from context/props
          const userSub = {
            tier: MembershipTier.FREE,
            expireDate: '2024-12-31'
          };

          const getTierStyle = (tier: MembershipTier) => {
            switch (tier) {
              case MembershipTier.STARTER:
                return {
                  bg: 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700',
                  icon: 'rocket_launch',
                  iconColor: 'text-slate-600 dark:text-slate-400',
                  title: '入门版权益已生效',
                  subtitle: '享有基础AI简历诊断与模拟面试权益',
                  titleColor: 'text-slate-900 dark:text-white',
                  subColor: 'text-slate-500 dark:text-slate-400',
                  btnStyle: 'bg-slate-900 text-white dark:bg-white dark:text-slate-900',
                  shadow: 'shadow-sm'
                };
              case MembershipTier.PLUS:
                return {
                  bg: 'bg-gradient-to-br from-blue-600 to-blue-700',
                  icon: 'verified',
                  iconColor: 'text-white',
                  title: 'Plus 会员权益已生效',
                  subtitle: '尊享更多AI诊断次数与极速生成',
                  titleColor: 'text-white',
                  subColor: 'text-blue-100',
                  btnStyle: 'bg-white text-blue-700 shadow-sm',
                  shadow: 'shadow-md shadow-blue-500/20'
                };
              case MembershipTier.PRO:
                return {
                  bg: 'bg-gradient-to-br from-indigo-600 to-indigo-700',
                  icon: 'workspace_premium',
                  iconColor: 'text-white',
                  title: 'Pro 会员权益已生效',
                  subtitle: '解锁PDF导出与海量AI模拟面试',
                  titleColor: 'text-white',
                  subColor: 'text-indigo-100',
                  btnStyle: 'bg-white text-indigo-700 shadow-sm',
                  shadow: 'shadow-md shadow-indigo-500/20'
                };
              case MembershipTier.ULTRA:
                return {
                  bg: 'bg-slate-900',
                  icon: 'diamond',
                  iconColor: 'text-amber-400',
                  title: 'Ultra 尊享版权益已生效',
                  subtitle: '全能旗舰体验，无限可能',
                  titleColor: 'text-white',
                  subColor: 'text-slate-400',
                  btnStyle: 'bg-amber-500 text-slate-900 font-bold',
                  shadow: 'shadow-xl shadow-black/20'
                };
              default: // FREE
                return {
                  bg: isDarkMode
                    ? 'bg-slate-800 border border-slate-700'
                    : 'bg-white border border-slate-200',
                  icon: 'rocket_launch',
                  iconColor: 'text-primary',
                  title: '当前版本：免费版',
                  subtitle: '升级以解锁更多AI简历优化次数及模拟面试',
                  titleColor: 'text-slate-900 dark:text-white',
                  subColor: 'text-slate-500 dark:text-slate-400',
                  btnStyle: 'bg-primary text-white shadow-primary/20 shadow-lg',
                  shadow: 'shadow-sm'
                };
            }
          };

          const style = getTierStyle(userSub.tier);

          // For paid tiers, we might want a different layout or just consistent styling
          return (
            <div className={`relative overflow-hidden rounded-xl p-5 transition-all duration-500 group ${style.bg} ${style.shadow}`}>
              {/* Subtle Texture for Premium Tiers */}
              {userSub.tier !== MembershipTier.FREE && userSub.tier !== MembershipTier.STARTER && (
                <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] mix-blend-overlay"></div>
              )}

              <div className="relative z-10 flex items-center justify-between gap-4">
                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`material-symbols-outlined text-[20px] ${style.iconColor}`}>{style.icon}</span>
                    <h3 className={`${style.titleColor} text-[15px] font-bold tracking-tight whitespace-nowrap overflow-hidden text-ellipsis`}>
                      {style.title}
                    </h3>
                  </div>
                  <p className={`text-[12px] font-medium line-clamp-2 ${style.subColor}`}>
                    {style.subtitle}
                  </p>
                </div>
                <button
                  onClick={() => navigateToView(View.MEMBER_CENTER)}
                  className={`shrink-0 px-4 py-2 rounded-lg text-xs font-bold transition-all active:scale-95 whitespace-nowrap ${style.btnStyle}`}
                >
                  {userSub.tier === MembershipTier.FREE ? '立即升级' : '查看权益'}
                </button>
              </div>
            </div>
          );
        })()}


        {/* Menu Items - Unified Colors */}
        <div className="bg-white dark:bg-surface-dark rounded-2xl overflow-hidden shadow-md border border-slate-200 dark:border-white/5 divide-y divide-slate-100 dark:divide-white/5">
          <MenuItem
            onClick={() => navigateToView(View.ALL_RESUMES)}
            icon="description"
            label="我的简历"
            color="primary"
          />
          <MenuItem
            onClick={() => navigateToView(View.HISTORY)}
            icon="history"
            label="导出历史"
            color="primary"
          />

          <MenuItem
            onClick={() => navigateToView(View.ACCOUNT_SECURITY)}
            icon="verified_user"
            label="账号与安全"
            color="primary"
          />
          <MenuItem
            onClick={() => navigateToView(View.SETTINGS)}
            icon="settings"
            label="设置"
            color="primary"
          />
          <MenuItem
            onClick={() => setShowReferralModal(true)}
            icon="share"
            label="邀请好友"
            color="primary"
            badge="得次数"
          />
          <MenuItem
            onClick={() => navigateToView(View.HELP)}
            icon="help_center"
            label="帮助与反馈"
            color="primary"
          />
        </div>

        <div className="flex flex-col items-center gap-2 mt-4 pb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigateToView(View.TERMS_OF_SERVICE)}
              className="text-xs text-slate-400 dark:text-slate-500 hover:text-primary transition-colors font-medium"
            >
              服务条款
            </button>
            <div className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700"></div>
            <button
              onClick={() => navigateToView(View.PRIVACY_POLICY)}
              className="text-xs text-slate-400 dark:text-slate-500 hover:text-primary transition-colors font-medium"
            >
              隐私政策
            </button>
          </div>
          <p className="text-xs text-slate-300 dark:text-slate-700">版本 1.2.0 (Build 303)</p>
        </div>
      </main>
    </div>
  );
};

export default Profile;
