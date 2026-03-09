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
  const [error, setError] = React.useState('');

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

  const handleGenerateWithAnswers = React.useCallback(
    async (currentAnswers: Record<string, string>) => {
      if (!hydrated || isSaving) return;

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
    },
    [
      hydrated,
      isSaving,
      navigate,
      prompts,
      saveCareerProfile,
      supplementText,
      uploadedResume,
      uploadedResumeTitle,
    ]
  );

  const handleGenerate = React.useCallback(async () => {
    await handleGenerateWithAnswers(answersByPromptId);
  }, [answersByPromptId, handleGenerateWithAnswers]);

  const handleSubmission = React.useCallback(async (trigger: 'enter' | 'blur') => {
    if (!activePrompt) return;
    const promptId = activePrompt.id;
    const nextAnswer = (draftByPromptId[promptId] ?? '').trim();

    // Always save current draft to answers
    setAnswersByPromptId((prev) => {
      const next = {
        ...prev,
        [promptId]: nextAnswer,
      };

      // If it's the last question, we need the latest answers for handleGenerate
      if (activeIndex === total - 1) {
        // Use a timeout or a separate effect to ensure state is flushed?
        // Actually, let's just pass the next state directly to a modified handleGenerate
        void handleGenerateWithAnswers(next);
      }
      return next;
    });
    setError('');

    if (activeIndex < total - 1 && trigger === 'enter') {
      setCurrentIndex((prev) => Math.min(total - 1, prev + 1));
    } else if (activeIndex < total - 1 && trigger === 'blur') {
      setCurrentIndex((prev) => Math.min(total - 1, prev + 1));
    }
  }, [activePrompt, activeIndex, draftByPromptId, handleGenerateWithAnswers, total]);

  if (!hydrated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background-light dark:bg-background-dark">
        <span className="text-sm text-slate-500 dark:text-slate-400">正在恢复追问进度...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background-light dark:bg-background-dark animate-in fade-in duration-300">
      <header className="fixed top-0 left-0 right-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-white/5 mx-auto w-full max-w-md">
        <div className="flex items-center px-4 h-14 relative">
          <BackButton onClick={handleBack} className="z-10" />
          <h2 className="absolute inset-0 flex items-center justify-center text-lg font-black tracking-tight text-slate-900 dark:text-white pointer-events-none">
            定向追问补充
          </h2>
        </div>
      </header>

      <main className="pt-20 px-4 pb-[calc(5.75rem+env(safe-area-inset-bottom))] flex flex-col gap-4 max-w-md mx-auto w-full">

        {total > 0 ? (
          <>
            <div className="rounded-2xl bg-white dark:bg-surface-dark border border-slate-200/80 dark:border-white/10 p-3 shadow-sm">
              <div
                className="overflow-hidden"
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
                  {prompts.map((prompt, idx) => {
                    const isActive = idx === activeIndex;
                    const status = followupCards[idx]?.status || 'pending';
                    const statusClass =
                      status === 'completed'
                        ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10'
                        : status === 'missing'
                          ? 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10'
                          : 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10';
                    return (
                      <div key={prompt.id} className="min-w-full px-1 py-2">
                        <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/80 dark:bg-slate-900/40 p-4 min-h-[136px]">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                              问题 {idx + 1}/{total}
                            </span>
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${statusClass}`}>
                              {status === 'completed' ? '已补充' : status === 'missing' ? '缺失' : '待补充'}
                            </span>
                          </div>
                          <p className="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-100 leading-relaxed">
                            {prompt.text}
                          </p>
                          {isActive && (
                            <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">当前题可直接填写并提交</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-white dark:bg-surface-dark border border-slate-200/80 dark:border-white/10 p-4 shadow-sm">
              <label className="text-sm font-bold text-slate-800 dark:text-slate-200">回答当前问题</label>
              <textarea
                value={activeInputValue}
                onChange={(event) => {
                  setError('');
                  handleTypeCurrent(event.target.value);
                }}
                onBlur={() => {
                  void handleSubmission('blur');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void handleSubmission('enter');
                  }
                }}
                placeholder="请输入你的真实经历与细节（默认空白，不会预填模板）"
                className="mt-2 w-full min-h-[112px] resize-none rounded-lg border bg-slate-50 dark:bg-[#111a22] border-slate-300 dark:border-[#334155] text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 px-4 py-3 text-sm leading-relaxed outline-none transition-all focus:ring-2 focus:ring-primary focus:border-transparent"
              />
              {!!error && (
                <p className="mt-2 text-xs text-rose-700 dark:text-rose-300 bg-rose-50/80 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-400/20 rounded-lg px-2.5 py-2">
                  {error}
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="rounded-2xl bg-white dark:bg-surface-dark border border-slate-200/80 dark:border-white/10 p-4 shadow-sm">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">当前没有新增追问题目</p>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">可直接生成职业画像。</p>
            <button
              type="button"
              onClick={() => {
                void handleGenerate();
              }}
              disabled={isSaving}
              className="mt-4 w-full py-3 rounded-xl bg-primary text-white text-sm font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-600 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSaving ? 'AI 正在马不停蹄整理画像...' : '一键生成画像'}
            </button>
          </div>
        )}
      </main>
    </div>
  );
};

export default GuidedCareerProfileFollowupStep;
