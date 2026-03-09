import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import BackButton from '../shared/BackButton';
import { useAppContext } from '../../src/app-context';
import { useUserProfile } from '../../src/useUserProfile';
import { useCareerProfileComposer } from './dashboard/useCareerProfileComposer';
import CareerProfileStructuredEditor, { CareerProfileEditorRef } from './career-profile/CareerProfileStructuredEditor';
import { buildDynamicFollowupPrompts } from './career-profile/dynamic-followup-prompts';
import { computeFollowupCardStatuses } from './career-profile/followup-card-status';
import {
  type FollowupCardStatus,
  FOLLOWUP_PROGRESS_KEY,
  FOLLOWUP_SESSION_KEY,
  getScopedFusionStorageKey,
  readFusionFollowupProgress,
  writeFusionFollowupProgress,
  writeFusionFollowupSession,
} from './career-profile/fusion-storage';

const normalizePath = (pathname: string): string => {
  const raw = String(pathname || '').split('?')[0].split('#')[0].trim().toLowerCase();
  const stripped = raw.replace(/\/+$/, '');
  return stripped || '/';
};

const STATUS_ORDER: FollowupCardStatus[] = ['missing', 'pending', 'completed'];

const STATUS_LABEL: Record<FollowupCardStatus, string> = {
  missing: '缺失',
  pending: '待补充',
  completed: '已补充',
};

const STATUS_PILL_CLASS: Record<FollowupCardStatus, string> = {
  missing:
    'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-400/25',
  pending:
    'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-400/25',
  completed:
    'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-400/25',
};

const CareerProfileResult: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const currentUser = useAppContext((state) => state.currentUser);
  const goBack = useAppContext((state) => state.goBack);
  const path = normalizePath(location.pathname);
  const backFrom = String((location.state as any)?.from || '').trim();
  const [isInlineEditing, setIsInlineEditing] = React.useState(false);
  const [editorEpoch, setEditorEpoch] = React.useState(0);
  const editorRef = React.useRef<CareerProfileEditorRef>(null);
  const { userProfile, loading } = useUserProfile(currentUser?.id, currentUser);

  React.useEffect(() => {
    if (path === '/career-profile/result') {
      navigate('/career-profile/result/summary', { replace: true });
    }
  }, [navigate, path]);

  const {
    profile,
    isSaving,
    saveStructuredCareerProfile,
  } = useCareerProfileComposer({
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

  const followupSnapshot = React.useMemo(() => {
    if (!followupProgressKey) return null;
    return readFusionFollowupProgress(followupProgressKey);
  }, [followupProgressKey, location.key]);

  const statusCount = React.useMemo(() => {
    const counters: Record<FollowupCardStatus, number> = {
      missing: 0,
      pending: 0,
      completed: 0,
    };
    followupSnapshot?.cards.forEach((card) => {
      counters[card.status] += 1;
    });
    return counters;
  }, [followupSnapshot]);

  const hasFollowupProgress = Boolean(followupSnapshot?.cards?.length);
  const hasMissingFollowup = statusCount.missing > 0;

  const handleBack = React.useCallback(() => {
    if (isInlineEditing) {
      setIsInlineEditing(false);
      setEditorEpoch((prev) => prev + 1);
      return;
    }

    if (backFrom) {
      navigate(backFrom, { replace: true });
      return;
    }

    goBack();
  }, [backFrom, goBack, isInlineEditing, navigate]);

  const handleGoFollowup = React.useCallback(() => {
    if (!followupSessionKey || !followupProgressKey || !profile) return;

    const prompts = buildDynamicFollowupPrompts({
      importedResume: null,
      supplementText: '',
      existingProfile: profile,
      isFirstBuild: false,
    });

    const session = {
      sourcePath: '/career-profile/result/summary',
      supplementText: '',
      uploadedResumeTitle: '',
      uploadedResume: null,
      prompts,
      answersByPromptId: {},
      draftByPromptId: {},
      skippedPromptIds: [],
      currentIndex: 0,
    };

    writeFusionFollowupSession(followupSessionKey, session);

    const currentlyMissingPromptIds = new Set(prompts.map((item) => item.id));
    const statuses = computeFollowupCardStatuses({
      prompts,
      currentlyMissingPromptIds,
      answersByPromptId: {},
      skippedPromptIds: [],
    });
    writeFusionFollowupProgress(
      followupProgressKey,
      statuses.map((item) => ({
        id: item.id,
        category: item.category,
        text: item.text,
        status: item.status,
      }))
    );

    navigate('/career-profile/followup', {
      state: {
        from: '/career-profile/result/summary',
        followupSession: session,
        isFirstBuild: false,
      },
    });
  }, [followupProgressKey, followupSessionKey, navigate, profile]);


  return (
    <div className="flex flex-col min-h-screen bg-background-light dark:bg-background-dark animate-in fade-in duration-300">
      <header className="fixed top-0 left-0 right-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-white/5 mx-auto w-full max-w-md">
        <div className="flex items-center justify-between px-4 h-14 relative">
          <BackButton onClick={handleBack} className="z-10" />
          <h2 className="absolute inset-0 flex items-center justify-center text-lg font-bold leading-tight tracking-[-0.015em] text-slate-900 dark:text-white pointer-events-none">
            我的专属职业画像
          </h2>
          <button
            type="button"
            onClick={() => {
              if (isInlineEditing) {
                void editorRef.current?.handleSave();
                return;
              }
              setIsInlineEditing(true);
            }}
            disabled={isSaving}
            className="z-10 flex items-center justify-center w-9 h-9 rounded-full bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 active:scale-95 transition-all text-slate-700 dark:text-white disabled:opacity-60"
            title={isInlineEditing ? '保存修改' : '编辑画像'}
          >
            {isInlineEditing && isSaving ? (
              <span className="size-4 border-2 border-slate-400 border-t-slate-700 dark:border-white/20 dark:border-t-white rounded-full animate-spin"></span>
            ) : (
              <span className="material-symbols-outlined text-[20px]">
                {isInlineEditing ? 'check' : 'edit'}
              </span>
            )}
          </button>
        </div>
      </header>

      <main className={`flex-1 overflow-y-auto pt-20 px-4 pb-[calc(5.75rem+env(safe-area-inset-bottom))] flex flex-col gap-5 max-w-md mx-auto w-full`}>


        {!loading && (
          <CareerProfileStructuredEditor
            key={editorEpoch}
            ref={editorRef}
            profile={profile}
            inlineEditable={isInlineEditing}
            isSaving={isSaving}
            onInlineEditCancel={() => {
              setIsInlineEditing(false);
              setEditorEpoch((prev) => prev + 1);
            }}
            onInlineEditSaved={() => setIsInlineEditing(false)}
            onSave={async (draft) => {
              const saved = await saveStructuredCareerProfile(draft);
              return saved;
            }}
          />
        )}

        {!isInlineEditing && (
          <div className="rounded-2xl bg-white dark:bg-surface-dark border border-slate-200/80 dark:border-white/10 p-5 shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full -mr-8 -mt-8 transition-transform group-hover:scale-110" />
            <div className="relative z-10 flex flex-col gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 text-primary">
                  <span className="material-symbols-outlined text-[20px]">add_circle</span>
                </div>
                <h3 className="text-sm font-black text-slate-800 dark:text-slate-200">定向追问卡片进度</h3>
              </div>

              {hasFollowupProgress ? (
                <>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    追问页与结果页已联动同一批追问卡片。你可以回到追问页继续补充，不会打开聊天窗口。
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {STATUS_ORDER.map((status) => {
                      const count = statusCount[status];
                      if (count <= 0) return null;
                      return (
                        <span
                          key={status}
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold ${STATUS_PILL_CLASS[status]}`}
                        >
                          <span>{STATUS_LABEL[status]}</span>
                          <span>{count}</span>
                        </span>
                      );
                    })}
                  </div>
                </>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  如果有新的经历或想要补充细节，可回到追问页继续补全定向追问卡片。
                </p>
              )}

              <div className="flex flex-col gap-2.5 mt-1">
                <button
                  type="button"
                  onClick={handleGoFollowup}
                  className="w-full h-11 rounded-xl bg-primary text-white text-sm font-bold shadow-lg shadow-primary/25 hover:bg-blue-600 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px]">quiz</span>
                  <span>{hasMissingFollowup ? '继续补全缺失卡片' : '继续完善追问卡片'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/career-profile/upload')}
                  className="w-full h-11 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-200 text-sm font-bold hover:bg-slate-200 dark:hover:bg-white/10 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px]">edit_note</span>
                  <span>返回重新录入</span>
                </button>
              </div>
            </div>
          </div>
        )}


      </main>
    </div>
  );
};

export default CareerProfileResult;
