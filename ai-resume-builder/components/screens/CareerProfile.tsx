import React from 'react';
import { View } from '../../types';
import BackButton from '../shared/BackButton';
import { useAppContext } from '../../src/app-context';
import { useUserProfile } from '../../src/useUserProfile';
import { useCareerProfileComposer } from './dashboard/useCareerProfileComposer';
import { useCareerProfileVoiceInput } from './career-profile/useCareerProfileVoiceInput';

const MIN_INPUT_LENGTH = 20;

const formatDateText = (value: string) => {
  const text = String(value || '').trim();
  if (!text) return '';
  const time = Date.parse(text);
  if (!Number.isFinite(time)) return text;
  return new Date(time).toLocaleDateString('zh-CN');
};

const CareerProfile: React.FC = () => {
  const currentUser = useAppContext((state) => state.currentUser);
  const goBack = useAppContext((state) => state.goBack);
  const navigateToView = useAppContext((state) => state.navigateToView);
  const { userProfile } = useUserProfile(currentUser?.id, currentUser);
  const {
    summary,
    experienceCount,
    updatedAt,
    initialText,
    isSaving,
    error,
    hint,
    saveCareerProfile,
  } = useCareerProfileComposer({
    currentUserId: currentUser?.id,
    userProfile,
  });

  const [inputText, setInputText] = React.useState('');
  const inputInitializedRef = React.useRef(false);
  React.useEffect(() => {
    if (inputInitializedRef.current) return;
    const seedText = String(initialText || '').trim();
    if (!seedText) return;
    setInputText(seedText);
    inputInitializedRef.current = true;
  }, [initialText]);

  const {
    audioSupported,
    isRecording,
    isTranscribing,
    voiceError,
    voiceHint,
    startRecording,
    stopRecording,
  } = useCareerProfileVoiceInput({
    onTranscript: (text) => {
      setInputText((prev) => {
        const prefix = String(prev || '').trim();
        if (!prefix) return text;
        return `${prefix}\n${text}`;
      });
    },
  });

  const trimmedInputLength = String(inputText || '').trim().length;
  const remainingChars = Math.max(0, MIN_INPUT_LENGTH - trimmedInputLength);
  const isInputTooShort = trimmedInputLength < MIN_INPUT_LENGTH;

  const handleSubmit = async () => {
    const text = String(inputText || '').trim();
    if (!text || text.length < MIN_INPUT_LENGTH || isSaving) return;
    const saved = await saveCareerProfile(text);
    if (saved) {
      setInputText('');
      inputInitializedRef.current = true;
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background-light dark:bg-background-dark animate-in fade-in duration-300">
      <header className="fixed top-0 left-0 right-0 mx-auto w-full max-w-md z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-white/5">
        <div className="flex items-center justify-between h-14 px-4 relative">
          <BackButton onClick={goBack} className="-ml-2" />
          <h1 className="text-lg font-bold tracking-tight">我的职业百科</h1>
          <div className="w-10" />
        </div>
      </header>

      <main className="pt-[72px] p-4 pb-[calc(5.75rem+env(safe-area-inset-bottom))] flex flex-col gap-5">
        <div className="rounded-2xl bg-white dark:bg-surface-dark border border-slate-200/80 dark:border-white/10 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black tracking-[0.18em] uppercase text-primary">目前进度</p>
              <h2 className="text-base font-black text-slate-900 dark:text-white mt-1">
                {summary ? '你的职业百科已小有雏形！' : '快来建立属于你的职业百科吧'}
              </h2>
            </div>
            <span className="material-symbols-outlined text-primary text-[28px]">waving_hand</span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2.5 leading-relaxed">
            {summary
              ? `太棒了！AI 已经帮你记下了 ${Math.max(0, Number(experienceCount || 0))} 个重要的工作亮点。上次更新：${formatDateText(updatedAt) || '刚刚'}`
              : '把所有工作细节、踩过的坑、带过的项目放心地倒给我吧。我来帮你梳理出漂亮的能力图谱和匹配亮点！'}
          </p>
          <button
            type="button"
            onClick={() => navigateToView(View.CAREER_PROFILE_RESULT)}
            className="mt-3 w-full h-10 rounded-xl border border-primary/20 bg-primary/5 text-primary text-sm font-bold hover:bg-primary/10 transition-colors"
          >
            {summary ? '去看看 AI 整理好的百科卡片' : '去我的职业百科主页看看'}
          </button>
        </div>

        <div className="rounded-2xl bg-white dark:bg-surface-dark border border-slate-200/80 dark:border-white/10 p-4 shadow-sm">
          <div className="mb-2">
            <label className="text-sm font-bold text-slate-800 dark:text-slate-200">聊聊你的工作经历吧</label>
          </div>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="随便写，别管格式！比如：“21年我在某电商负责产品增长，搞了个 A/B 测试体系，其实那时候我还带了几个实习生把转化率拉高了 15%，不过简历上没好意思写这段...”"
            className="w-full min-h-[220px] resize-none rounded-lg border bg-slate-50 dark:bg-[#111a22] border-slate-300 dark:border-[#334155] text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 px-4 py-3 text-sm leading-relaxed outline-none transition-all focus:ring-2 focus:ring-primary focus:border-transparent"
          />
          <div className="mt-2 flex items-center justify-end gap-2 text-xs">
            <span className={isInputTooShort ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}>
              {isInputTooShort ? `还差 ${remainingChars} 字才可保存` : '字数已达标，可以保存'}
            </span>
            <span className="text-slate-300 dark:text-slate-600">|</span>
            <span className="text-slate-500 dark:text-slate-400">
              已聊了 {trimmedInputLength} 个字
            </span>
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-surface-dark border border-slate-200/80 dark:border-white/10 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200">语音讲述经历</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-[200px] leading-relaxed">
                {audioSupported ? '像和老朋友聊天一样，把你的高光时刻讲给 AI 听，随时点击即可开始。' : '当前浏览器暂不支持语音权限，请使用文本录入。'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (isRecording) {
                  stopRecording();
                  return;
                }
                void startRecording();
              }}
              disabled={!audioSupported || isTranscribing || isSaving}
              className={`px-4 py-2.5 rounded-xl shrink-0 text-sm font-bold transition-all ${isRecording
                ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/25'
                : 'bg-primary text-white shadow-lg shadow-primary/25'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isTranscribing ? '静默提炼中...' : isRecording ? '结束录音' : '开启录音'}
            </button>
          </div>
          {!!voiceHint && (
            <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50/80 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-400/20 rounded-lg px-2.5 py-2">
              {voiceHint}
            </p>
          )}
          {!!voiceError && (
            <p className="mt-2 text-xs text-rose-700 dark:text-rose-300 bg-rose-50/80 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-400/20 rounded-lg px-2.5 py-2">
              {voiceError}
            </p>
          )}
        </div>

        {!!hint && (
          <p className="text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50/80 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-400/20 rounded-lg px-3 py-2">
            {hint}
          </p>
        )}
        {!!error && (
          <p className="text-xs text-rose-700 dark:text-rose-300 bg-rose-50/80 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-400/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="sticky bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-30 mt-1">
          <button
            type="button"
            onClick={() => { void handleSubmit(); }}
            disabled={isSaving || isTranscribing || isInputTooShort}
            className="w-full py-3 rounded-xl bg-primary text-white text-sm font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-600 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSaving ? 'AI 正在疯狂记重点并分类...' : '交给 AI 帮你整理和提炼'}
          </button>
        </div>
      </main>
    </div >
  );
};

export default CareerProfile;
