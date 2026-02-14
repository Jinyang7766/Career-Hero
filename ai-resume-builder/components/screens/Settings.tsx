import React from 'react';
import { View, ScreenProps } from '../../types';

const Settings: React.FC<ScreenProps> = ({ setCurrentView, onLogout, goBack }) => {
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
        <div className="mt-4 px-4">
          <h3 className="ml-4 mb-2 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">账号</h3>
          <div className="bg-white dark:bg-surface-dark rounded-2xl overflow-hidden shadow-sm border border-gray-100 dark:border-white/5 divide-y divide-gray-100 dark:divide-white/5">
            <button
              onClick={() => setCurrentView(View.ACCOUNT_SECURITY)}
              className="w-full flex items-center justify-between py-3.5 px-4 active:bg-gray-50 dark:active:bg-white/5 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/5 dark:bg-primary/10 flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-[20px]">verified_user</span>
                </div>
                <span className="text-sm font-medium text-slate-900 dark:text-white">账号与安全</span>
              </div>
              <span className="material-symbols-outlined text-slate-300 dark:text-slate-600 text-[20px] group-hover:translate-x-0.5 transition-transform">chevron_right</span>
            </button>
          </div>
          <p className="mt-2 ml-4 text-[12px] text-slate-400 dark:text-slate-500 font-light">管理密码、绑定手机号与第三方账号</p>
        </div>

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
            <button className="w-full flex items-center justify-between py-3.5 px-4 active:bg-gray-50 dark:active:bg-white/5 transition-colors group">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/5 dark:bg-primary/10 flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-[20px]">cleaning_services</span>
                </div>
                <span className="text-sm font-medium text-slate-900 dark:text-white">清除缓存</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[13px] text-slate-500 dark:text-slate-500 font-medium mr-1">24.5 MB</span>
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
            onClick={onLogout}
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