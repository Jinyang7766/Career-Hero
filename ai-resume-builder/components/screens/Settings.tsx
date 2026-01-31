import React from 'react';
import { View, ScreenProps } from '../../types';

const Settings: React.FC<ScreenProps> = ({ setCurrentView, onLogout, goBack }) => {
  return (
    <div className="bg-background-light dark:bg-background-dark h-screen flex flex-col overflow-hidden animate-in slide-in-from-right duration-300">
      <div className="flex-none pt-safe-top bg-white/80 dark:bg-[#1c1c1e]/80 backdrop-blur-xl sticky top-0 z-50 border-b border-[#e5e5ea] dark:border-[#38383a] transition-colors duration-300">
        <div className="flex items-center justify-between px-4 py-3 h-[52px]">
          <button 
            onClick={goBack}
            className="flex items-center justify-center size-10 rounded-full hover:bg-black/5 dark:hover:bg-white/10 active:scale-95 transition-all text-primary"
          >
            <span className="material-symbols-outlined text-[26px]">arrow_back_ios_new</span>
          </button>
          <h1 className="text-[17px] font-semibold leading-tight absolute left-1/2 -translate-x-1/2">系统设置</h1>
          <div className="size-10"></div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar pb-24">
        <div className="mt-6 px-4">
          <h3 className="ml-4 mb-2 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">账号</h3>
          <div className="bg-white dark:bg-[#1c1c1e] rounded-lg overflow-hidden shadow-sm border border-black/5 dark:border-white/5">
            <button 
              onClick={() => setCurrentView(View.ACCOUNT_SECURITY)}
              className="w-full flex items-center gap-3 px-4 py-3.5 bg-white dark:bg-[#1c1c1e] hover:bg-black/5 dark:hover:bg-white/5 transition-colors group"
            >
              <div className="flex items-center justify-center size-8 rounded-md bg-primary text-white shrink-0 shadow-sm">
                <span className="material-symbols-outlined text-[20px]">verified_user</span>
              </div>
              <span className="flex-1 text-left text-[16px] font-medium text-slate-900 dark:text-white group-active:opacity-70">账号与安全</span>
              <span className="material-symbols-outlined text-slate-400 dark:text-slate-500 text-[20px]">chevron_right</span>
            </button>
          </div>
          <p className="mt-2 ml-4 text-[13px] text-slate-400 dark:text-slate-500 font-light">管理密码、绑定手机号与第三方账号</p>
        </div>

        <div className="mt-8 px-4">
          <h3 className="ml-4 mb-2 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">通用</h3>
          <div className="bg-white dark:bg-[#1c1c1e] rounded-lg overflow-hidden shadow-sm border border-black/5 dark:border-white/5 flex flex-col divide-y divide-[#e5e5ea] dark:divide-[#38383a]">
            <button className="w-full flex items-center gap-3 px-4 py-3.5 bg-white dark:bg-[#1c1c1e] hover:bg-black/5 dark:hover:bg-white/5 transition-colors group">
              <div className="flex items-center justify-center size-8 rounded-md bg-[#ff3b30] text-white shrink-0 shadow-sm">
                <span className="material-symbols-outlined text-[20px]">notifications</span>
              </div>
              <span className="flex-1 text-left text-[16px] font-medium text-slate-900 dark:text-white group-active:opacity-70">通知设置</span>
              <span className="material-symbols-outlined text-slate-400 dark:text-slate-500 text-[20px]">chevron_right</span>
            </button>
            <button className="w-full flex items-center gap-3 px-4 py-3.5 bg-white dark:bg-[#1c1c1e] hover:bg-black/5 dark:hover:bg-white/5 transition-colors group">
              <div className="flex items-center justify-center size-8 rounded-md bg-[#34c759] text-white shrink-0 shadow-sm">
                <span className="material-symbols-outlined text-[20px]">cleaning_services</span>
              </div>
              <span className="flex-1 text-left text-[16px] font-medium text-slate-900 dark:text-white group-active:opacity-70">清除缓存</span>
              <span className="text-[15px] text-slate-500 dark:text-slate-400 mr-1">24.5 MB</span>
              <span className="material-symbols-outlined text-slate-400 dark:text-slate-500 text-[20px]">chevron_right</span>
            </button>
            <button className="w-full flex items-center gap-3 px-4 py-3.5 bg-white dark:bg-[#1c1c1e] hover:bg-black/5 dark:hover:bg-white/5 transition-colors group">
              <div className="flex items-center justify-center size-8 rounded-md bg-[#007aff] text-white shrink-0 shadow-sm">
                <span className="material-symbols-outlined text-[20px]">system_update</span>
              </div>
              <span className="flex-1 text-left text-[16px] font-medium text-slate-900 dark:text-white group-active:opacity-70">检查更新</span>
              <div className="flex items-center gap-1.5 mr-1">
                <span className="size-2 rounded-full bg-[#ff3b30] animate-pulse"></span>
                <span className="text-[15px] text-slate-500 dark:text-slate-400">v1.2.0</span>
              </div>
              <span className="material-symbols-outlined text-slate-400 dark:text-slate-500 text-[20px]">chevron_right</span>
            </button>
          </div>
        </div>

        <div className="mt-8 px-4 mb-8">
          <div className="bg-white dark:bg-[#1c1c1e] rounded-lg overflow-hidden shadow-sm border border-black/5 dark:border-white/5">
            <button 
              onClick={onLogout}
              className="w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-white dark:bg-[#1c1c1e] hover:bg-black/5 dark:hover:bg-white/5 active:bg-black/10 dark:active:bg-white/10 transition-colors"
            >
              <span className="text-[16px] font-medium text-[#ff3b30]">退出登录</span>
            </button>
          </div>
          <div className="mt-8 text-center">
            <p className="text-[12px] text-slate-400 dark:text-slate-600">AI Resume Builder v1.2.0 (Build 302)</p>
            <p className="text-[12px] text-slate-400 dark:text-slate-600 mt-1">© 2024 Design Copilot Inc.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;