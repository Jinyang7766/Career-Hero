import React, { useState, useEffect } from 'react';
import { View, ScreenProps } from '../../types';
import { AICacheService } from '../../src/ai-cache-service';
import { APP_BRAND_VERSION, APP_VERSION_SHORT } from '../../src/app-version';
import { confirmDialog } from '../../src/ui/dialogs';
import { useAppContext } from '../../src/app-context';
import BackButton from '../shared/BackButton';

const Settings: React.FC<ScreenProps> = () => {
  const logout = useAppContext((s) => s.logout);
  const goBack = useAppContext((s) => s.goBack);
  const theme = useAppContext((s) => s.theme);
  const setTheme = useAppContext((s) => s.setTheme);
  const [cacheSize, setCacheSize] = useState<string>('0 B');
  const [isClearing, setIsClearing] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<'default' | 'granted' | 'denied'>('default');
  const [notificationSettings, setNotificationSettings] = useState({
    pushEnabled: false,
    analysisReminder: true,
    interviewReminder: true,
    productUpdates: true,
  });

  const saveNotificationSettings = (next: typeof notificationSettings) => {
    setNotificationSettings(next);
    try {
      localStorage.setItem('settings_notifications', JSON.stringify(next));
    } catch (e) {
      console.warn('Failed to save notification settings:', e);
    }
  };

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
    try {
      const raw = localStorage.getItem('settings_notifications');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          setNotificationSettings((prev) => ({
            ...prev,
            ...parsed,
          }));
        }
      }
    } catch (e) {
      console.warn('Failed to load notification settings:', e);
    }
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  const requestNotificationPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      alert('当前浏览器不支持系统通知');
      return false;
    }
    try {
      const result = await Notification.requestPermission();
      setNotificationPermission(result);
      if (result !== 'granted') {
        alert('未开启系统通知权限，消息提醒将仅在应用内显示');
        return false;
      }
      return true;
    } catch (e) {
      console.error('Failed to request notification permission:', e);
      alert('通知权限申请失败，请稍后重试');
      return false;
    }
  };

  const handleClearCache = async () => {
    if (!(await confirmDialog('确定要清除缓存吗？这会清理本地诊断记录。'))) return;

    setIsClearing(true);
    try {
      // 1. Clear IndexedDB Cache (AI Analysis results)
      await AICacheService.clearAll();

      // 2. Clear app cache while preserving auth/session keys.
      const shouldKeepKey = (key: string) => {
        const k = String(key || '');
        if (!k) return false;
        if (k.includes('supabase.auth.token')) return true;
        if (/^sb-[a-z0-9-]+-auth-token$/i.test(k)) return true; // Supabase session key by project ref
        if (k === 'supabase_session') return true;
        if (k === 'token') return true; // legacy token fallback
        if (k === 'user') return true; // legacy cached user
        if (k === 'theme') return true;
        if (k === 'settings_notifications') return true;
        return false;
      };

      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && !shouldKeepKey(key)) {
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
      <header className="sticky top-0 z-40 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md border-b border-slate-200 dark:border-white/5 shrink-0">
        <div className="flex items-center px-4 h-14 relative">
          <BackButton onClick={goBack} className="z-10" />
          <h2 className="absolute inset-0 flex items-center justify-center text-lg font-bold leading-tight tracking-[-0.015em] text-slate-900 dark:text-white pointer-events-none">系统设置</h2>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto no-scrollbar pb-24">
        <div className="mt-8 px-4">
          <h3 className="ml-4 mb-2 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">显示</h3>
          <div className="bg-white dark:bg-surface-dark rounded-2xl overflow-hidden shadow-md border border-slate-200 dark:border-white/5 divide-y divide-slate-100 dark:divide-white/5">
            <div className="py-2 px-4">
              <div className="flex bg-slate-100 dark:bg-white/5 p-1 rounded-xl">
                {[
                  { id: 'light', label: '浅色', icon: 'light_mode' },
                  { id: 'dark', label: '深色', icon: 'dark_mode' },
                  { id: 'system', label: '跟随系统', icon: 'settings_brightness' }
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setTheme(item.id as any)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${theme === item.id
                      ? 'bg-white dark:bg-primary shadow-sm text-primary dark:text-white scale-[1.02]'
                      : 'text-slate-500 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                  >
                    <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 px-4">
          <h3 className="ml-4 mb-2 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">通用</h3>
          <div className="bg-white dark:bg-surface-dark rounded-2xl overflow-hidden shadow-md border border-slate-200 dark:border-white/5 divide-y divide-slate-100 dark:divide-white/5">
            <button
              onClick={() => setIsNotificationOpen((v) => !v)}
              className="w-full flex items-center justify-between py-3.5 px-4 active:bg-slate-50 dark:active:bg-white/5 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-[20px]">notifications</span>
                </div>
                <span className="text-sm font-semibold text-slate-900 dark:text-white">通知设置</span>
              </div>
              <span className="material-symbols-outlined text-slate-400 dark:text-slate-600 text-[20px] transition-transform group-hover:text-primary">
                {isNotificationOpen ? 'expand_less' : 'chevron_right'}
              </span>
            </button>
            {isNotificationOpen && (
              <div className="bg-slate-50/50 dark:bg-black/20 px-4 py-4 space-y-4 border-t border-slate-100 dark:border-white/5 animate-in fade-in slide-in-from-top-2 duration-300">
                {/* Permission Card */}
                <div className="rounded-2xl border border-primary/20 bg-primary/5 dark:bg-primary/10 p-4 relative overflow-hidden group/perm">
                  <div className="absolute -right-8 -top-8 size-24 rounded-full bg-primary/5 blur-2xl transition-all group-hover/perm:scale-150"></div>
                  <div className="flex items-center justify-between relative z-10">
                    <div className="flex-1 pr-4">
                      <p className="text-[13px] font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[18px] text-primary">verified_user</span>
                        系统通知权限
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-medium italic">
                        当前状态：<span className={notificationPermission === 'granted' ? 'text-emerald-500 font-bold' : 'text-slate-400'}>
                          {notificationPermission === 'granted' ? '已开启' : notificationPermission === 'denied' ? '已拒绝' : '未设置'}
                        </span>
                      </p>
                    </div>
                    {notificationPermission !== 'granted' && (
                      <button
                        type="button"
                        onClick={() => { void requestNotificationPermission(); }}
                        className="h-8 px-4 rounded-xl text-xs font-black bg-primary text-white shadow-lg shadow-primary/20 hover:scale-[1.05] active:scale-[0.95] transition-all"
                      >
                        开启
                      </button>
                    )}
                  </div>
                </div>

                {/* Toggle Items */}
                <div className="space-y-1">
                  {[
                    { key: 'pushEnabled', label: '接收系统通知', icon: 'notifications_active' },
                    { key: 'analysisReminder', label: '诊断进度提醒', icon: 'analytics' },
                    { key: 'interviewReminder', label: '面试进度提醒', icon: 'record_voice_over' },
                    { key: 'productUpdates', label: '产品更新通知', icon: 'new_releases' },
                  ].map((item) => (
                    <div key={item.key} className="flex items-center justify-between py-2 group/item">
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-[18px] text-slate-400 dark:text-slate-500 group-hover/item:text-primary transition-colors">
                          {item.icon}
                        </span>
                        <span className="text-[13px] text-slate-700 dark:text-slate-300 font-bold">{item.label}</span>
                      </div>
                      <button
                        onClick={async () => {
                          const nextValue = !(notificationSettings as any)[item.key];
                          if (item.key === 'pushEnabled' && nextValue) {
                            const ok = await requestNotificationPermission();
                            if (!ok) return;
                          }
                          saveNotificationSettings({
                            ...notificationSettings,
                            [item.key]: nextValue,
                          } as any);
                        }}
                        className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-300 focus:outline-none ${Boolean((notificationSettings as any)[item.key]) ? 'bg-primary' : 'bg-slate-200 dark:bg-white/10'
                          }`}
                      >
                        <span
                          className={`inline-block size-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-300 ${Boolean((notificationSettings as any)[item.key]) ? 'translate-x-5' : 'translate-x-1'
                            }`}
                        />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <button
              onClick={handleClearCache}
              disabled={isClearing}
              className="w-full flex items-center justify-between py-3.5 px-4 active:bg-slate-50 dark:active:bg-white/5 transition-colors group disabled:opacity-50"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-[20px]">cleaning_services</span>
                </div>
                <span className="text-sm font-semibold text-slate-900 dark:text-white">清除缓存</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[13px] text-slate-500 dark:text-slate-500 font-medium mr-1">
                  {isClearing ? '正在清理...' : cacheSize}
                </span>
                <span className="material-symbols-outlined text-slate-400 dark:text-slate-600 text-[20px] group-hover:translate-x-0.5 transition-transform group-hover:text-primary">chevron_right</span>
              </div>
            </button>
            <button className="w-full flex items-center justify-between py-3.5 px-4 active:bg-slate-50 dark:active:bg-white/5 transition-colors group">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-[20px]">system_update</span>
                </div>
                <span className="text-sm font-semibold text-slate-900 dark:text-white">检查更新</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 mr-1">
                  <span className="size-2 rounded-full bg-rose-500 animate-pulse"></span>
                  <span className="text-[13px] text-slate-400 dark:text-slate-500 font-medium">{APP_VERSION_SHORT}</span>
                </div>
                <span className="material-symbols-outlined text-slate-400 dark:text-slate-600 text-[20px] group-hover:translate-x-0.5 transition-transform group-hover:text-primary">chevron_right</span>
              </div>
            </button>
          </div>
        </div>


        <div className="mt-8 px-4 mb-4">
          <button
            onClick={() => logout()}
            className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl border border-slate-300 dark:border-white/10 text-slate-700 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-all active:scale-[0.98] shadow-sm"
          >
            <span className="text-[16px] font-semibold">退出登录</span>
          </button>
        </div>

        <div className="mt-8 text-center pb-8">
          <p className="text-[12px] text-slate-400 dark:text-slate-600">{APP_BRAND_VERSION}</p>
        </div>
      </div>
    </div>
  );
};

export default Settings;
