import React from 'react';
import { View, ScreenProps } from '../../types';

const History: React.FC<ScreenProps> = ({ setCurrentView, goBack }) => {
  return (
    <div className="flex flex-col min-h-screen bg-background-light dark:bg-background-dark pb-24 animate-in slide-in-from-right duration-300">
      <header className="sticky top-0 z-50 bg-background-light dark:bg-background-dark/95 backdrop-blur-md border-b border-gray-200 dark:border-white/5">
        <div className="flex items-center px-4 h-14 justify-between">
          <button 
            onClick={goBack}
            className="flex items-center justify-center size-10 -ml-2 rounded-full hover:bg-gray-200 dark:hover:bg-white/10 transition-colors text-slate-900 dark:text-white"
          >
            <span className="material-symbols-outlined text-2xl">arrow_back_ios_new</span>
          </button>
          <h1 className="text-lg font-bold leading-tight tracking-tight flex-1 text-center pr-8">导出历史</h1>
          {/* Top Right Icon Removed */}
          <div className="size-8"></div>
        </div>
      </header>
      
      {/* Search Bar Removed */}

      <main className="flex flex-col w-full mt-4">
        {/* Today */}
        <div className="flex flex-col">
          <h3 className="text-slate-500 dark:text-text-secondary text-sm font-semibold px-4 pb-2 pt-2">今天</h3>
          
          <div className="group relative flex items-center gap-4 px-4 py-3 hover:bg-white dark:hover:bg-surface-dark/50 transition-colors cursor-pointer border-b border-gray-100 dark:border-white/5 last:border-0">
            <div className="relative flex items-center justify-center shrink-0 size-12 rounded-xl bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400">
              <span className="material-symbols-outlined">picture_as_pdf</span>
              <div className="absolute -bottom-1 -right-1 bg-white dark:bg-surface-dark rounded-full p-[2px]">
                <div className="bg-green-500 size-2.5 rounded-full border border-white dark:border-surface-dark"></div>
              </div>
            </div>
            <div className="flex flex-col flex-1 min-w-0">
              <p className="text-slate-900 dark:text-white text-base font-medium truncate">张三_产品经理_简历.pdf</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/10 text-slate-500 dark:text-text-secondary">PDF</span>
                <span className="text-slate-500 dark:text-text-secondary text-sm">14:30 • 2.4 MB</span>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button className="size-9 flex items-center justify-center rounded-full text-primary hover:bg-primary/10 transition-colors">
                <span className="material-symbols-outlined text-[22px]">download</span>
              </button>
            </div>
          </div>

          <div className="group relative flex items-center gap-4 px-4 py-3 hover:bg-white dark:hover:bg-surface-dark/50 transition-colors cursor-pointer border-b border-gray-100 dark:border-white/5 last:border-0">
            <div className="relative flex items-center justify-center shrink-0 size-12 rounded-xl bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400">
              <span className="material-symbols-outlined">description</span>
            </div>
            <div className="flex flex-col flex-1 min-w-0">
              <p className="text-slate-900 dark:text-white text-base font-medium truncate">张三_求职信.docx</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/10 text-slate-500 dark:text-text-secondary">Word</span>
                <span className="text-slate-500 dark:text-text-secondary text-sm">10:15 • 850 KB</span>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button className="size-9 flex items-center justify-center rounded-full text-primary hover:bg-primary/10 transition-colors">
                <span className="material-symbols-outlined text-[22px]">download</span>
              </button>
            </div>
          </div>
        </div>

        {/* Yesterday */}
        <div className="flex flex-col mt-4">
          <h3 className="text-slate-500 dark:text-text-secondary text-sm font-semibold px-4 pb-2 pt-2">昨天</h3>
          <div className="group relative flex items-center gap-4 px-4 py-3 hover:bg-white dark:hover:bg-surface-dark/50 transition-colors cursor-pointer border-b border-gray-100 dark:border-white/5 last:border-0">
            <div className="relative flex items-center justify-center shrink-0 size-12 rounded-xl bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400">
              <span className="material-symbols-outlined">picture_as_pdf</span>
            </div>
            <div className="flex flex-col flex-1 min-w-0">
              <p className="text-slate-900 dark:text-white text-base font-medium truncate">张三_通用简历_V2.pdf</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/10 text-slate-500 dark:text-text-secondary">PDF</span>
                <span className="text-slate-500 dark:text-text-secondary text-sm">09:00 • 2.3 MB</span>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button className="size-9 flex items-center justify-center rounded-full text-slate-400 hover:text-primary hover:bg-primary/10 transition-colors">
                <span className="material-symbols-outlined text-[22px]">download_done</span>
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default History;