import React from 'react';
import { AI_AVATAR_FALLBACK } from './chat-page-utils';

export const ThinkingIndicator: React.FC<{ avatarUrl: string }> = ({ avatarUrl }) => {
  const [dots, setDots] = React.useState('');
  React.useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center mb-4 animate-in fade-in duration-300">
      <div className="size-9 rounded-full overflow-hidden shrink-0 shadow-sm mr-3">
        <img
          src={avatarUrl}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = AI_AVATAR_FALLBACK;
          }}
          alt="AI Avatar"
          className="w-full h-full object-cover"
        />
      </div>
      <span className="text-[13px] text-slate-400 dark:text-slate-500 font-medium">
        AI 正在思考{dots}
      </span>
    </div>
  );
};
