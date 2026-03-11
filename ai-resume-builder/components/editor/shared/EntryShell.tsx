import React from 'react';

interface EntryShellProps {
  title: string;
  onRemove?: () => void;
  children: React.ReactNode;
}

const EntryShell: React.FC<EntryShellProps> = ({ title, onRemove, children }) => {
  return (
    <div className="mt-4 flex flex-col gap-4 pb-6 border-b border-slate-200 dark:border-white/5 last:border-0 relative">
      <div className="flex justify-between items-center">
        <h4 className="text-sm font-semibold text-primary uppercase tracking-wide">
          {title}
        </h4>
        {onRemove && (
          <button
            onClick={onRemove}
            className="text-slate-400 hover:text-red-400 p-1"
          >
            <span className="material-symbols-outlined text-[18px]">delete</span>
          </button>
        )}
      </div>
      {children}
    </div>
  );
};

export default EntryShell;
