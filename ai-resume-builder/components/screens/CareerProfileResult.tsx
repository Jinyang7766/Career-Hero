import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import BackButton from '../shared/BackButton';
import { useAppContext } from '../../src/app-context';
import { useUserProfile } from '../../src/useUserProfile';
import { useCareerProfileComposer } from './dashboard/useCareerProfileComposer';
import CareerProfileStructuredEditor, { CareerProfileEditorRef } from './career-profile/CareerProfileStructuredEditor';
import { buildDynamicFollowupPrompts } from './career-profile/dynamic-followup-prompts';
import { computeFollowupCardStatuses } from './career-profile/followup-card-status';
import PageStatusFeedback from '../shared/PageStatusFeedback';
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
  const { userProfile, loading, error } = useUserProfile(currentUser?.id, currentUser);

  const navItems = [
    { id: 'section-summary', icon: 'psychology', label: '核心优势' },
    { id: 'section-basic', icon: 'badge', label: '基础信息' },
    { id: 'section-preference', icon: 'tune', label: '目标偏好' },
    { id: 'section-skills', icon: 'extension', label: '专业技能' },
    { id: 'section-work', icon: 'work', label: '工作履历' },
    { id: 'section-projects', icon: 'rocket_launch', label: '重点项目' },
    { id: 'section-education', icon: 'school', label: '教育背景' },
  ];

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      const offset = 120;
      const bodyRect = document.body.getBoundingClientRect().top;
      const elementRect = el.getBoundingClientRect().top;
      const elementPosition = elementRect - bodyRect;
      const offsetPosition = elementPosition - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
  };

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


  const handleRetry = () => {
    window.location.reload();
  };

  if (loading) {
    return <PageStatusFeedback status="loading" title="正在准备您的职业画像..." icon="psychology" />;
  }

  if (error) {
    return <PageStatusFeedback status="error" title="画像加载失败" message={error} onRetry={handleRetry} />;
  }

  return (
    <div className="flex flex-col min-h-screen bg-background-light dark:bg-background-dark animate-in fade-in duration-300">
      <header className="fixed top-0 left-0 right-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200/60 dark:border-white/5 mx-auto w-full max-w-md">
        <div className="flex items-center justify-between px-4 h-14 relative">
          <BackButton onClick={handleBack} className="z-10" />
          <h2 className="absolute inset-0 flex items-center justify-center text-lg font-bold text-slate-900 dark:text-white pointer-events-none">
            我的职业画像
          </h2>
          <button
            type="button"
            onClick={() => {
              if (isInlineEditing) {
                handleBack();
                return;
              }
              setIsInlineEditing(true);
            }}
            disabled={isSaving}
            className="z-10 flex items-center justify-center w-9 h-9 rounded-full bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 active:scale-95 transition-all text-slate-700 dark:text-white disabled:opacity-60"
            title={isInlineEditing ? '取消编辑' : '编辑画像'}
          >
            <span className="material-symbols-outlined text-[20px]">
              {isInlineEditing ? 'close' : 'edit'}
            </span>
          </button>
        </div>
        {!isInlineEditing && (
          <div className="flex items-center justify-between px-6 h-10 overflow-x-auto no-scrollbar border-b border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-slate-800/40 backdrop-blur-md">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => scrollToSection(item.id)}
                className="shrink-0 flex items-center justify-center w-8 h-8 rounded-full text-slate-500 dark:text-slate-400 hover:text-primary dark:hover:text-primary-light hover:bg-primary/5 transition-all"
                title={item.label}
              >
                <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
              </button>
            ))}
          </div>
        )}
      </header>

      <main className={`flex-1 overflow-y-auto ${isInlineEditing ? 'pt-20' : 'pt-[104px]'} px-4 pb-[calc(5.75rem+env(safe-area-inset-bottom))] flex flex-col gap-5 max-w-md mx-auto w-full`}>


        {profile && (
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
          <div className="rounded-2xl bg-white dark:bg-surface-dark border border-slate-200/60 dark:border-white/5 p-5 shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full -mr-8 -mt-8 transition-transform group-hover:scale-110" />
            <div className="relative z-10 flex flex-col gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 text-primary">
                  <span className="material-symbols-outlined text-[20px]">analytics</span>
                </div>
                <h3 className="text-sm font-black text-slate-800 dark:text-slate-200">画像完善进度</h3>
              </div>

              {hasFollowupProgress ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    {STATUS_ORDER.filter((s) => s !== 'pending').map((status) => {
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
                  如果有新的经历或想要补充细节，可以使用下方工具继续补全画像。
                </p>
              )}

              <div className="flex flex-col gap-2.5 mt-1">
                <button
                  type="button"
                  onClick={handleGoFollowup}
                  className="relative w-full h-12 rounded-xl bg-primary text-white text-sm font-bold shadow-lg shadow-primary/25 hover:bg-blue-600 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px]">quiz</span>
                  <span>{hasMissingFollowup ? '补充核心事实' : '丰富画像细节'}</span>
                  {statusCount.pending > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white animate-in zoom-in duration-300">
                      {statusCount.pending}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/career-profile/upload')}
                  className="w-full h-12 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-200 text-sm font-bold hover:bg-slate-200 dark:hover:bg-white/10 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px]">history_edu</span>
                  <span>更新背景资料</span>
                </button>
              </div>
            </div>
          </div>
        )}

      </main>

      {isInlineEditing && (
        <div className="fixed bottom-0 left-0 right-0 z-50 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-t border-slate-200 dark:border-white/5 mx-auto w-full max-w-md animate-in slide-in-from-bottom duration-300">
          <button
            type="button"
            onClick={() => void editorRef.current?.handleSave()}
            disabled={isSaving}
            className="w-full h-12 rounded-xl bg-primary text-white text-base font-bold shadow-lg shadow-primary/25 hover:bg-blue-600 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <span className="size-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></span>
            ) : (
              <>
                <span className="material-symbols-outlined text-[20px]">check_circle</span>
                <span>确认修改</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default CareerProfileResult;
