import React from 'react';
import { useAppContext } from '../../src/app-context';
import BackButton from './BackButton';

type PolicyLayoutProps = {
  title: string;
  children: React.ReactNode;
};

const PolicyLayout: React.FC<PolicyLayoutProps> = ({ title, children }) => {
  const goBack = useAppContext((s) => s.goBack);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-950 animate-in slide-in-from-right duration-300">
      <header className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 h-14 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-white/5 mx-auto w-full max-w-md">
        <BackButton onClick={goBack} className="hover:bg-slate-100 dark:hover:bg-white/5 text-slate-600 dark:text-slate-400" />
        <h1 className="text-base font-bold text-slate-900 dark:text-white">{title}</h1>
        <div className="w-10" />
      </header>

      <main className="flex-1 overflow-y-auto px-6 pt-[5.5rem] pb-8">
        {children}
      </main>
    </div>
  );
};

export default PolicyLayout;
