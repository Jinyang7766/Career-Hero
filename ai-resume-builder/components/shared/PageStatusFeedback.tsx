import React from 'react';

interface PageStatusFeedbackProps {
  status: 'loading' | 'error';
  title?: string;
  message?: string;
  onRetry?: () => void;
  icon?: string;
}

const PageStatusFeedback: React.FC<PageStatusFeedbackProps> = ({
  status,
  title,
  message,
  onRetry,
  icon = 'pending',
}) => {
  const isError = status === 'error';
  
  return (
    <div className="flex flex-col min-h-[70vh] items-center justify-center p-8 animate-in fade-in duration-300">
      <div className="relative size-28 mb-8">
        <div className={`absolute inset-0 rounded-full border-4 ${isError ? 'border-rose-100 dark:border-rose-900/20' : 'border-slate-100 dark:border-white/5'}`}></div>
        {!isError && (
          <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
        )}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`material-symbols-outlined text-4xl ${isError ? 'text-rose-500' : 'text-primary animate-pulse'}`}>
            {isError ? 'error' : icon}
          </span>
        </div>
      </div>
      
      <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2 text-center">
        {title || (isError ? '出错了' : '正在加载中...')}
      </h3>
      
      {message && (
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center max-w-xs leading-relaxed mb-6">
          {message}
        </p>
      )}
      
      {isError && onRetry && (
        <button
          onClick={onRetry}
          className="h-11 px-8 rounded-xl bg-primary text-white text-sm font-bold shadow-lg shadow-primary/25 hover:bg-blue-600 active:scale-95 transition-all flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-[20px]">refresh</span>
          <span>重试一次</span>
        </button>
      )}
    </div>
  );
};

export default PageStatusFeedback;
