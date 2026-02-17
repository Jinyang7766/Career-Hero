import React from 'react';
import { View } from '../types';
import { useAppContext } from '../src/app-context';

const BottomNav: React.FC = () => {
  const currentView = useAppContext((s) => s.currentView);
  const navigateToView = useAppContext((s) => s.navigateToView);

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
          onClick={() => navigateToView(View.DASHBOARD, { root: true, replace: true })}
          className={getButtonClass(View.DASHBOARD)}
        >
          <span className={getIconClass(View.DASHBOARD, 'home')}>home</span>
          <span className="text-[10px] font-medium leading-none">首页</span>
        </button>


        <button
          onClick={() => navigateToView(View.AI_ANALYSIS, { root: true, replace: true })}
          className={getButtonClass(View.AI_ANALYSIS)}
        >
          <span className={getIconClass(View.AI_ANALYSIS, 'assessment')}>assessment</span>
          <span className="text-[10px] font-medium leading-none">AI 诊断</span>
        </button>

        <button
          onClick={() => navigateToView(View.AI_INTERVIEW, { root: true, replace: true })}
          className={getButtonClass(View.AI_INTERVIEW)}
        >
          <span className={getIconClass(View.AI_INTERVIEW, 'forum')}>forum</span>
          <span className="text-[10px] font-medium leading-none">AI 面试</span>
        </button>

        <button
          onClick={() => navigateToView(View.PROFILE, { root: true, replace: true })}
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
