import React from 'react';

type Props = {
  summary: string;
  experienceCount: number;
  updatedAt: string;
  onOpen: () => void;
};

const formatDateText = (value: string) => {
  const text = String(value || '').trim();
  if (!text) return '';
  const t = Date.parse(text);
  if (!Number.isFinite(t)) return text;
  return new Date(t).toLocaleDateString('zh-CN');
};

const CareerProfileEntryCard: React.FC<Props> = ({
  summary,
  experienceCount,
  updatedAt,
  onOpen,
}) => {
  const hasProfile = Boolean(summary);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative w-full text-left rounded-2xl border border-slate-200/60 dark:border-white/5 bg-gradient-to-br from-white to-slate-50/50 dark:from-surface-dark dark:to-surface-dark/90 p-5 shadow-sm hover:shadow-xl hover:shadow-primary/5 hover:border-primary/20 hover:-translate-y-0.5 transition-all duration-300 ease-out active:scale-[0.98] overflow-hidden"
    >
      {/* Decorative gradient orb for hover state */}
      <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary/5 dark:bg-primary/10 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0 z-10">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] font-black tracking-[0.2em] uppercase text-primary dark:text-primary-light">
              我的职业百科
            </span>
            {hasProfile && (
              <span className="inline-flex m-0 p-0 relative flex-shrink-0 size-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/60 opacity-75"></span>
                <span className="relative inline-flex rounded-full size-2 bg-primary"></span>
              </span>
            )}
          </div>
          <h3 className="text-lg font-black text-slate-800 dark:text-white leading-tight group-hover:text-primary dark:group-hover:text-primary-light transition-colors duration-300">
            {hasProfile ? '来更新一下最近的高光时刻？' : '快来建立属于你的职业百科'}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 line-clamp-2 min-h-[40px] leading-relaxed">
            {hasProfile
              ? summary
              : '把工作细节和高光时刻倒给我，我帮你整理出最强能力图谱，让后续职位匹配和简历优化更精准！'}
          </p>
        </div>

        <div className="relative size-12 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-primary/10 dark:to-primary/5 border border-blue-100/50 dark:border-primary/20 flex items-center justify-center shrink-0 z-10 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300 shadow-inner">
          <span className="material-symbols-outlined text-primary text-[26px]">person_check</span>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between text-xs font-medium text-slate-400 dark:text-slate-500 z-10 relative">
        <span className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[14px]">history_edu</span>
          {hasProfile
            ? `已帮你记下了 ${Math.max(0, Number(experienceCount || 0))} 个闪光点`
            : '百科还能帮你查漏补缺'}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[14px]">update</span>
          {hasProfile ? `更新于 ${formatDateText(updatedAt) || '刚刚'}` : '马上去聊聊'}
        </span>
      </div>
    </button>
  );
};

export default CareerProfileEntryCard;
