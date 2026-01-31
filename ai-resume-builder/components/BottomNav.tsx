import React from 'react';
import { View, NavProps } from '../types';

const BottomNav: React.FC<NavProps> = ({ currentView, setCurrentView }) => {
  const getIconClass = (view: View, baseIcon: string) => {
    const isActive = currentView === view;
    return `material-symbols-outlined text-[26px] mb-0.5 transition-transform duration-200 ${isActive ? 'fill-1' : ''}`;
  };

  const getButtonClass = (view: View) => {
    const isActive = currentView === view || 
                     (view === View.DASHBOARD && [View.ALL_RESUMES, View.PREVIEW, View.EDITOR, View.HISTORY].includes(currentView)) ||
                     (view === View.PROFILE && [View.SETTINGS, View.HELP].includes(currentView));
                     
    return `flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors group ${
      isActive ? 'text-primary' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
    }`;
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/90 dark:bg-background-dark/90 backdrop-blur-xl border-t border-gray-200 dark:border-white/5 pb-safe pt-2 max-w-md mx-auto">
      <div className="flex justify-around items-center h-16 pb-2">
        <button 
          onClick={() => setCurrentView(View.DASHBOARD)} 
          className={getButtonClass(View.DASHBOARD)}
        >
          <span className={getIconClass(View.DASHBOARD, 'home')}>home</span>
          <span className="text-[10px] font-medium">首页</span>
        </button>
        
        <button 
          onClick={() => setCurrentView(View.TEMPLATES)} 
          className={getButtonClass(View.TEMPLATES)}
        >
          <span className={getIconClass(View.TEMPLATES, 'edit_document')}>edit_document</span>
          <span className="text-[10px] font-medium">简历</span>
        </button>

        <button 
          onClick={() => setCurrentView(View.AI_ANALYSIS)} 
          className={getButtonClass(View.AI_ANALYSIS)}
        >
          <div className={`flex items-center justify-center rounded-xl px-4 py-1 transition-colors ${currentView === View.AI_ANALYSIS ? 'bg-primary/10' : ''}`}>
             <span className={`material-symbols-outlined text-[26px] transition-transform duration-200 ${currentView === View.AI_ANALYSIS ? 'text-primary fill-1' : ''}`}>auto_awesome</span>
          </div>
          <span className={`text-[10px] font-medium ${currentView === View.AI_ANALYSIS ? 'text-primary' : ''}`}>AI 助手</span>
        </button>
        
        <button 
          onClick={() => setCurrentView(View.PROFILE)} 
          className={getButtonClass(View.PROFILE)}
        >
          <span className={getIconClass(View.PROFILE, 'person')}>person</span>
          <span className="text-[10px] font-medium">我的</span>
        </button>
      </div>
    </nav>
  );
};

export default BottomNav;