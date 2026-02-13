import React from 'react';
import { View, NavProps } from '../types';

const BottomNav: React.FC<NavProps> = ({ currentView, setCurrentView }) => {
  const getIconClass = (view: View, baseIcon: string) => {
    const isActive = currentView === view;
    return `material-symbols-outlined text-[22px] leading-none transition-transform duration-200 ${isActive ? 'fill-1' : ''}`;
  };

  const getButtonClass = (view: View) => {
    const isActive = currentView === view ||
      (view === View.ALL_RESUMES && [View.ALL_RESUMES, View.TEMPLATES, View.PREVIEW].includes(currentView)) ||
      (view === View.PROFILE && [View.SETTINGS, View.HELP].includes(currentView));

    return `flex flex-col items-center justify-center w-full h-full space-y-0 transition-colors group ${isActive ? 'text-primary' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
      }`;
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-[100] h-12 min-h-12 max-h-12 bg-white/95 dark:bg-[#111a22]/95 backdrop-blur-md border-t border-slate-200 dark:border-white/5 mx-auto max-w-md overflow-hidden"
    >
      <div className="flex justify-around items-center h-full leading-none">
        <button
          onClick={() => setCurrentView(View.DASHBOARD)}
          className={getButtonClass(View.DASHBOARD)}
        >
          <span className={getIconClass(View.DASHBOARD, 'home')}>home</span>
          <span className="text-[10px] font-medium leading-none">首页</span>
        </button>

        <button
          onClick={() => setCurrentView(View.ALL_RESUMES)}
          className={getButtonClass(View.ALL_RESUMES)}
        >
          <span className={getIconClass(View.ALL_RESUMES, 'edit_document')}>edit_document</span>
          <span className="text-[10px] font-medium leading-none">简历</span>
        </button>

        <button
          onClick={() => setCurrentView(View.AI_ANALYSIS)}
          className={getButtonClass(View.AI_ANALYSIS)}
        >
          <div className="flex items-center justify-center rounded-xl transition-colors">
            <svg className={`w-[22px] h-[22px] mb-0 transition-transform duration-200 ${currentView === View.AI_ANALYSIS ? 'text-primary scale-110' : ''}`} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* A - Round caps */}
              <path d="M4 21L10 5L16 21" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M7 15H13" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              {/* I - Round caps */}
              <path d="M20 5V21" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              {/* Sparkle - Filled star */}
              <path d="M21 1L22.2 3.8L25 5L22.2 6.2L21 9L19.8 6.2L17 5L19.8 3.8L21 1Z" fill="currentColor" transform="translate(-1, 0) scale(0.7)" />
            </svg>
          </div>
          <span className={`text-[10px] font-medium leading-none ${currentView === View.AI_ANALYSIS ? 'text-primary' : ''}`}>AI 诊断</span>
        </button>

        <button
          onClick={() => setCurrentView(View.PROFILE)}
          className={getButtonClass(View.PROFILE)}
        >
          <span className={getIconClass(View.PROFILE, 'person')}>person</span>
          <span className="text-[10px] font-medium leading-none">我的</span>
        </button>
      </div>
    </nav>
  );
};

export default BottomNav;
