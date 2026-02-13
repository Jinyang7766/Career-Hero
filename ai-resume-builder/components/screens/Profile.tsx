import React, { useState, useRef } from 'react';
import { View, ScreenProps } from '../../types';
import { useUserProfile } from '../../src/useUserProfile';

const MenuItem: React.FC<{ onClick: () => void, icon: string, label: string, color: string, badge?: string }> = ({ onClick, icon, label, color, badge }) => (
  <button
    onClick={onClick}
    className="w-full flex items-center justify-between py-3 px-4 active:bg-gray-50 dark:active:bg-white/5 transition-colors group"
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

const Profile: React.FC<ScreenProps> = ({ setCurrentView, completeness = 0, currentUser, allResumes }) => {
  const [avatar, setAvatar] = useState('https://lh3.googleusercontent.com/aida-public/AB6AXuC8s4f5uzu0hh4pwqKSmSjqt1tMtDC7n86Mb_kOQe3JucH36AycxncXdZMw9jJo7dQ-PFScoQFPuYgyT_qD07UXSgKmtVmdQVOdO-3sGpsztdokYd994UDKhEaykjYLL0WA5Okx_2Ju5iRxWi4dBZQqSSUOc8uqeZpCYOOg30xh1_QW5-Aarlcq_ExUfD8HROn0Jl2UtS443smhWUTXEeZwUSJ_Y9plJ4iDcmWl4UWee3n6u4ojl5SG_Amz2_hnMxziRnIgDNWh8xsa');
  const fileInputRef = useRef<HTMLInputElement>(null);

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
          setAvatar(e.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="flex flex-col pb-24 animate-in fade-in duration-300">
      <header className="sticky top-0 z-40 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md border-b border-gray-200 dark:border-white/5">
        <div className="flex items-center justify-center h-14 px-4 relative">
          <h1 className="text-lg font-bold tracking-tight">个人中心</h1>
        </div>
      </header>

      <main className="flex flex-col gap-4 p-4">
        {/* Profile Card */}
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
              <div className="flex flex-col flex-1 min-w-0 pr-24">
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

            <div className="mt-4 grid grid-cols-2 gap-3 relative z-10">
              <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 flex flex-col items-center justify-center border border-slate-100 dark:border-transparent">
                <span className="text-xl font-bold text-slate-900 dark:text-white">{allResumes?.length ?? 0}</span>
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-0.5 uppercase tracking-wider">简历总数</span>
              </div>
              <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 flex flex-col items-center justify-center border border-slate-100 dark:border-transparent">
                <span className="text-xl font-bold text-primary">
                  {allResumes?.filter((r: any) => r.optimizationStatus === 'optimized').length || 0}
                </span>
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-0.5 uppercase tracking-wider">已优化</span>
              </div>
            </div>
          </div>

          {/* Member Center - Seamless Embedded Corner Card */}
          <div
            onClick={() => setCurrentView(View.MEMBER_CENTER)}
            className="absolute top-0 right-0 h-[72px] w-[120px] bg-gradient-to-br from-primary via-blue-600 to-indigo-700 rounded-bl-[28px] flex flex-col items-center justify-center cursor-pointer active:opacity-90 transition-all z-20"
          >
            <div className="flex items-center gap-0.5">
              <span className="text-[13px] font-black text-white tracking-widest leading-none">会员中心</span>
              <span className="material-symbols-outlined text-white/50 text-[12px]">chevron_right</span>
            </div>
            <span className="text-[9px] font-medium text-white/70 mt-1.5 tracking-[0.1em]">解锁特权</span>
          </div>
        </div>

        {/* Upgrade Banner - Unified Style with Dashboard */}
        <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-blue-600 to-indigo-700 p-4 shadow-xl shadow-primary/30 text-white cursor-pointer active:scale-[0.98] transition-all">
          <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-white/10 blur-3xl animate-pulse"></div>
          <div className="absolute -left-12 -bottom-12 h-48 w-48 rounded-full bg-white/10 blur-3xl"></div>
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-md border border-white/20 shadow-inner">
                <span className="material-symbols-outlined text-white" style={{ fontSize: '24px' }}>diamond</span>
              </div>
              <div>
                <h3 className="text-base font-black tracking-tight">升级到 Pro</h3>
                <p className="text-xs text-blue-100 mt-0.5 font-medium opacity-90">解锁无限 AI 优化与模板</p>
              </div>
            </div>
            <button className="px-4 py-2 bg-white text-primary rounded-xl text-xs font-black shadow-lg hover:bg-blue-50 transition-all hover:scale-105">
              立即开启
            </button>
          </div>
        </div>

        {/* Menu Items - Unified Colors */}
        <div className="bg-white dark:bg-surface-dark rounded-2xl overflow-hidden shadow-sm border border-gray-100 dark:border-white/5 divide-y divide-gray-100 dark:divide-white/5">
          <MenuItem
            onClick={() => setCurrentView(View.HISTORY)}
            icon="history"
            label="导出历史"
            color="primary"
          />

          <MenuItem
            onClick={() => setCurrentView(View.ACCOUNT_SECURITY)}
            icon="verified_user"
            label="账号与安全"
            color="primary"
          />
          <MenuItem
            onClick={() => setCurrentView(View.SETTINGS)}
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
            onClick={() => setCurrentView(View.HELP)}
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
