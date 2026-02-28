import React from 'react';
import BackButton from '../shared/BackButton';
import { useAppContext } from '../../src/app-context';
import { useUserProfile } from '../../src/useUserProfile';
import { useCareerProfileComposer } from './dashboard/useCareerProfileComposer';
import CareerProfileStructuredEditor from './career-profile/CareerProfileStructuredEditor';

const formatDateText = (value: string) => {
  const text = String(value || '').trim();
  if (!text) return '';
  const time = Date.parse(text);
  if (!Number.isFinite(time)) return text;
  return new Date(time).toLocaleDateString('zh-CN');
};

const CareerProfileResult: React.FC = () => {
  const currentUser = useAppContext((state) => state.currentUser);
  const goBack = useAppContext((state) => state.goBack);
  const { userProfile } = useUserProfile(currentUser?.id, currentUser);
  const {
    profile,
    experienceCount,
    updatedAt,
    isSaving,
    error,
    hint,
    saveStructuredCareerProfile,
  } = useCareerProfileComposer({
    currentUserId: currentUser?.id,
    userProfile,
  });

  return (
    <div className="flex flex-col min-h-screen bg-background-light dark:bg-background-dark animate-in fade-in duration-300">
      <header className="fixed top-0 left-0 right-0 mx-auto w-full max-w-md z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-white/5">
        <div className="flex items-center justify-between h-14 px-4 relative">
          <BackButton onClick={goBack} className="-ml-2" />
          <h1 className="text-base font-black tracking-tight">AI 整理结果</h1>
          <div className="w-10" />
        </div>
      </header>

      <main className="pt-[72px] p-4 pb-[calc(5.75rem+env(safe-area-inset-bottom))] flex flex-col gap-5">
        <div className="rounded-2xl bg-white dark:bg-surface-dark border border-slate-200/80 dark:border-white/10 p-4 shadow-sm">
          <p className="text-[11px] font-black tracking-[0.18em] uppercase text-primary">结果校对</p>
          <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">
            这里展示 AI 整理出的职业画像，你可以逐项修改后再保存。
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
            当前共 {Math.max(0, Number(experienceCount || 0))} 条经历事实，最近更新：{formatDateText(updatedAt) || '暂无'}
          </p>
        </div>

        <CareerProfileStructuredEditor
          profile={profile}
          isSaving={isSaving}
          onSave={async (draft) => {
            await saveStructuredCareerProfile(draft);
          }}
        />

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
      </main>
    </div>
  );
};

export default CareerProfileResult;
