import React from 'react';
import type { ChatMessage } from './types';
import { confirmDialog } from '../../../src/ui/dialogs';
import AiDisclaimer from './AiDisclaimer';
import BackButton from '../../shared/BackButton';
import ReportFeedback from './ReportFeedback';
import { USAGE_POINT_COST } from '../../../src/points-config';

type ParsedReference = { before?: string; reference: string; after?: string };

const AI_AVATAR_FALLBACK =
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Hiroshi&top=shortHair&clothing=blazerAndShirt';
const MICRO_INTERVIEW_AVATAR = '/ai-avatar-mircointro.png';

export type ChatPageProps = {
  isInterviewMode?: boolean;
  ToastOverlay: React.ComponentType;
  WaveformVisualizer: React.ComponentType<{ active: boolean; cancel: boolean }>;

  handleStepBack: () => void;
  onInterruptThinking: () => void;
  onEndInterview: () => void;
  onSkipQuestion: () => void;
  onRestartInterview: () => void;

  userAvatar: string;
  chatMessages: ChatMessage[];
  isSending: boolean;
  hasPendingReply: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  messagesContainerRef: React.RefObject<HTMLDivElement | null>;
  onMessagesScroll: () => void;

  expandedReferences: Record<string, boolean>;
  setExpandedReferences: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  parseReferenceReply: (text: string) => ParsedReference | null;

  audioPlayerRef: React.RefObject<HTMLAudioElement | null>;
  playingAudioId: string | null;
  setPlayingAudioId: React.Dispatch<React.SetStateAction<string | null>>;

  hasVoiceBlob: (msgId: string) => boolean;
  transcribingByMsgId: Record<string, boolean>;
  transcribeExistingVoiceMessage: (msgId: string) => void;

  keyboardOffset: number;
  inputBarHeight: number;
  inputBarRef: React.RefObject<HTMLDivElement | null>;
  isKeyboardOpen: boolean;

  audioError: string;
  setAudioError: (v: string) => void;

  inputMode: 'text' | 'voice';
  isRecording: boolean;
  audioSupported: boolean;
  holdCancel: boolean;

  toggleMode: () => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  inputMessage: string;
  setInputMessage: (v: string) => void;
  handleSendMessage: () => void;

  holdTalkBtnRef: React.RefObject<HTMLButtonElement | null>;
  onHoldPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onHoldPointerMove: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onHoldPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onHoldPointerCancel: (e: React.PointerEvent<HTMLButtonElement>) => void;
  interviewPlan: string[];
  interviewAnsweredCount: number;
  interviewTotalCount: number;
  currentQuestionElapsedSec: number;
  interviewerTitle: string;
  aiAvatarUrl: string;
  onMessageFeedback?: (message: ChatMessage, rating: 'up' | 'down', reason?: string) => Promise<boolean> | boolean;
};

const ThinkingIndicator: React.FC<{ avatarUrl: string }> = ({ avatarUrl }) => {
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

const shouldShowMessageFeedback = (msg: ChatMessage) => {
  if (msg.role !== 'model') return false;
  const id = String(msg.id || '').trim();
  const text = String(msg.text || '').trim();
  if (!text) return false;
  if (id === 'ai-summary') return false;
  const greetingLike =
    /您好|你好/.test(text) &&
    /我是您的\s*AI|我是你的\s*AI|微访谈助手|模拟面试官|HR面试官|复试深挖面试官/.test(text);
  return !greetingLike;
};

const ChatPage: React.FC<ChatPageProps> = ({
  isInterviewMode = false,
  ToastOverlay,
  WaveformVisualizer,
  handleStepBack,
  onInterruptThinking,
  onEndInterview,
  onSkipQuestion,
  onRestartInterview,
  userAvatar,
  chatMessages,
  isSending,
  hasPendingReply,
  messagesEndRef,
  messagesContainerRef,
  onMessagesScroll,
  expandedReferences,
  setExpandedReferences,
  parseReferenceReply,
  audioPlayerRef,
  playingAudioId,
  setPlayingAudioId,
  hasVoiceBlob,
  transcribingByMsgId,
  transcribeExistingVoiceMessage,
  keyboardOffset,
  inputBarHeight,
  inputBarRef,
  isKeyboardOpen,
  audioError,
  setAudioError,
  inputMode,
  isRecording,
  audioSupported,
  holdCancel,
  toggleMode,
  textareaRef,
  inputMessage,
  setInputMessage,
  handleSendMessage,
  holdTalkBtnRef,
  onHoldPointerDown,
  onHoldPointerMove,
  onHoldPointerUp,
  onHoldPointerCancel,
  interviewPlan,
  interviewAnsweredCount,
  interviewTotalCount,
  currentQuestionElapsedSec,
  interviewerTitle,
  aiAvatarUrl,
  onMessageFeedback,
}) => {
  const restartLabel = isInterviewMode
    ? '重新开始'
    : `重新开始（${USAGE_POINT_COST.micro_interview}积分）`;
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [planExpanded, setPlanExpanded] = React.useState(false);
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

  const progressPercent = interviewTotalCount > 0
    ? Math.min(100, Math.round((interviewAnsweredCount / interviewTotalCount) * 100))
    : 0;
  const formatElapsed = (sec: number) => {
    const safe = Math.max(0, Number(sec) || 0);
    const mm = Math.floor(safe / 60).toString().padStart(2, '0');
    const ss = Math.floor(safe % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
  };
  return (
    <div className="fixed inset-0 z-[100] bg-slate-50 dark:bg-[#0b1219] flex flex-col animate-in slide-in-from-right duration-300 overflow-hidden pt-[76px]">
      <ToastOverlay />

      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between p-4 bg-white/80 dark:bg-[#1c2936]/80 backdrop-blur-md border-b border-slate-200 dark:border-white/5">
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

      {isInterviewMode && (
        <div className="mx-4 my-2 p-3 bg-white/70 dark:bg-[#1c2936]/40 backdrop-blur-md rounded-2xl border border-slate-200/50 dark:border-white/5 shadow-sm">
          {interviewTotalCount > 0 ? (
            <>
              <div className="w-full text-left group">
                <div className="flex items-center justify-between mb-2 px-1">
                  <div className="flex items-center gap-2">
                    <div className="size-5 rounded-md bg-primary/10 dark:bg-primary/20 flex items-center justify-center">
                      <span className="material-symbols-outlined text-[14px] text-primary">assessment</span>
                    </div>
                    {interviewTotalCount <= 1 ? (
                      <div className="flex items-center gap-2">
                        <p className="text-[11px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider">
                          正在加载面试题库
                        </p>
                        <div className="size-2.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                      </div>
                    ) : (
                      <>
                        <p className="text-[11px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider">
                          面试进度
                        </p>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500">
                            {Math.min(interviewAnsweredCount + 1, interviewTotalCount)} / {interviewTotalCount}
                          </span>
                          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                            本题用时 {formatElapsed(currentQuestionElapsedSec)}
                          </span>
                          <button
                            type="button"
                            disabled={isSending || isRecording}
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (await confirmDialog('确认跳过当前题目吗？将结束本题计时，并让 AI 给出参考回复后进入下一题。')) {
                                onSkipQuestion();
                              }
                            }}
                            className="px-2 py-0.5 rounded-md border border-primary/20 dark:border-primary/30 bg-primary/10 dark:bg-primary/20 text-[10px] font-bold text-primary dark:text-blue-400 hover:bg-primary/20 dark:hover:bg-primary/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            跳过本题
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPlanExpanded((v) => !v)}
                    className="size-6 flex items-center justify-center rounded-md text-slate-400 dark:text-slate-500 hover:bg-slate-100/70 dark:hover:bg-white/5 transition-colors"
                    aria-label={planExpanded ? '收起题库' : '展开题库'}
                  >
                    <span className={`material-symbols-outlined text-[20px] transition-transform duration-300 ${planExpanded ? 'rotate-180' : ''}`}>
                      keyboard_arrow_down
                    </span>
                  </button>
                </div>
                <div className="h-2 rounded-full bg-slate-100 dark:bg-white/5 overflow-hidden p-0.5 border border-slate-200/50 dark:border-white/5">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary to-blue-400 transition-all duration-500 ease-out shadow-[0_0_8px_rgba(37,99,235,0.4)]"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
              {planExpanded && (
                <div className="mt-3 rounded-xl border border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-black/20 p-2.5 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 customize-scrollbar">
                    {interviewPlan.map((q, idx) => {
                      const done = idx < interviewAnsweredCount;
                      const isCurrent = idx === interviewAnsweredCount;
                      return (
                        <div
                          key={`${idx}-${q.slice(0, 20)}`}
                          className={`flex items-start gap-3 p-2 rounded-lg transition-colors ${isCurrent ? 'bg-primary/5 dark:bg-primary/10 border border-primary/10' : ''
                            }`}
                        >
                          <div className="shrink-0 mt-0.5">
                            {done ? (
                              <div className="size-5 rounded-full bg-emerald-500 flex items-center justify-center">
                                <span className="material-symbols-outlined text-[12px] text-white font-bold">check</span>
                              </div>
                            ) : (
                              <div className={`size-5 rounded-full border-2 flex items-center justify-center text-[10px] font-black ${isCurrent
                                ? 'border-primary text-primary animate-pulse'
                                : 'border-slate-300 dark:border-slate-700 text-slate-400'
                                }`}>
                                {idx + 1}
                              </div>
                            )}
                          </div>
                          <p className={`text-[12px] leading-relaxed font-medium ${done
                            ? 'text-slate-400 dark:text-slate-500 line-through decoration-slate-300/50 dark:decoration-white/10'
                            : isCurrent
                              ? 'text-slate-900 dark:text-white font-bold'
                              : 'text-slate-600 dark:text-slate-400'
                            }`}>
                            {q}
                          </p>
                        </div>
                      );
                    })}
                    {interviewPlan.length === 1 && (
                      <div className="flex items-center gap-3 p-2 opacity-50">
                        <div className="size-5 flex items-center justify-center">
                          <div className="size-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.3s]"></div>
                          <div className="size-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.15s] mx-0.5"></div>
                          <div className="size-1.5 rounded-full bg-slate-400 animate-bounce"></div>
                        </div>
                        <p className="text-[11px] font-medium text-slate-400">正在生成后续题单...</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col gap-2.5 px-1 py-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="size-5 rounded-md bg-slate-100 dark:bg-white/5 flex items-center justify-center animate-pulse">
                    <span className="material-symbols-outlined text-[14px] text-slate-400">query_builder</span>
                  </div>
                  <p className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider animate-pulse">
                    正在加载本场面试的题库...
                  </p>
                </div>
              </div>
              <div className="h-2 rounded-full bg-slate-100 dark:bg-white/5 overflow-hidden border border-slate-200/50 dark:border-white/5">
                <div className="h-full w-1/2 bg-slate-200 dark:bg-white/10 rounded-full animate-[shimmer_1.5s_infinite] shadow-[0_0_10px_rgba(255,255,255,0.1)]"></div>
              </div>
            </div>
          )}
        </div>
      )}

      <div
        ref={messagesContainerRef}
        onScroll={onMessagesScroll}
        className="flex-1 overflow-y-auto p-4 space-y-5 bg-slate-50 dark:bg-[#0b1219]"
        style={{
          paddingBottom: `${Math.max(100, inputBarHeight + 20) + keyboardOffset}px`,
        }}
      >
        {chatMessages.map((msg) => (
          <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div className={`flex ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'} w-full items-start`}>
              <div
                className={`size-9 rounded-full overflow-hidden shrink-0 shadow-sm ${msg.role === 'user' ? 'ml-3' : 'mr-3'}`}
              >
                <img
                  src={msg.role === 'user' ? userAvatar : (isInterviewMode ? aiAvatarUrl : MICRO_INTERVIEW_AVATAR)}
                  onError={(e) => {
                    if (msg.role !== 'user') (e.currentTarget as HTMLImageElement).src = AI_AVATAR_FALLBACK;
                  }}
                  alt="Avatar"
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="flex flex-col max-w-[75%] gap-2">
                {(msg.audioUrl || msg.audioPending) && (
                  <div className={`flex items-center gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <button
                      onClick={() => {
                        if (!audioPlayerRef.current) return;
                        if (!msg.audioUrl) return;
                        if (playingAudioId === msg.id) {
                          audioPlayerRef.current.pause();
                        } else {
                          setPlayingAudioId(msg.id);
                          audioPlayerRef.current.src = msg.audioUrl;
                          audioPlayerRef.current.play();
                        }
                      }}
                      disabled={!msg.audioUrl}
                      style={{ width: `${Math.min(180, 70 + (msg.audioDuration || 1) * 4)}px` }}
                      className={`group relative flex items-center px-3 h-11 rounded-lg shadow-sm active:scale-[0.98] transition-all overflow-hidden ${msg.role === 'user'
                        ? 'bg-primary text-white rounded-tr-none flex-row-reverse'
                        : 'bg-white dark:bg-[#2c2c2c] text-[#191919] dark:text-white rounded-tl-none border border-slate-200 dark:border-white/5'
                        }`}
                    >
                      <span
                        className={`material-symbols-outlined text-[20px] ${playingAudioId === msg.id ? 'animate-pulse' : ''} ${msg.role === 'user' ? 'rotate-180 -translate-x-1' : '-translate-x-1'
                          }`}
                      >
                        {!msg.audioUrl ? 'hourglass_top' : playingAudioId === msg.id ? 'volume_up' : 'signal_cellular_alt'}
                      </span>
                      {playingAudioId === msg.id && (
                        <div className="absolute inset-0 bg-black/5 flex items-center justify-center">
                          <div className="flex gap-0.5">
                            {[1, 2, 3].map((i) => (
                              <div
                                key={i}
                                className="w-0.5 h-3 bg-current animate-bounce"
                                style={{ animationDelay: `${i * 0.1}s` }}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                      {!msg.audioUrl && (
                        <div className="absolute inset-0 bg-black/0 flex items-center justify-center">
                          <div className="flex gap-0.5 opacity-80">
                            {[1, 2, 3].map((i) => (
                              <div
                                key={i}
                                className="w-0.5 h-3 bg-current animate-bounce"
                                style={{ animationDelay: `${i * 0.12}s` }}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </button>

                    <div className={`flex items-center gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                      <span className="text-[13px] font-medium text-slate-400 dark:text-slate-500 whitespace-nowrap">
                        {msg.audioDuration || 1}"
                      </span>
                      {(() => {
                        const hasBlob = hasVoiceBlob(msg.id);
                        const hasText = !!(msg.text && msg.text.trim() !== '' && msg.text !== '（语音）');
                        const isTranscribing = !!transcribingByMsgId[msg.id];
                        if (msg.role !== 'user' || !hasBlob || hasText) return null;
                        return (
                          <button
                            type="button"
                            disabled={isTranscribing}
                            onClick={() => transcribeExistingVoiceMessage(msg.id)}
                            className={`h-7 px-2.5 rounded-md text-[12px] font-bold border transition-colors ${isTranscribing
                              ? 'bg-slate-100 text-slate-400 border-slate-200 dark:bg-white/5 dark:text-slate-500 dark:border-white/10 cursor-not-allowed'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 active:scale-[0.98] dark:bg-white/5 dark:text-slate-200 dark:border-white/10 dark:hover:bg-white/10'
                              }`}
                          >
                            {isTranscribing ? (
                              <span className="material-symbols-outlined text-[16px] animate-spin h-4 flex items-center justify-center">
                                sync
                              </span>
                            ) : (
                              '转文字'
                            )}
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {msg.role === 'user' &&
                  (msg.audioUrl || msg.audioPending) &&
                  msg.text &&
                  msg.text.trim() !== '' &&
                  msg.text !== '（语音）' && (
                    <div className="flex flex-col items-end animate-in fade-in slide-in-from-top-1 duration-200 drop-shadow-sm">
                      <div className="px-4 py-2.5 bg-white dark:bg-[#1c2936] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-white/5 rounded-lg text-[15px] leading-relaxed shadow-sm max-w-full break-words">
                        {msg.text.replace(/[【\\[（]\\s*$/, '').trim()}
                      </div>
                    </div>
                  )}

                {msg.text &&
                  msg.text !== '（语音）' &&
                  msg.text.trim() !== '' &&
                  !(msg.role === 'user' && (msg.audioUrl || msg.audioPending)) && (
                    <div
                      className={`px-4 py-2.5 text-[15px] leading-relaxed shadow-sm rounded-lg whitespace-pre-wrap break-words ${msg.role === 'user'
                        ? 'bg-primary text-white rounded-tr-none'
                        : 'bg-white dark:bg-[#1c2936] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-white/5 rounded-tl-none'
                        }`}
                    >
                      {msg.role === 'model' ? (
                        (() => {
                          const parsed = parseReferenceReply(msg.text);
                          if (!parsed) return <div className="whitespace-pre-wrap">{msg.text}</div>;
                          const isExpanded = !!expandedReferences[msg.id];
                          return (
                            <div className="space-y-2">
                              {parsed.before && <div className="whitespace-pre-wrap">{parsed.before}</div>}
                              <button
                                onClick={() => setExpandedReferences((prev) => ({ ...prev, [msg.id]: !isExpanded }))}
                                className="text-xs font-semibold text-primary hover:text-primary/80 bg-primary/10 px-2.5 py-1.5 rounded-md inline-flex items-center gap-1.5 transition-colors border border-primary/20"
                              >
                                <span className="material-symbols-outlined text-[14px]">
                                  {isExpanded ? 'visibility_off' : 'visibility'}
                                </span>
                                {isExpanded ? '收起参考回复' : '查看参考回复'}
                              </button>
                              {isExpanded && (
                                <div className="text-[13px] leading-relaxed text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-black/20 rounded-lg p-3 border border-slate-200 dark:border-white/5 italic">
                                  {parsed.reference}
                                </div>
                              )}
                              {parsed.after && <div className="whitespace-pre-wrap">{parsed.after}</div>}
                            </div>
                          );
                        })()
                      ) : (
                        msg.text.replace(/[【\\[（]\\s*$/, '').trim()
                      )}
                    </div>
                  )}

                {shouldShowMessageFeedback(msg) && (
                  <div className="self-start px-1 w-full">
                    <ReportFeedback
                      variant="compact"
                      showTitle={false}
                      onFeedback={(rating, reason) => onMessageFeedback ? onMessageFeedback(msg, rating, reason) : false}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {(isSending || hasPendingReply) && !chatMessages.some((m) => m.id.startsWith('ai-stream')) && (
          <ThinkingIndicator avatarUrl={isInterviewMode ? aiAvatarUrl : MICRO_INTERVIEW_AVATAR} />
        )}

        <div ref={messagesEndRef} />
      </div>

      <div
        ref={inputBarRef}
        className="fixed left-0 right-0 bottom-0 z-[100] px-4 py-3 bg-white/80 dark:bg-[#1c2936]/80 backdrop-blur-lg border-t border-slate-200 dark:border-white/5"
        style={{
          paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
          transform: keyboardOffset > 0 ? `translateY(-${keyboardOffset}px)` : undefined,
          willChange: keyboardOffset > 0 ? 'transform' : undefined,
        }}
      >
        <div className="max-w-md mx-auto">
          {audioError && (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-red-500/80 backdrop-blur-md border border-red-400/30 px-4 py-3 animate-in fade-in slide-in-from-bottom-2 shadow-lg shadow-red-500/10">
              <div className="size-6 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-white text-[16px]">error</span>
              </div>
              <p className="flex-1 text-xs text-white font-bold">{audioError}</p>
              <button onClick={() => setAudioError('')} className="p-1 rounded-full hover:bg-white/10 transition-colors">
                <span className="material-symbols-outlined text-white text-[18px]">close</span>
              </button>
            </div>
          )}

          <div className="flex gap-3 items-end">
            {!isRecording && (
              <button
                onClick={toggleMode}
                disabled={inputMode === 'voice' && !audioSupported}
                className="size-11 rounded-full flex items-center justify-center transition-all shadow-sm shrink-0 bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10 disabled:opacity-50"
                type="button"
              >
                <span className="material-symbols-outlined text-[24px]">{inputMode === 'text' ? 'mic' : 'keyboard'}</span>
              </button>
            )}

            {inputMode === 'voice' ? (
              <div className="flex-1 relative">
                {isRecording && (
                  <div className="fixed inset-0 z-[105] bg-gradient-to-t from-black/80 via-black/40 to-transparent animate-in fade-in duration-300 pointer-events-none" />
                )}

                <div
                  className={`relative flex flex-col items-center transition-all duration-300 ${isRecording
                    ? 'fixed left-4 right-4 bottom-[calc(max(12px,env(safe-area-inset-bottom))+12px)] z-[110]'
                    : 'relative'
                    }`}
                >
                  {isRecording && (
                    <div className="absolute -left-20 -right-20 -bottom-24 h-96 bg-gradient-to-t from-black via-black via-50% to-transparent pointer-events-none" />
                  )}
                  {isRecording && (
                    <div
                      className={`relative z-[1] mb-4 text-[15px] font-medium tracking-wide transition-all animate-in fade-in slide-in-from-bottom-2 duration-200 ${holdCancel ? 'text-red-500' : 'text-white/90 shadow-sm'
                        }`}
                    >
                      {holdCancel ? '松手取消' : '松手发送 上移取消'}
                    </div>
                  )}

                  <button
                    ref={holdTalkBtnRef}
                    onPointerDown={onHoldPointerDown}
                    onPointerMove={onHoldPointerMove}
                    onPointerUp={onHoldPointerUp}
                    onPointerCancel={onHoldPointerCancel}
                    onContextMenu={(e) => e.preventDefault()}
                    disabled={!audioSupported}
                    className={`transition-all duration-300 select-none font-bold overflow-hidden touch-none ${isRecording
                      ? holdCancel
                        ? 'w-full h-[68px] rounded-[34px] bg-gradient-to-r from-red-500 to-rose-600 text-white border-transparent shadow-2xl scale-[1.02]'
                        : 'w-full h-[68px] rounded-[34px] bg-gradient-to-r from-blue-600 to-primary text-white border-transparent shadow-2xl scale-[1.02]'
                      : 'w-full h-[46px] rounded-2xl bg-slate-100 dark:bg-white/5 text-slate-900 dark:text-white border border-slate-200 dark:border-white/10'
                      } disabled:opacity-50 active:scale-[0.98] flex items-center justify-center`}
                    type="button"
                  >
                    {isRecording ? (
                      <div className="flex items-center justify-center w-full px-8 scale-125">
                        <WaveformVisualizer active={isRecording && !holdCancel} cancel={holdCancel} />
                      </div>
                    ) : (
                      <span className="text-[15px]">按住 说话</span>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <textarea
                  ref={textareaRef}
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="输入您的回答..."
                  disabled={isRecording}
                  className="flex-1 bg-slate-100 dark:bg-white/5 border-0 rounded-2xl px-4 py-3 placeholder:text-slate-400 focus:ring-2 focus:ring-primary/50 outline-none transition-all resize-none text-slate-900 dark:text-white disabled:opacity-60"
                  rows={1}
                  style={{ minHeight: '46px', maxHeight: '120px', lineHeight: '22px' }}
                />
                <button
                  onClick={() => handleSendMessage()}
                  disabled={!inputMessage.trim() || isRecording}
                  className="size-11 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 disabled:opacity-50 transition-all shadow-lg shadow-primary/20 shrink-0"
                  type="button"
                >
                  <span className="material-symbols-outlined text-[22px]">send</span>
                </button>
              </>
            )}
          </div>

          {!isKeyboardOpen && (
            <AiDisclaimer className="mt-2 animate-in fade-in duration-300" />
          )}
        </div>
      </div>

      <audio
        ref={audioPlayerRef}
        className="hidden"
        onEnded={() => setPlayingAudioId(null)}
        onPause={() => setPlayingAudioId(null)}
      />
    </div>
  );
};

export default ChatPage;
