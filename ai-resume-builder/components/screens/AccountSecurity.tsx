import React from 'react';
import { View, ScreenProps } from '../../types';

const AccountSecurity: React.FC<ScreenProps> = ({ goBack }) => {
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
          <h1 className="text-[17px] font-semibold leading-tight absolute left-1/2 -translate-x-1/2">账号与安全</h1>
          <div className="size-10"></div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar pb-24">
        
        {/* Login Security */}
        <div className="mt-6 px-4">
          <h3 className="ml-4 mb-2 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">登录与安全</h3>
          <div className="bg-white dark:bg-[#1c1c1e] rounded-lg overflow-hidden shadow-sm border border-black/5 dark:border-white/5 flex flex-col divide-y divide-[#e5e5ea] dark:divide-[#38383a]">
            
            <button className="w-full flex items-center gap-3 px-4 py-3.5 bg-white dark:bg-[#1c1c1e] hover:bg-black/5 dark:hover:bg-white/5 transition-colors group">
              <span className="flex-1 text-left text-[16px] font-medium text-slate-900 dark:text-white">修改密码</span>
              <span className="material-symbols-outlined text-slate-400 dark:text-slate-500 text-[20px]">chevron_right</span>
            </button>

            <button className="w-full flex items-center gap-3 px-4 py-3.5 bg-white dark:bg-[#1c1c1e] hover:bg-black/5 dark:hover:bg-white/5 transition-colors group">
              <span className="flex-1 text-left text-[16px] font-medium text-slate-900 dark:text-white">手机号</span>
              <span className="text-[15px] text-slate-500 dark:text-slate-400 mr-1">138****8888</span>
              <span className="material-symbols-outlined text-slate-400 dark:text-slate-500 text-[20px]">chevron_right</span>
            </button>

             <button className="w-full flex items-center gap-3 px-4 py-3.5 bg-white dark:bg-[#1c1c1e] hover:bg-black/5 dark:hover:bg-white/5 transition-colors group">
              <span className="flex-1 text-left text-[16px] font-medium text-slate-900 dark:text-white">电子邮箱</span>
              <span className="text-[15px] text-slate-500 dark:text-slate-400 mr-1">alex@example.com</span>
              <span className="material-symbols-outlined text-slate-400 dark:text-slate-500 text-[20px]">chevron_right</span>
            </button>
          </div>
        </div>

        {/* Third Party Accounts */}
        <div className="mt-8 px-4">
          <h3 className="ml-4 mb-2 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">第三方账号绑定</h3>
          <div className="bg-white dark:bg-[#1c1c1e] rounded-lg overflow-hidden shadow-sm border border-black/5 dark:border-white/5 flex flex-col divide-y divide-[#e5e5ea] dark:divide-[#38383a]">
            
            <div className="w-full flex items-center justify-between px-4 py-3.5 bg-white dark:bg-[#1c1c1e]">
              <div className="flex items-center gap-3">
                 <svg className="h-6 w-6 text-slate-900 dark:text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM18.36 13.2H12V10.8H18.36V13.2ZM12 4.4C13.66 4.4 15 5.74 15 7.4C15 9.06 13.66 10.4 12 10.4C10.34 10.4 9 9.06 9 7.4C9 5.74 10.34 4.4 12 4.4ZM6 12C6 10.34 7.34 9 9 9C10.66 9 12 10.34 12 12C12 13.66 10.66 15 9 15C7.34 15 6 13.66 6 12Z"/></svg>
                 <span className="text-[16px] font-medium text-slate-900 dark:text-white">微信</span>
              </div>
              <button className="text-[14px] font-medium text-primary hover:opacity-80">
                  去绑定
              </button>
            </div>

            <div className="w-full flex items-center justify-between px-4 py-3.5 bg-white dark:bg-[#1c1c1e]">
              <div className="flex items-center gap-3">
                 <svg className="h-6 w-6 text-slate-900 dark:text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M21.35 11.1H12.18V13.83H18.69C18.36 17.64 15.19 19.27 12.19 19.27C8.36 19.27 5 16.25 5 12C5 7.9 8.2 4.73 12.2 4.73C15.29 4.73 17.1 6.7 17.1 6.7L19 4.72C19 4.72 16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12C2.03 17.05 6.16 22 12.25 22C17.6 22 21.5 18.33 21.5 12.91C21.5 11.76 21.35 11.1 21.35 11.1V11.1Z"/></svg>
                 <span className="text-[16px] font-medium text-slate-900 dark:text-white">Google</span>
              </div>
              <span className="text-[14px] font-medium text-slate-400 dark:text-slate-600">
                  已绑定
              </span>
            </div>

            <div className="w-full flex items-center justify-between px-4 py-3.5 bg-white dark:bg-[#1c1c1e]">
              <div className="flex items-center gap-3">
                 <svg className="h-6 w-6 text-slate-900 dark:text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M14.2 2H9.8C5.2 2 2 5.2 2 9.8V14.2C2 18.8 5.2 22 9.8 22H14.2C18.8 22 22 18.8 22 14.2V9.8C22 5.2 18.8 2 14.2 2ZM17.1 7.9L13.3 12.8L17.5 18H14.5L11.7 13.9L8.4 18H6.5L10.6 12.9L6.7 8H9.7L12.2 11.6L15.2 8H17.1Z"/></svg>
                 <span className="text-[16px] font-medium text-slate-900 dark:text-white">Twitter / X</span>
              </div>
              <button className="text-[14px] font-medium text-primary hover:opacity-80">
                  去绑定
              </button>
            </div>

          </div>
        </div>

        <div className="mt-8 px-4 mb-8">
           <button 
              className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-lg border border-[#ff3b30]/30 text-[#ff3b30] hover:bg-[#ff3b30]/5 active:bg-[#ff3b30]/10 transition-colors"
            >
              <span className="text-[16px] font-medium">注销账号</span>
            </button>
            <p className="mt-3 text-[12px] text-slate-400 dark:text-slate-600 text-center px-4">
                注销后，您的所有个人数据（包括简历历史）将被永久删除且无法恢复。
            </p>
        </div>

      </div>
    </div>
  );
};

export default AccountSecurity;