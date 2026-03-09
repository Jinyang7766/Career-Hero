import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import BackButton from '../../shared/BackButton';
import type { ResumeData } from '../../../types';
import { useAppContext } from '../../../src/app-context';
import { useUserProfile } from '../../../src/useUserProfile';
import { useCareerProfileComposer } from '../dashboard/useCareerProfileComposer';
import { buildCareerProfileSeedFromImportedResume } from './resume-upload-prefill';
import type { FollowupPrompt } from './profile-followup-prompts';
import {
  FOLLOWUP_PROGRESS_KEY,
  FOLLOWUP_SESSION_KEY,
  getScopedFusionStorageKey,
  readFusionFollowupSession,
  writeFusionFollowupProgress,
  writeFusionFollowupSession,
} from './fusion-storage';
import { computeFollowupCardStatuses } from './followup-card-status';
import {
  buildFollowupAnswerBlocks,
  clampFollowupIndex,
  getAutoAdvanceIndex,
  moveFollowupIndex,
} from './followup-workflow';

type ImportedResume = Omit<ResumeData, 'id'>;

const mergeBlocks = (blocks: Array<string | null | undefined>): string =>
  blocks
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .join('\n\n');

const GuidedCareerProfileFollowupStep: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const currentUser = useAppContext((state) => state.currentUser);
  const goBack = useAppContext((state) => state.goBack);
  const { userProfile } = useUserProfile(currentUser?.id, currentUser);
  const { isSaving, saveCareerProfile } = useCareerProfileComposer({
    currentUserId: currentUser?.id,
    userProfile,
  });

  const followupProgressKey = React.useMemo(() => {
    const userId = String(currentUser?.id || '').trim();
    if (!userId) return '';
    return getScopedFusionStorageKey(FOLLOWUP_PROGRESS_KEY, userId);
  }, [currentUser?.id]);

  const followupSessionKey = React.useMemo(() => {
    const userId = String(currentUser?.id || '').trim();
    if (!userId) return '';
    return getScopedFusionStorageKey(FOLLOWUP_SESSION_KEY, userId);
  }, [currentUser?.id]);

  const [hydrated, setHydrated] = React.useState(false);
  const [sourcePath, setSourcePath] = React.useState('/career-profile/upload');
  const [supplementText, setSupplementText] = React.useState('');
  const [uploadedResumeTitle, setUploadedResumeTitle] = React.useState('');
  const [uploadedResume, setUploadedResume] = React.useState<ImportedResume | null>(null);
  const [prompts, setPrompts] = React.useState<FollowupPrompt[]>([]);
  const [answersByPromptId, setAnswersByPromptId] = React.useState<Record<string, string>>({});
  const [draftByPromptId, setDraftByPromptId] = React.useState<Record<string, string>>({});
  const [skippedPromptIds, setSkippedPromptIds] = React.useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [isInputFocused, setIsInputFocused] = React.useState(false);
  const [swipeFeedback, setSwipeFeedback] = React.useState('');

  const touchStartX = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (!followupSessionKey) return;

    const stateSession = (location.state as any)?.followupSession;
    if (stateSession && typeof stateSession === 'object') {
      writeFusionFollowupSession(followupSessionKey, stateSession);
    }

    const snapshot = readFusionFollowupSession(followupSessionKey);
    if (!snapshot) {
      navigate('/career-profile/upload', { replace: true });
      return;
    }

    setSourcePath(String(snapshot.sourcePath || '/career-profile/upload').trim() || '/career-profile/upload');
    setSupplementText(String(snapshot.supplementText || ''));
    setUploadedResumeTitle(String(snapshot.uploadedResumeTitle || ''));
    setUploadedResume((snapshot.uploadedResume || null) as ImportedResume | null);
    setPrompts(snapshot.prompts as FollowupPrompt[]);
    setAnswersByPromptId(snapshot.answersByPromptId || {});
    setDraftByPromptId(snapshot.draftByPromptId || {});
    setSkippedPromptIds(snapshot.skippedPromptIds || []);
    setCurrentIndex(clampFollowupIndex(snapshot.currentIndex, snapshot.prompts.length));
    setHydrated(true);
  }, [followupSessionKey, location.state, navigate]);

  const total = prompts.length;
  const activeIndex = clampFollowupIndex(currentIndex, total || 1);
  const activePrompt = prompts[activeIndex] || null;

  const activeInputValue = React.useMemo(() => {
    if (!activePrompt) return '';
    const id = activePrompt.id;
    return String(draftByPromptId[id] ?? answersByPromptId[id] ?? '');
  }, [activePrompt, answersByPromptId, draftByPromptId]);

  const followupCards = React.useMemo(() => {
    const currentlyMissingPromptIds = new Set(prompts.map((item) => item.id));
    return computeFollowupCardStatuses({
      prompts,
      currentlyMissingPromptIds,
      answersByPromptId,
      skippedPromptIds,
    });
  }, [answersByPromptId, prompts, skippedPromptIds]);

  const completedCount = React.useMemo(
    () => followupCards.filter((item) => item.status === 'completed').length,
    [followupCards]
  );

  const completionRatio = total > 0 ? completedCount / total : 0;

  React.useEffect(() => {
    if (!swipeFeedback) return;
    const timer = window.setTimeout(() => setSwipeFeedback(''), 900);
    return () => window.clearTimeout(timer);
  }, [swipeFeedback]);

  React.useEffect(() => {
    if (!hydrated || !followupSessionKey) return;

    writeFusionFollowupSession(followupSessionKey, {
      sourcePath,
      supplementText,
      uploadedResumeTitle,
      uploadedResume: (uploadedResume || null) as Record<string, any> | null,
      prompts,
      answersByPromptId,
      draftByPromptId,
      skippedPromptIds,
      currentIndex: activeIndex,
    });
  }, [
    activeIndex,
    answersByPromptId,
    draftByPromptId,
    followupSessionKey,
    hydrated,
    prompts,
    skippedPromptIds,
    sourcePath,
    supplementText,
    uploadedResume,
    uploadedResumeTitle,
  ]);

  React.useEffect(() => {
    if (!hydrated || !followupProgressKey) return;

    writeFusionFollowupProgress(
      followupProgressKey,
      followupCards.map((item) => ({
        id: item.id,
        category: item.category,
        text: item.text,
        status: item.status,
      }))
    );
  }, [followupCards, followupProgressKey, hydrated]);

  const handleBack = React.useCallback(() => {
    const backFrom = String((location.state as any)?.from || sourcePath || '').trim();
    if (backFrom) {
      navigate(backFrom, { replace: true });
      return;
    }
    goBack();
  }, [goBack, location.state, navigate, sourcePath]);

  const handleTypeCurrent = React.useCallback(
    (nextValue: string) => {
      if (!activePrompt) return;
      const promptId = activePrompt.id;
      setDraftByPromptId((prev) => ({
        ...prev,
        [promptId]: nextValue,
      }));
    },
    [activePrompt]
  );

  const handleSwipeIndex = React.useCallback(
    (direction: 'prev' | 'next') => {
      if (total <= 0) return;
      const nextIndex = moveFollowupIndex(activeIndex, total, direction);
      if (nextIndex === activeIndex) {
        setSwipeFeedback(direction === 'prev' ? '已经是第一题' : '已经是最后一题');
        return;
      }
      setCurrentIndex(nextIndex);
      setSwipeFeedback(direction === 'prev' ? '上一题' : '下一题');
    },
    [activeIndex, total]
  );

  const handleSwipePrev = React.useCallback(() => {
    handleSwipeIndex('prev');
  }, [handleSwipeIndex]);

  const handleSwipeNext = React.useCallback(() => {
    handleSwipeIndex('next');
  }, [handleSwipeIndex]);

  const handleGenerate = React.useCallback(async () => {
    if (!hydrated || isSaving) return;

    let currentAnswers = answersByPromptId;
    if (activePrompt) {
      const promptId = activePrompt.id;
      const nextAnswer = (draftByPromptId[promptId] ?? '').trim();
      currentAnswers = {
        ...answersByPromptId,
        [promptId]: nextAnswer,
      };
      setAnswersByPromptId(currentAnswers);
    }

    const deferredResumeSeed = uploadedResume
      ? buildCareerProfileSeedFromImportedResume(uploadedResume)
      : '';
    const profileOnlyInput = mergeBlocks([
      supplementText ? `【用户补充事实】\n${supplementText}` : '',
      '请先基于事实提炼职业画像，并继续定向追问缺失信息，不要编造内容。',
    ]);
    const answerBlocks = buildFollowupAnswerBlocks(prompts, currentAnswers);

    const mergedInput = mergeBlocks([
      deferredResumeSeed
        ? `【上传简历信息（提交时融合解析）】\n${deferredResumeSeed}`
        : uploadedResumeTitle
          ? `【上传简历标题】\n${uploadedResumeTitle}`
          : '',
      profileOnlyInput,
      answerBlocks ? `【定向追问回答】\n${answerBlocks}` : '',
    ]);

    const saved = await saveCareerProfile(mergedInput);
    if (!saved) return;

    navigate('/career-profile/result/summary', {
      replace: true,
      state: {
        from: '/career-profile/followup',
      },
    });
  }, [
    activePrompt,
    answersByPromptId,
    draftByPromptId,
    hydrated,
    isSaving,
    navigate,
    prompts,
    saveCareerProfile,
    supplementText,
    uploadedResume,
    uploadedResumeTitle,
  ]);

  const handleSubmission = React.useCallback(
    async (trigger: 'enter' | 'blur') => {
      if (!activePrompt) return;
      const promptId = activePrompt.id;
      const nextAnswer = (draftByPromptId[promptId] ?? '').trim();

      setAnswersByPromptId((prev) => ({
        ...prev,
        [promptId]: nextAnswer,
      }));

      if (activeIndex < total - 1) {
        setCurrentIndex(getAutoAdvanceIndex(activeIndex, total));
        if (trigger === 'enter') {
          setSwipeFeedback('已切换到下一题');
        }
      } else if (nextAnswer) {
        setSwipeFeedback('回答已保存，可一键生成画像');
      }
    },
    [activePrompt, activeIndex, draftByPromptId, total]
  );

  if (!hydrated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background-light dark:bg-background-dark">
        <span className="text-sm text-slate-500 dark:text-slate-400">正在恢复追问进度...</span>
      </div>
    );
  }

  const hasAnswer = activeInputValue.trim().length > 0;

  return (
    <div className="flex flex-col min-h-screen bg-background-light dark:bg-background-dark animate-in fade-in duration-300">
      <header className="fixed top-0 left-0 right-0 z-40 bg-white/85 dark:bg-slate-900/85 backdrop-blur-md border-b border-slate-200/80 dark:border-white/10 mx-auto w-full max-w-md">
        <div className="flex items-center px-4 h-14 relative">
          <BackButton onClick={handleBack} className="z-10" />
          <h2 className="absolute inset-0 flex items-center justify-center text-lg font-black tracking-tight text-slate-900 dark:text-white pointer-events-none">
            定向追问补充
          </h2>
        </div>
      </header>

      <main
        className={`pt-20 px-4 flex flex-col gap-4 max-w-md mx-auto w-full ${
          isInputFocused
            ? 'pb-[calc(8.5rem+env(safe-area-inset-bottom))]'
            : 'pb-[calc(7.25rem+env(safe-area-inset-bottom))]'
        }`}
      >
        {total > 0 ? (
          <>
            <section className="rounded-[20px] bg-white/92 dark:bg-surface-dark border border-slate-200/70 dark:border-white/10 p-4 shadow-[0_14px_36px_-24px_rgba(15,23,42,0.45)]">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
                <span>已完成 {completedCount}/{total}</span>
                <span>{Math.round(completionRatio * 100)}%</span>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-slate-200/80 dark:bg-slate-700/60 overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
                  style={{ width: `${Math.max(completionRatio * 100, 4)}%` }}
                />
              </div>

              <div
                className="mt-3 overflow-hidden"
                onTouchStart={(event) => {
                  touchStartX.current = event.touches[0]?.clientX ?? null;
                }}
                onTouchEnd={(event) => {
                  if (touchStartX.current == null) return;
                  const endX = event.changedTouches[0]?.clientX ?? touchStartX.current;
                  const delta = endX - touchStartX.current;
                  touchStartX.current = null;
                  if (Math.abs(delta) < 40) return;
                  if (delta > 0) {
                    handleSwipePrev();
                    return;
                  }
                  handleSwipeNext();
                }}
              >
                <div
                  className="flex transition-transform duration-300 ease-out"
                  style={{ transform: `translateX(-${activeIndex * 100}%)` }}
                >
                  {prompts.map((prompt, idx) => (
                    <article key={prompt.id} className="min-w-full px-0.5 py-1">
                      <div className="rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-50/85 dark:bg-slate-900/45 px-4 py-4 min-h-[152px]">
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400">问题 {idx + 1}/{total}</span>
                        <p className="mt-3 text-[15px] font-semibold text-slate-900 dark:text-slate-100 leading-7 whitespace-pre-line">
                          {prompt.text}
                        </p>
                      </div>
                    </article>
                  ))}
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1">
                {prompts.map((prompt, idx) => {
                  const status = followupCards[idx]?.status || 'pending';
                  const isActive = idx === activeIndex;
                  const statusClass =
                    status === 'completed'
                      ? 'bg-emerald-500/90'
                      : status === 'missing'
                        ? 'bg-rose-400/85'
                        : 'bg-slate-300 dark:bg-slate-600';
                  return (
                    <button
                      key={prompt.id}
                      type="button"
                      aria-label={`切换到问题 ${idx + 1}`}
                      onClick={() => {
                        setCurrentIndex(idx);
                        setSwipeFeedback(`已切换到问题 ${idx + 1}`);
                      }}
                      className={`h-2.5 rounded-full transition-all duration-200 shrink-0 ${
                        isActive ? 'w-8 ring-2 ring-primary/30' : 'w-5 opacity-85'
                      } ${statusClass}`}
                    />
                  );
                })}
              </div>

              {!!swipeFeedback && (
                <p className="mt-2 text-[11px] font-medium text-slate-500 dark:text-slate-400" role="status" aria-live="polite">
                  {swipeFeedback}
                </p>
              )}
            </section>

            <section
              className={`rounded-[20px] bg-white/95 dark:bg-surface-dark border p-4 transition-all duration-200 ${
                isInputFocused
                  ? 'border-blue-300 dark:border-blue-400/35 shadow-[0_18px_44px_-24px_rgba(37,99,235,0.55)]'
                  : 'border-slate-200/80 dark:border-white/10 shadow-[0_14px_36px_-26px_rgba(15,23,42,0.4)]'
              }`}
            >
              <label className={`text-sm font-semibold ${isInputFocused ? 'text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-200'}`}>
                回答当前问题
              </label>
              <textarea
                value={activeInputValue}
                onChange={(event) => {
                  handleTypeCurrent(event.target.value);
                }}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => {
                  setIsInputFocused(false);
                  void handleSubmission('blur');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void handleSubmission('enter');
                  }
                }}
                placeholder="请输入你的真实经历与细节（默认空白，不会预填模板）"
                className="mt-2 w-full min-h-[124px] resize-none rounded-xl border bg-slate-50 dark:bg-[#111a22] border-slate-300/90 dark:border-[#334155] text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 px-4 py-3 text-sm leading-7 outline-none transition-all focus:ring-2 focus:ring-primary/45 focus:border-primary/35"
              />
              <p className="mt-2 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                {hasAnswer ? '已记录当前输入，按回车可直接切换下一题。' : '可留空跳过当前题，后续仍可一键生成画像。'}
              </p>
            </section>
          </>
        ) : (
          <div className="rounded-[20px] bg-white dark:bg-surface-dark border border-slate-200/80 dark:border-white/10 p-4 shadow-[0_14px_36px_-24px_rgba(15,23,42,0.4)]">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">当前没有新增追问题目</p>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">可直接生成职业画像。</p>
          </div>
        )}

        <div className="sticky bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-30 mt-1">
          <div className="rounded-2xl bg-white/90 dark:bg-slate-900/85 backdrop-blur-md border border-slate-200/75 dark:border-white/10 p-2 shadow-[0_16px_40px_-24px_rgba(15,23,42,0.45)]">
            <button
              type="button"
              onClick={() => {
                void handleGenerate();
              }}
              disabled={isSaving}
              className="w-full min-h-12 py-3 rounded-xl bg-primary text-white text-sm font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-600 active:scale-[0.985] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSaving ? 'AI 正在马蹄疾整理画像...' : '一键生成画像'}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default GuidedCareerProfileFollowupStep;
