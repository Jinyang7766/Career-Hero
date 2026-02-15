import React from 'react';
import type { ChatMessage } from './types';

type ParsedReference = { before?: string; reference: string; after?: string };

const AI_AVATAR_URL = '/ai-avatar.png';
const AI_AVATAR_FALLBACK = 'https://api.dicebear.com/7.x/avataaars/svg?seed=Hiroshi&top=shortHair&clothing=blazerAndShirt';

export type ChatPageProps = {
  ToastOverlay: React.ComponentType;
  WaveformVisualizer: React.ComponentType<{ active: boolean; cancel: boolean }>;
  handleStepBack: () => void;

  chatMessages: ChatMessage[];
  isSending: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;

  expandedReferences: Record<string, boolean>;
  setExpandedReferences: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  parseReferenceReply: (text: string) => ParsedReference | null;

  keyboardOffset: number;
  inputBarHeight: number;
  inputBarRef: React.RefObject<HTMLDivElement | null>;

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

  onHoldPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onHoldPointerMove: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onHoldPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onHoldPointerCancel: (e: React.PointerEvent<HTMLButtonElement>) => void;
};

const ChatPage: React.FC<ChatPageProps> = ({
  ToastOverlay,
  WaveformVisualizer,
  handleStepBack,
  chatMessages,
  isSending,
  messagesEndRef,
  expandedReferences,
  setExpandedReferences,
  parseReferenceReply,
  keyboardOffset,
  inputBarHeight,
  inputBarRef,
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
  onHoldPointerDown,
  onHoldPointerMove,
  onHoldPointerUp,
  onHoldPointerCancel,
}) => {
  return (
    <div className="fixed inset-0 z-[100] bg-slate-50 dark:bg-[#0b1219] flex flex-col animate-in slide-in-from-right duration-300 overflow-hidden">
      <ToastOverlay />

      <div className="flex items-center justify-between p-4 bg-white/80 dark:bg-[#1c2936]/80 backdrop-blur-md border-b border-slate-200 dark:border-white/5 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <button onClick={handleStepBack} className="p-1 -ml-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10">
            <span className="material-symbols-outlined text-slate-900 dark:text-white">arrow_back</span>
          </button>
          <div className="size-10 rounded-full overflow-hidden">
            <img
              src={AI_AVATAR_URL}
              onError={(e) => { (e.currentTarget as HTMLImageElement).src = AI_AVATAR_FALLBACK; }}
              alt="AI Agent"
            />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white leading-tight">AI 模拟面试官</h3>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">在线</span>
            </div>
          </div>
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto p-4 space-y-5 bg-slate-50 dark:bg-[#0b1219]"
        style={{
          paddingBottom: `${Math.max(100, inputBarHeight + 20) + keyboardOffset}px`,
        }}
      >
        {chatMessages.map((msg) => (
          <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} w-full`}>
              {msg.role === 'model' && (
                <div className="size-8 rounded-full overflow-hidden shrink-0 mr-2 mt-1 shadow-sm">
                  <img
                    src={AI_AVATAR_URL}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).src = AI_AVATAR_FALLBACK; }}
                    alt="AI Agent"
                  />
                </div>
              )}
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${msg.role === 'user'
                  ? 'bg-primary text-white rounded-br-none'
                  : 'bg-slate-100 dark:bg-[#1c2936] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-white/5 rounded-bl-none'
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
                          className="text-xs font-semibold text-primary hover:text-primary/80 bg-primary/10 px-2 py-1 rounded-full inline-flex items-center gap-1 transition-colors"
                        >
                          <span className="material-symbols-outlined text-[14px]">
                            {isExpanded ? 'visibility_off' : 'visibility'}
                          </span>
                          {isExpanded ? '收起参考回复' : '查看参考回复'}
                        </button>
                        {isExpanded && (
                          <div className="text-[13px] leading-relaxed text-slate-700 dark:text-slate-200 bg-white/60 dark:bg-white/5 rounded-xl p-3 border border-primary/20 italic">
                            {parsed.reference}
                          </div>
                        )}
                        {parsed.after && <div className="whitespace-pre-wrap">{parsed.after}</div>}
                      </div>
                    );
                  })()
                ) : (
                  <div className="space-y-2">
                    {msg.audioUrl && (
                      <div className="flex items-center gap-2 bg-black/10 rounded-lg p-2 mb-1">
                        <span className="material-symbols-outlined text-[18px]">mic</span>
                        <audio src={msg.audioUrl} controls className="h-8 max-w-[180px]" />
                      </div>
                    )}
                    <div className="whitespace-pre-wrap">{msg.text}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {isSending && (
          <div className="flex justify-start">
            <div className="size-8 rounded-full overflow-hidden shrink-0 mr-2 mt-1 shadow-sm">
              <img
                src={AI_AVATAR_URL}
                onError={(e) => { (e.currentTarget as HTMLImageElement).src = AI_AVATAR_FALLBACK; }}
                alt="AI Agent"
              />
            </div>
            <div className="bg-white dark:bg-[#1c2936] rounded-2xl rounded-bl-none px-4 py-3 border border-slate-200 dark:border-white/5 shadow-sm">
              <div className="flex gap-1.5">
                <span className="size-1.5 bg-slate-400 rounded-full animate-bounce"></span>
                <span className="size-1.5 bg-slate-400 rounded-full animate-bounce delay-100"></span>
                <span className="size-1.5 bg-slate-400 rounded-full animate-bounce delay-200"></span>
              </div>
            </div>
          </div>
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
            <div className="mb-3 flex items-center justify-between gap-2 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-3 py-2 animate-in fade-in slide-in-from-bottom-2">
              <span className="material-symbols-outlined text-red-500 text-[18px]">error</span>
              <p className="flex-1 text-xs text-red-600 dark:text-red-400 font-medium">{audioError}</p>
              <button
                onClick={() => setAudioError('')}
                className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/5"
                type="button"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>
          )}

          <div className="flex gap-3 items-end">
            {!isRecording && (
              <button
                onClick={toggleMode}
                disabled={isSending || (inputMode === 'voice' && !audioSupported)}
                className="size-11 rounded-full flex items-center justify-center transition-all shadow-sm shrink-0 bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10 disabled:opacity-50"
                type="button"
              >
                <span className="material-symbols-outlined text-[24px]">{inputMode === 'text' ? 'mic' : 'keyboard'}</span>
              </button>
            )}

            {inputMode === 'voice' ? (
              <div className="flex-1 relative">
                {isRecording && (
                  <div className="fixed inset-0 z-[-1] bg-gradient-to-t from-black/80 via-black/40 to-transparent animate-in fade-in duration-300 pointer-events-none" />
                )}

                <div className={`flex flex-col items-center transition-all duration-300 ${isRecording ? 'relative z-[110]' : ''}`}>
                  {isRecording && (
                    <div
                      className={`mb-6 text-[15px] font-medium tracking-wide transition-all animate-in fade-in slide-in-from-bottom-2 duration-200 ${holdCancel ? 'text-red-400' : 'text-white/90'
                        }`}
                    >
                      {holdCancel ? '松手取消' : '松手发送 上移取消'}
                    </div>
                  )}

                  <button
                    onPointerDown={onHoldPointerDown}
                    onPointerMove={onHoldPointerMove}
                    onPointerUp={onHoldPointerUp}
                    onPointerCancel={onHoldPointerCancel}
                    onContextMenu={(e) => e.preventDefault()}
                    disabled={!audioSupported || isSending}
                    className={`transition-all duration-300 select-none font-bold overflow-hidden touch-none ${isRecording
                      ? holdCancel
                        ? 'fixed left-4 right-4 bottom-[calc(max(12px,env(safe-area-inset-bottom))+12px)] h-[68px] rounded-[34px] bg-gradient-to-r from-red-500 to-rose-600 text-white border-transparent shadow-2xl scale-[1.02]'
                        : 'fixed left-4 right-4 bottom-[calc(max(12px,env(safe-area-inset-bottom))+12px)] h-[68px] rounded-[34px] bg-gradient-to-r from-blue-600 to-primary text-white border-transparent shadow-2xl scale-[1.02]'
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
                      if (!isSending) handleSendMessage();
                    }
                  }}
                  placeholder="输入您的问题..."
                  className="flex-1 bg-slate-100 dark:bg-white/5 border-0 rounded-2xl px-4 py-3 placeholder:text-slate-400 focus:ring-2 focus:ring-primary/50 outline-none transition-all resize-none text-slate-900 dark:text-white"
                  rows={1}
                  style={{ minHeight: '46px', maxHeight: '120px', lineHeight: '22px' }}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!inputMessage.trim() || isSending || isRecording}
                  className="size-11 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 disabled:opacity-50 transition-all shadow-lg shadow-primary/20 shrink-0"
                  type="button"
                >
                  <span className="material-symbols-outlined text-[22px]">send</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
