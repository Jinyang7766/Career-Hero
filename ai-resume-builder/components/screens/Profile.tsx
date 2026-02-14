import React, { useState, useRef } from 'react';
import { View, ScreenProps } from '../../types';
import { useUserProfile } from '../../src/useUserProfile';

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
            <div className="flex flex-col">
              <h3 className="text-white text-[15px] font-bold tracking-tight">
                当前版本：免费版
              </h3>
              <p className="text-blue-200/60 text-[11px] mt-1 font-medium">
                升级以解锁更多AI简历优化次数及模拟面试
              </p>
            </div>
            <button
              onClick={() => setCurrentView(View.MEMBER_CENTER)}
              className="px-5 py-2 bg-gradient-to-r from-blue-500 via-blue-600 to-indigo-700 text-white rounded-xl text-sm font-black shadow-lg shadow-blue-600/40 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              立即升级
            </button>
          </div>
        </div>

        {/* Resume Statistics Card */}
        <div className="bg-white dark:bg-surface-dark rounded-2xl shadow-sm border border-gray-100 dark:border-white/5 p-4">
          <div className="grid grid-cols-2 gap-3">
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
