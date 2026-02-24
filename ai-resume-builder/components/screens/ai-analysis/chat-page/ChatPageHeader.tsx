import React from 'react';
import { confirmDialog } from '../../../../src/ui/dialogs';
import BackButton from '../../../shared/BackButton';
import { AI_AVATAR_FALLBACK, MICRO_INTERVIEW_AVATAR } from './chat-page-utils';

type Props = {
  isInterviewMode: boolean;
  aiAvatarUrl: string;
  interviewerTitle: string;
  isRecording: boolean;
  restartLabel: string;
  handleStepBack: () => void;
  onInterruptThinking: () => void;
  onRestartInterview: () => void;
  onEndInterview: () => void;
};

export const ChatPageHeader: React.FC<Props> = ({
  isInterviewMode,
  aiAvatarUrl,
  interviewerTitle,
  isRecording,
  restartLabel,
  handleStepBack,
  onInterruptThinking,
  onRestartInterview,
  onEndInterview,
}) => {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuWrapperRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!menuOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (menuWrapperRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [menuOpen]);

  return (
    <div className="fixed top-0 left-0 right-0 mx-auto w-full max-w-md z-50 flex items-center justify-between p-4 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-white/5">
      <div className="flex items-center gap-3">
        <BackButton onClick={handleStepBack} className="-ml-1 size-9" iconClassName="text-[22px]" />
        <div className="size-10 rounded-full overflow-hidden">
          <img
            src={isInterviewMode ? aiAvatarUrl : MICRO_INTERVIEW_AVATAR}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = AI_AVATAR_FALLBACK;
            }}
            alt="AI Agent"
          />
        </div>
        <div>
          <h3 className="font-bold text-slate-900 dark:text-white leading-tight">
            {isInterviewMode ? interviewerTitle : 'AI 微访谈助手'}
          </h3>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">在线</span>
          </div>
        </div>
      </div>

      <div ref={menuWrapperRef} className="relative">
        <button
          type="button"
          disabled={isRecording}
          onClick={() => setMenuOpen(!menuOpen)}
          className="size-9 flex items-center justify-center rounded-lg border border-slate-200 dark:border-white/10 bg-white/80 dark:bg-white/5 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/10 disabled:opacity-50 transition-colors"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>more_vert</span>
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-11 w-max min-w-[140px] bg-white dark:bg-[#1c2936] rounded-xl shadow-xl border border-slate-100 dark:border-white/5 z-[60] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={async () => {
                setMenuOpen(false);
                if (await confirmDialog(isInterviewMode ? '重新开始将初始化全部设置并清空当前面试记录，确认继续吗？' : '确定要重新开始吗？当前面试记录将被清空。')) {
                  onInterruptThinking();
                  onRestartInterview();
                }
              }}
              className="w-full text-left px-4 py-3 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 flex items-center gap-2 whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-[18px]">restart_alt</span>
              {restartLabel}
            </button>
            <div className="h-px bg-slate-100 dark:bg-white/5"></div>
            <button
              onClick={async () => {
                setMenuOpen(false);
                if (await confirmDialog(isInterviewMode ? '确认结束面试并生成总结吗？' : '确认结束微访谈并生成最终诊断报告吗？')) {
                  onInterruptThinking();
                  onEndInterview();
                }
              }}
              className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-[18px]">logout</span>
              {isInterviewMode ? '结束面试' : '结束微访谈'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
