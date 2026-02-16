import React, { useState, useRef } from 'react';
import { View, ScreenProps } from '../../types';
import { useUserProfile } from '../../src/useUserProfile';
import { useAppContext } from '../../src/app-context';

const MenuItem: React.FC<{ onClick: () => void, icon: string, label: string, color: string, badge?: string }> = ({ onClick, icon, label, color, badge }) => (
  <button
    onClick={onClick}
    className="w-full flex items-center justify-between py-3.5 px-4 active:bg-gray-50 dark:active:bg-white/5 transition-colors group"
  >
    <div className="flex items-center gap-3">
      <div className={`w-9 h-9 rounded-xl bg-primary/5 dark:bg-primary/10 flex items-center justify-center text-primary`}>
        <span className="material-symbols-outlined text-[20px]">{icon}</span>
      </div>
      <span className="text-sm font-medium text-slate-900 dark:text-white">{label}</span>
    </div>
    <div className="flex items-center gap-2">
      {badge && (
        <span className="text-[10px] font-bold bg-primary text-white px-2 py-0.5 rounded-full uppercase tracking-wider shadow-sm shadow-primary/20">
          {badge}
        </span>
      )}
      <span className="material-symbols-outlined text-slate-300 dark:text-slate-600 text-[20px] group-hover:translate-x-0.5 transition-transform">chevron_right</span>
    </div>
  </button>
);

const Profile: React.FC<ScreenProps> = () => {
  const { navigateToView, completeness, currentUser, allResumes } = useAppContext();
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
  const { userProfile, loading, error } = useUserProfile();
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

  return (
    <div className="flex flex-col pb-24 animate-in fade-in duration-300">
      <header className="sticky top-0 z-40 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md border-b border-gray-200 dark:border-white/5">
        <div className="flex items-center justify-center h-14 px-4 relative">
          <h1 className="absolute inset-0 flex items-center justify-center text-lg font-bold tracking-tight text-slate-900 dark:text-white pointer-events-none">个人中心</h1>
        </div>
      </header>

      <main className="flex flex-col gap-4 p-4">
        {/* Profile Info Card */}
        <div className="bg-white dark:bg-surface-dark rounded-2xl shadow-sm border border-gray-100 dark:border-white/5 relative group overflow-hidden">
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
                <div className="flex items-center gap-2 mb-0.5">
                  <h2 className="text-lg font-bold truncate text-slate-900 dark:text-white">
                    {displayName || ' '}
                  </h2>
                </div>
                {displayEmail && (
                  <p className="text-slate-500 dark:text-slate-400 text-[11px] truncate">
                    {displayEmail}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Pro Upgrade Glassmorphism Card */}
        <div className="relative overflow-hidden rounded-2xl bg-slate-900 dark:bg-slate-900/80 backdrop-blur-xl border border-blue-500/20 p-4 shadow-xl shadow-blue-900/20 group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-blue-500/20 transition-all duration-700"></div>
          <div className="relative z-10 flex items-center justify-between gap-4">
            <div className="flex flex-col min-w-0 flex-1">
              <h3 className="text-white text-[15px] font-bold tracking-tight whitespace-nowrap overflow-hidden text-ellipsis">
                当前版本：免费版
              </h3>
              <p className="text-blue-200/60 text-[11px] mt-1 font-medium line-clamp-2">
                升级以解锁更多AI简历优化次数及模拟面试
              </p>
            </div>
            <button
              onClick={() => navigateToView(View.MEMBER_CENTER)}
              className="shrink-0 px-5 py-2 bg-gradient-to-r from-blue-500 via-blue-600 to-indigo-700 text-white rounded-xl text-sm font-black shadow-lg shadow-blue-600/40 hover:scale-[1.02] active:scale-[0.98] transition-all whitespace-nowrap"
            >
              立即升级
            </button>
          </div>
        </div>


        {/* Menu Items - Unified Colors */}
        <div className="bg-white dark:bg-surface-dark rounded-2xl overflow-hidden shadow-sm border border-gray-100 dark:border-white/5 divide-y divide-gray-100 dark:divide-white/5">
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
            onClick={() => { }}
            icon="share"
            label="邀请好友"
            color="primary"
            badge="得会员"
          />
          <MenuItem
            onClick={() => navigateToView(View.HELP)}
            icon="help_center"
            label="帮助与反馈"
            color="primary"
          />
        </div>

        <div className="flex justify-center mt-2">
          <p className="text-xs text-gray-400 dark:text-gray-600">版本 1.2.0 (Build 303)</p>
        </div>
      </main>
    </div>
  );
};

export default Profile;
