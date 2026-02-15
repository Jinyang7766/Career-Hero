import React, { useState, useEffect } from 'react';
import { View, ScreenProps } from '../../types';
import { AICacheService } from '../../src/ai-cache-service';
import { confirmDialog } from '../../src/ui/dialogs';
import { useAppContext } from '../../src/app-context';

const Settings: React.FC<ScreenProps> = () => {
  const { logout, goBack } = useAppContext();
  const [cacheSize, setCacheSize] = useState<string>('0 B');
  const [isClearing, setIsClearing] = useState(false);

  const calculateCacheSize = () => {
    try {
      let total = 0;
      // Estimate LocalStorage size
      for (const key in localStorage) {
        if (Object.prototype.hasOwnProperty.call(localStorage, key)) {
          total += (localStorage[key].length + key.length) * 2; // UTF-16 characters use 2 bytes
        }
      }

      // Convert to human readable format
      if (total === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(total) / Math.log(k));
      return parseFloat((total / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    } catch (e) {
      console.error('Failed to calculate cache size:', e);
      return '未知';
    }
  };

  useEffect(() => {
    setCacheSize(calculateCacheSize());
  }, []);

  const handleClearCache = async () => {
    if (!(await confirmDialog('确定要清除缓存吗？这会清理本地分析记录。'))) return;

    setIsClearing(true);
    try {
      // 1. Clear IndexedDB Cache (AI Analysis results)
      await AICacheService.clearAll();

      // 2. Clear relevant localStorage items (not including auth tokens)
      const keysToKeep = [
        'supabase.auth.token',
        'sb-qpxisqizyzqfsczfzfzv-auth-token', // Example Supabase project ref
      ];

      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && !keysToKeep.some(k => key.includes(k))) {
          localStorage.removeItem(key);
        }
      }

      // Re-calculate size
      setCacheSize(calculateCacheSize());
      alert('缓存已清理完成');
    } catch (err) {
      console.error('Failed to clear cache:', err);
      alert('清理失败，请重试');
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="bg-background-light dark:bg-background-dark h-screen flex flex-col overflow-hidden animate-in slide-in-from-right duration-300">
      <header className="sticky top-0 z-40 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md border-b border-slate-200/50 dark:border-white/5 shrink-0">
        <div className="flex items-center px-4 h-14 relative">
          <button
            onClick={goBack}
            className="flex size-10 items-center justify-center rounded-full text-slate-900 dark:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors z-10"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>arrow_back</span>
          </button>
          <h2 className="absolute inset-0 flex items-center justify-center text-lg font-bold leading-tight tracking-[-0.015em] text-slate-900 dark:text-white pointer-events-none">系统设置</h2>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto no-scrollbar pb-24">
        <div className="mt-8 px-4">
          <h3 className="ml-4 mb-2 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">通用</h3>
          <div className="bg-white dark:bg-surface-dark rounded-2xl overflow-hidden shadow-sm border border-gray-100 dark:border-white/5 divide-y divide-gray-100 dark:divide-white/5">
            <button className="w-full flex items-center justify-between py-3.5 px-4 active:bg-gray-50 dark:active:bg-white/5 transition-colors group">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/5 dark:bg-primary/10 flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-[20px]">notifications</span>
                </div>
                <span className="text-sm font-medium text-slate-900 dark:text-white">通知设置</span>
              </div>
              <span className="material-symbols-outlined text-slate-300 dark:text-slate-600 text-[20px] group-hover:translate-x-0.5 transition-transform">chevron_right</span>
            </button>
            <button
              onClick={handleClearCache}
              disabled={isClearing}
              className="w-full flex items-center justify-between py-3.5 px-4 active:bg-gray-50 dark:active:bg-white/5 transition-colors group disabled:opacity-50"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/5 dark:bg-primary/10 flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-[20px]">cleaning_services</span>
                </div>
                <span className="text-sm font-medium text-slate-900 dark:text-white">清除缓存</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[13px] text-slate-500 dark:text-slate-500 font-medium mr-1">
                  {isClearing ? '正在清理...' : cacheSize}
                </span>
                <span className="material-symbols-outlined text-slate-300 dark:text-slate-600 text-[20px] group-hover:translate-x-0.5 transition-transform">chevron_right</span>
              </div>
            </button>
            <button className="w-full flex items-center justify-between py-3.5 px-4 active:bg-gray-50 dark:active:bg-white/5 transition-colors group">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/5 dark:bg-primary/10 flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-[20px]">system_update</span>
                </div>
                <span className="text-sm font-medium text-slate-900 dark:text-white">检查更新</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 mr-1">
                  <span className="size-2 rounded-full bg-rose-500 animate-pulse"></span>
                  <span className="text-[13px] text-slate-400 dark:text-slate-500">v1.2.0</span>
                </div>
                <span className="material-symbols-outlined text-slate-300 dark:text-slate-600 text-[20px] group-hover:translate-x-0.5 transition-transform">chevron_right</span>
              </div>
            </button>
          </div>
        </div>


        <div className="mt-8 px-4 mb-4">
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:bg-black/5 dark:hover:bg-white/5 transition-all active:scale-[0.98]"
          >
            <span className="text-[16px] font-semibold">退出登录</span>
          </button>
        </div>

        <div className="mt-8 text-center pb-8">
          <p className="text-[12px] text-slate-400 dark:text-slate-600">AI Resume Builder v1.2.0 (Build 302)</p>
          <p className="text-[12px] text-slate-400 dark:text-slate-600 mt-1">© 2024 Design Copilot Inc.</p>
        </div>
      </div>
    </div>
  );
};

export default Settings;
