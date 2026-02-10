import React, { useState, useEffect } from 'react';
import { ScreenProps } from '../../types';
import { useUserProfile } from '../../src/useUserProfile';

const Dashboard: React.FC<ScreenProps & { createNewResume?: () => void }> = ({ currentUser, createNewResume }) => {
  const [greeting, setGreeting] = useState('');

  // Get user profile with real name
  const { userProfile, loading, error } = useUserProfile();
  const displayName =
    userProfile?.name ||
    currentUser?.user_metadata?.name ||
    currentUser?.email?.split('@')[0] ||
    '';

  // Get greeting based on Beijing timezone
  const getBeijingGreeting = () => {
    const now = new Date();
    // Convert to Beijing timezone (UTC+8)
    const beijingTime = new Date(now.getTime() + (8 * 60 * 60 * 1000) + (now.getTimezoneOffset() * 60 * 1000));
    const hour = beijingTime.getHours();

    if (hour >= 5 && hour < 12) {
      return '早上好';
    } else if (hour >= 12 && hour < 18) {
      return '中午好';
    } else if (hour >= 18 && hour < 23) {
      return '晚上好';
    } else {
      return '夜深了';
    }
  };

  // Update greeting every minute
  useEffect(() => {
    const updateGreeting = () => {
      setGreeting(getBeijingGreeting());
    };

    updateGreeting();
    const interval = setInterval(updateGreeting, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col pb-24 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between p-4 sticky top-0 z-30 bg-background-light/90 dark:bg-background-dark/90 backdrop-blur-md">
        <div className="flex flex-col">
          <h2 className="text-xl font-bold leading-tight text-gray-900 dark:text-white">
            {greeting}{displayName ? `，${displayName}` : ''}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {new Date().toLocaleDateString('zh-CN', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'Asia/Shanghai'
            })}
          </p>
        </div>
      </div>

      {/* Create New Card */}
      <div className="px-4 pb-6 pt-4">
        <div
          onClick={createNewResume}
          className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-primary to-[#0d5cb0] p-6 shadow-lg shadow-primary/20 cursor-pointer active:scale-[0.98] transition-all"
        >
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-3xl"></div>
          <div className="absolute -left-10 -bottom-10 h-40 w-40 rounded-full bg-white/10 blur-3xl"></div>
          <div className="relative flex flex-col items-start gap-4">
            <div className="flex items-center justify-center h-12 w-12 rounded-full bg-white/20 backdrop-blur-sm">
              <span className="material-symbols-outlined text-white" style={{ fontSize: '28px' }}>add</span>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-xl font-bold text-white">新建简历</h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white text-primary uppercase tracking-wide">AI 向导</span>
              </div>
              <p className="text-blue-100 text-sm max-w-[90%]">通过智能向导，轻松几步创建专业简历。</p>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                createNewResume?.();
              }}
              className="mt-2 flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-primary shadow-sm hover:bg-blue-50 transition-colors"
            >
              <span>立即开始</span>
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </button>
          </div>
        </div>
      </div>

    </div>
  );
};

export default Dashboard;
