import React from 'react';
import type { ChatMessage } from './types';

type ParsedReference = { before?: string; reference: string; after?: string };

const AI_AVATAR_URL = '/ai-avatar.png';
const AI_AVATAR_FALLBACK =
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Hiroshi&top=shortHair&clothing=blazerAndShirt';

export type ChatPageProps = {
  ToastOverlay: React.ComponentType;
  WaveformVisualizer: React.ComponentType<{ active: boolean; cancel: boolean }>;

  handleStepBack: () => void;
  onEndInterview: () => void;

  userAvatar: string;
  chatMessages: ChatMessage[];
  isSending: boolean;
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
};

const ChatPage: React.FC<ChatPageProps> = ({
  ToastOverlay,
  WaveformVisualizer,
  handleStepBack,
  onEndInterview,
  userAvatar,
  chatMessages,
  isSending,
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
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = AI_AVATAR_FALLBACK;
              }}
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

        <button
          type="button"
          disabled={isRecording || isSending}
          onClick={() => {
            if (isRecording || isSending) return;
            const confirmed = window.confirm('确认结束面试并生成总结吗？');
            if (!confirmed) return;
            try {
              onEndInterview();
            } catch {
              // ignore
            }
          }}
          className="h-9 px-3 rounded-lg text-[13px] font-bold border border-slate-200 dark:border-white/10 bg-white/80 dark:bg-white/5 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="结束面试并生成综合分析"
        >
          结束面试
        </button>
      </div>

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
                  src={msg.role === 'user' ? userAvatar : AI_AVATAR_URL}
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
                      className={`group relative flex items-center px-3 h-11 rounded-lg shadow-sm active:scale-[0.98] transition-all overflow-hidden ${
                        msg.role === 'user'
                          ? 'bg-primary text-white rounded-tr-none flex-row-reverse'
                          : 'bg-white dark:bg-[#2c2c2c] text-[#191919] dark:text-white rounded-tl-none border border-slate-200 dark:border-white/5'
                      }`}
                    >
                      <span
                        className={`material-symbols-outlined text-[20px] ${playingAudioId === msg.id ? 'animate-pulse' : ''} ${
                          msg.role === 'user' ? 'rotate-180 -translate-x-1' : '-translate-x-1'
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
                            className={`h-7 px-2.5 rounded-md text-[12px] font-bold border transition-colors ${
                              isTranscribing
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
                      className={`px-4 py-2.5 text-[15px] leading-relaxed shadow-sm rounded-lg whitespace-pre-wrap break-words ${
                        msg.role === 'user'
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
              </div>
            </div>
          </div>
        ))}

        {isSending && (
          <div className="flex justify-start">
            <div className="size-8 rounded-full overflow-hidden shrink-0 mr-2 mt-1 shadow-sm">
              <img
                src={AI_AVATAR_URL}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = AI_AVATAR_FALLBACK;
                }}
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
                  className={`relative flex flex-col items-center transition-all duration-300 ${
                    isRecording
                      ? 'fixed left-4 right-4 bottom-[calc(max(12px,env(safe-area-inset-bottom))+12px)] z-[110]'
                      : 'relative'
                  }`}
                >
                  {isRecording && (
                    <div className="absolute -left-20 -right-20 -bottom-24 h-96 bg-gradient-to-t from-black via-black via-50% to-transparent pointer-events-none" />
                  )}
                  {isRecording && (
                    <div
                      className={`relative z-[1] mb-4 text-[15px] font-medium tracking-wide transition-all animate-in fade-in slide-in-from-bottom-2 duration-200 ${
                        holdCancel ? 'text-red-500' : 'text-white/90 shadow-sm'
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
                    className={`transition-all duration-300 select-none font-bold overflow-hidden touch-none ${
                      isRecording
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
                  placeholder="输入您的问题..."
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
            <div className="mt-2 text-center animate-in fade-in duration-300">
              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium opacity-80">内容由AI生成，请注意核实</p>
            </div>
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
