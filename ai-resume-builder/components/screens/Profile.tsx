import React, { useState, useRef } from 'react';
import { View, ScreenProps } from '../../types';
import { useUserProfile } from '../../src/useUserProfile';

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

      <main className="flex flex-col gap-6 p-4">
        {/* Profile Card */}
        <div className="bg-white dark:bg-surface-dark rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-white/5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
          <div className="flex items-center gap-4 relative z-10">
            <div className="relative shrink-0 cursor-pointer" onClick={handleAvatarClick}>
              <div 
                className="w-20 h-20 rounded-full bg-cover bg-center border-2 border-white dark:border-[#233648] shadow-sm transition-opacity hover:opacity-80"
                style={{ backgroundImage: `url("${avatar}")` }}
              ></div>
              <div className="absolute bottom-0 right-0 bg-[#233648] text-white p-1 rounded-full border border-surface-dark flex items-center justify-center pointer-events-none">
                <span className="material-symbols-outlined text-[14px]">edit</span>
              </div>
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*" 
                onChange={handleFileChange} 
              />
            </div>
            <div className="flex flex-col flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-xl font-bold truncate">
                {displayName || ' '}
              </h2>
              </div>
              {displayEmail && (
                <p className="text-gray-500 dark:text-gray-400 text-sm truncate">
                  {displayEmail}
                </p>
              )}
              <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
                <div className="flex items-center gap-1">
                  <span className="font-semibold text-white">{allResumes?.length ?? 0}</span> 份简历
                </div>
                <div className="w-1 h-1 rounded-full bg-gray-600"></div>
                <div className="flex items-center gap-1">
                  <span className="font-semibold text-white">{completeness}%</span> 完善度
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Menu Group 1 */}
        <div className="bg-white dark:bg-surface-dark rounded-2xl overflow-hidden shadow-sm border border-gray-100 dark:border-white/5">
          <button 
            onClick={() => setCurrentView(View.ALL_RESUMES)}
            className="w-full flex items-center justify-between p-4 active:bg-gray-50 dark:active:bg-[#233648] transition-colors group"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400">
                <span className="material-symbols-outlined">description</span>
              </div>
              <span className="text-base font-medium">全部简历</span>
            </div>
            <div className="text-gray-400">
              <span className="material-symbols-outlined group-hover:translate-x-0.5 transition-transform">chevron_right</span>
            </div>
          </button>
          <div className="h-px bg-gray-100 dark:bg-white/5 mx-16"></div>
          <button 
            onClick={() => setCurrentView(View.HISTORY)}
            className="w-full flex items-center justify-between p-4 active:bg-gray-50 dark:active:bg-[#233648] transition-colors group"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-500/10 flex items-center justify-center text-orange-600 dark:text-orange-400">
                <span className="material-symbols-outlined">history</span>
              </div>
              <span className="text-base font-medium">导出历史</span>
            </div>
            <div className="text-gray-400">
              <span className="material-symbols-outlined group-hover:translate-x-0.5 transition-transform">chevron_right</span>
            </div>
          </button>
        </div>

        {/* Menu Group 2 */}
        <div className="bg-white dark:bg-surface-dark rounded-2xl overflow-hidden shadow-sm border border-gray-100 dark:border-white/5">
          <button 
            onClick={() => setCurrentView(View.SETTINGS)}
            className="w-full flex items-center justify-between p-4 active:bg-gray-50 dark:active:bg-[#233648] transition-colors group"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-700/30 flex items-center justify-center text-gray-600 dark:text-gray-300">
                <span className="material-symbols-outlined">settings</span>
              </div>
              <span className="text-base font-medium">设置</span>
            </div>
            <div className="text-gray-400">
              <span className="material-symbols-outlined group-hover:translate-x-0.5 transition-transform">chevron_right</span>
            </div>
          </button>
          <div className="h-px bg-gray-100 dark:bg-white/5 mx-16"></div>
          <button 
            onClick={() => setCurrentView(View.HELP)}
            className="w-full flex items-center justify-between p-4 active:bg-gray-50 dark:active:bg-[#233648] transition-colors group"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <span className="material-symbols-outlined">help_center</span>
              </div>
              <span className="text-base font-medium">帮助与反馈</span>
            </div>
            <div className="text-gray-400">
              <span className="material-symbols-outlined group-hover:translate-x-0.5 transition-transform">chevron_right</span>
            </div>
          </button>
        </div>

        <div className="flex justify-center mt-2">
          <p className="text-xs text-gray-400 dark:text-gray-600">版本 2.1.0 (Build 302)</p>
        </div>
      </main>
    </div>
  );
};

export default Profile;
