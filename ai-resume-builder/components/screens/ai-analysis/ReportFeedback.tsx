import React from 'react';

type FeedbackRating = 'up' | 'down';

type Props = {
  onFeedback?: (rating: FeedbackRating, reason?: string) => Promise<boolean> | boolean;
  title?: string;
  className?: string;
  showTitle?: boolean;
  variant?: 'default' | 'compact';
};

const downFeedbackBaseReasons = [
  '应用出现问题',
  '个性化设置问题',
  '与事实不符',
  '与指令不符',
  '更多...',
  '其他',
];

const downFeedbackMoreReasons = [
  '令人反感/不安全',
  '语言有误',
  '存在有害行为',
];

const ReportFeedback: React.FC<Props> = ({
  onFeedback,
  title = '报告质量反馈',
  className = '',
  showTitle = true,
  variant = 'default',
}) => {
  const [feedback, setFeedback] = React.useState<FeedbackRating | null>(null);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = React.useState(false);
  const [showDownFeedbackList, setShowDownFeedbackList] = React.useState(false);
  const [showDownFeedbackMore, setShowDownFeedbackMore] = React.useState(false);
  const [showDownOtherInput, setShowDownOtherInput] = React.useState(false);
  const [downOtherInput, setDownOtherInput] = React.useState('');

  const submitFeedback = React.useCallback(async (next: FeedbackRating, reason?: string) => {
    const nextValue = feedback === next ? null : next;
    setFeedback(nextValue);
    if (!nextValue || !onFeedback) return;
    setIsSubmittingFeedback(true);
    try {
      const ok = await onFeedback(nextValue, reason);
      if (ok === false) {
        setFeedback(feedback);
        return;
      }
      if (nextValue === 'up') {
        setShowDownFeedbackList(false);
        setShowDownFeedbackMore(false);
        setShowDownOtherInput(false);
        setDownOtherInput('');
      }
    } finally {
      setIsSubmittingFeedback(false);
    }
  }, [feedback, onFeedback]);

  const handleFeedbackClick = async (next: FeedbackRating) => {
    if (next === 'down') {
      setShowDownOtherInput(false);
      setShowDownFeedbackMore(false);
      setShowDownFeedbackList((v) => !v);
      setFeedback((prev) => (prev === 'down' ? null : 'down'));
      return;
    }
    await submitFeedback('up');
  };

  const handleDownReasonSelect = async (reason: string) => {
    if (reason === '更多...') {
      setShowDownFeedbackMore(true);
      return;
    }
    if (reason === '其他') {
      setShowDownOtherInput(true);
      return;
    }
    await submitFeedback('down', reason);
    setShowDownFeedbackList(false);
    setShowDownFeedbackMore(false);
    setShowDownOtherInput(false);
    setDownOtherInput('');
  };

  const handleSubmitDownOtherFeedback = async () => {
    const value = String(downOtherInput || '').trim();
    if (!value) return;
    await submitFeedback('down', `其他:${value}`);
    setShowDownFeedbackList(false);
    setShowDownFeedbackMore(false);
    setShowDownOtherInput(false);
    setDownOtherInput('');
  };

  if (!onFeedback) return null;

  const isCompact = variant === 'compact';

  return (
    <div className={`flex flex-col ${isCompact ? 'gap-2' : 'gap-4'} ${className}`.trim()}>
      <div className={`flex items-center ${showTitle ? 'justify-between' : 'justify-start'} ${isCompact ? 'gap-2' : 'gap-3'}`}>
        {showTitle && <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{title}</span>}
        <div className={`flex items-center ${isCompact ? 'gap-2' : 'gap-3'}`}>
          <button
            type="button"
            onClick={() => { void handleFeedbackClick('up'); }}
            disabled={isSubmittingFeedback}
            className={`${isCompact ? 'size-7 rounded-lg' : 'size-9 rounded-xl border-2'} border flex items-center justify-center transition-all active:scale-95 ${feedback === 'up'
              ? 'border-emerald-500 bg-emerald-500 text-white'
              : 'border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-400 hover:text-emerald-500 hover:border-emerald-500/30'
              } ${isSubmittingFeedback ? 'opacity-60 cursor-not-allowed' : ''}`}
            aria-label="点赞"
          >
            <span className={`material-symbols-outlined ${isCompact ? 'text-[16px]' : 'text-[18px]'}`}>thumb_up</span>
          </button>
          <button
            type="button"
            onClick={() => { void handleFeedbackClick('down'); }}
            disabled={isSubmittingFeedback}
            className={`${isCompact ? 'size-7 rounded-lg' : 'size-9 rounded-xl border-2'} border flex items-center justify-center transition-all active:scale-95 ${feedback === 'down'
              ? 'border-rose-500 bg-rose-500 text-white'
              : 'border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-400 hover:text-rose-500 hover:border-rose-500/30'
              } ${isSubmittingFeedback ? 'opacity-60 cursor-not-allowed' : ''}`}
            aria-label="点踩"
          >
            <span className={`material-symbols-outlined ${isCompact ? 'text-[16px]' : 'text-[18px]'}`}>thumb_down</span>
          </button>
        </div>
      </div>

      {showDownFeedbackList && (
        <div className={`${isCompact ? 'w-full max-w-[320px]' : 'w-full'} rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111827] shadow-sm overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200`}>
          {showDownOtherInput ? (
            <div className="p-3 space-y-2">
              <textarea
                value={downOtherInput}
                onChange={(e) => setDownOtherInput(e.target.value)}
                placeholder="提供更详细的反馈意见"
                rows={3}
                className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-black/20 text-[13px] text-slate-700 dark:text-slate-100 px-3 py-2 outline-none focus:border-primary/50"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowDownOtherInput(false)}
                  className="px-3 py-1.5 text-[12px] font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  返回
                </button>
                <button
                  type="button"
                  disabled={!String(downOtherInput || '').trim() || isSubmittingFeedback}
                  onClick={() => { void handleSubmitDownOtherFeedback(); }}
                  className="px-3 py-1.5 rounded-md text-[12px] font-semibold bg-primary text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  提交
                </button>
              </div>
            </div>
          ) : (
            <>
              {[
                ...downFeedbackBaseReasons.filter((r) => r !== '更多...' && r !== '其他'),
                ...(showDownFeedbackMore ? downFeedbackMoreReasons : ['更多...']),
                '其他',
              ].map((reason) => (
                <button
                  key={`report-feedback-${reason}`}
                  type="button"
                  disabled={isSubmittingFeedback}
                  onClick={() => { void handleDownReasonSelect(reason); }}
                  className="w-full text-left px-3.5 py-2.5 text-[13px] font-semibold text-slate-700 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-white/5 border-b border-slate-100 dark:border-white/5 last:border-b-0 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {reason}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ReportFeedback;
