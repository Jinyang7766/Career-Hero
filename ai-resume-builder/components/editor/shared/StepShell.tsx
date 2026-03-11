import React from 'react';

interface StepShellProps {
  title: string;
  icon: string;
  isComplete: boolean;
  isOpen?: boolean;
  children: React.ReactNode;
  shadow?: 'sm' | 'md';
}

const StepShell: React.FC<StepShellProps> = ({
  title,
  icon,
  isComplete,
  isOpen,
  children,
  shadow = 'md',
}) => {
  const shadowClass = shadow === 'sm' ? 'shadow-sm' : 'shadow-md';

  return (
    <details
      className={`group bg-white dark:bg-surface-dark rounded-xl ${shadowClass} border border-slate-200 dark:border-[#324d67] overflow-hidden transition-all duration-300`}
      open={isOpen}
    >
      <summary className="flex cursor-pointer items-center justify-between p-4 bg-white dark:bg-surface-dark hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
        <div className="flex items-center gap-3">
          <div
            className={`flex items-center justify-center size-8 rounded-full ${
              isComplete
                ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">
              {isComplete ? 'check' : icon}
            </span>
          </div>
          <span className="font-semibold text-slate-900 dark:text-white">
            {title}
          </span>
        </div>
        <span className="material-symbols-outlined text-slate-400 group-open:rotate-180 transition-transform duration-300">
          expand_more
        </span>
      </summary>
      <div className="p-4 pt-0 border-t border-slate-200 dark:border-white/5 mt-2">
        {children}
      </div>
    </details>
  );
};

export default StepShell;
