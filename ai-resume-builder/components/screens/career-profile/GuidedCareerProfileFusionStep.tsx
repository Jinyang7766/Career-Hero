import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import BackButton from '../../shared/BackButton';
import ResumeImportDialog, { type ResumeImportInput } from '../../ResumeImportDialog';
import type { ResumeData } from '../../../types';
import { useAppContext } from '../../../src/app-context';
import { useUserProfile } from '../../../src/useUserProfile';
import { useCareerProfileComposer } from '../dashboard/useCareerProfileComposer';
import { useCareerProfileVoiceInput } from './useCareerProfileVoiceInput';
import { buildCareerProfileSeedFromImportedResume } from './resume-upload-prefill';
import {
  type FollowupPrompt,
  type PromptCategory,
} from './profile-followup-prompts';
import { buildDynamicFollowupPrompts } from './dynamic-followup-prompts';
import { parseFusionUploadedResumeSafe } from './fusion-upload-parser';
import {
  CAREER_PROFILE_SUPPLEMENT_MAX_CHARS,
  appendCareerProfileSupplement,
  clampCareerProfileSupplement,
} from './fusion-input-limit';
import AutoGrowTextarea from '../../editor/AutoGrowTextarea';

type ImportedResume = Omit<ResumeData, 'id'>;

const mergeBlocks = (blocks: Array<string | null | undefined>): string =>
  blocks
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .join('\n\n');

const normalizeToken = (value: string): string =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

const resolveResumeTitle = (resume: Partial<ImportedResume> | null | undefined): string => {
  if (!resume) return '未命名简历';
  const explicitTitle = normalizeToken(String(resume.resumeTitle || ''));
  if (explicitTitle) return explicitTitle;
  const personal = (resume.personalInfo || {}) as any;
  const roleTitle = normalizeToken(String(personal.title || ''));
  const name = normalizeToken(String(personal.name || ''));
  if (roleTitle && name) return `${name} - ${roleTitle}`;
  if (roleTitle) return roleTitle;
  if (name) return `${name} 的简历`;
  return '未命名简历';
};

const GuidedCareerProfileFusionStep: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const currentUser = useAppContext((state) => state.currentUser);
  const goBack = useAppContext((state) => state.goBack);
  const backFrom = String((location.state as any)?.from || '').trim();
  const { userProfile } = useUserProfile(currentUser?.id, currentUser);
  const { isSaving, saveCareerProfile } = useCareerProfileComposer({
    currentUserId: currentUser?.id,
    userProfile,
  });

  const [importDialogOpen, setImportDialogOpen] = React.useState(false);
  const [uploadedInput, setUploadedInput] = React.useState<ResumeImportInput | null>(null);
  const [uploadedResume, setUploadedResume] = React.useState<ImportedResume | null>(null);
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);
  const [analyzeError, setAnalyzeError] = React.useState('');
  const [supplementText, setSupplementText] = React.useState('');
  const [analysisReady, setAnalysisReady] = React.useState(false);
  const [followupPrompts, setFollowupPrompts] = React.useState<FollowupPrompt[]>([]);
  const [activeCategoryIndex, setActiveCategoryIndex] = React.useState(0);
  const [answeredPromptIds, setAnsweredPromptIds] = React.useState<Set<string>>(new Set());

  const categories: { key: PromptCategory; label: string }[] = React.useMemo(
    () => [
      { key: 'experience', label: '工作与项目' },
      { key: 'skills_education', label: '技能与教育' },
      { key: 'personality', label: '性格与风格' },
      { key: 'others', label: '目标与补充' },
    ],
    []
  );

  const appendSupplement = React.useCallback((text: string) => {
    setSupplementText((prev) => appendCareerProfileSupplement(prev, text));
  }, []);

  const {
    audioSupported,
    isRecording,
    isTranscribing,
    voiceError,
    voiceHint,
    startRecording,
    stopRecording,
  } = useCareerProfileVoiceInput({
    onTranscript: (text) => appendSupplement(text),
  });

  const uploadedResumeTitle = React.useMemo(() => {
    const explicit = normalizeToken(String(uploadedInput?.title || ''));
    if (explicit) return explicit;
    if (!uploadedResume) return '';
    return resolveResumeTitle(uploadedResume);
  }, [uploadedInput, uploadedResume]);

  const handleImportedResume = React.useCallback(
    (input: ResumeImportInput) => {
      setUploadedInput(input);
      setUploadedResume(null);
      setAnalyzeError('');
      setAnalysisReady(false);
      setFollowupPrompts([]);
      setAnsweredPromptIds(new Set());
    },
    []
  );

  const profileOnlyInput = React.useMemo(() => {
    return mergeBlocks([
      supplementText ? `【用户补充事实】\n${supplementText}` : '',
      '请先基于事实提炼职业画像，并继续定向追问缺失信息，不要编造内容。',
    ]);
  }, [supplementText]);

  const hasUploadedResume = Boolean(uploadedInput);
  const hasProfileInput = normalizeToken(supplementText).length > 0;
  const supplementCharCount = supplementText.length;
  const supplementAtLimit = supplementCharCount >= CAREER_PROFILE_SUPPLEMENT_MAX_CHARS;
  const blockedByChoice = !hasUploadedResume && !hasProfileInput;
  const followupVisible = analysisReady;

  const refreshDynamicFollowups = React.useCallback(
    (parsedResume: ImportedResume | null, opts?: { preserveAnswered?: boolean }) => {
      const prompts = buildDynamicFollowupPrompts({
        importedResume: parsedResume,
        supplementText,
      });
      setFollowupPrompts(prompts);
      if (opts?.preserveAnswered) {
        setAnsweredPromptIds((prev) => {
          const promptIds = new Set(prompts.map((item) => item.id));
          const next = new Set<string>();
          prev.forEach((id) => {
            if (promptIds.has(id)) next.add(id);
          });
          return next;
        });
      } else {
        setAnsweredPromptIds(new Set());
      }
      const firstAvailableCategory = categories.findIndex((cat) =>
        prompts.some((item) => item.category === cat.key)
      );
      setActiveCategoryIndex((prev) => {
        const currentKey = categories[prev]?.key;
        if (currentKey && prompts.some((item) => item.category === currentKey)) return prev;
        return firstAvailableCategory >= 0 ? firstAvailableCategory : 0;
      });
    },
    [categories, supplementText]
  );

  React.useEffect(() => {
    if (!analysisReady) return;
    refreshDynamicFollowups(uploadedResume || null, { preserveAnswered: true });
  }, [analysisReady, uploadedResume, refreshDynamicFollowups]);

  const handleAnalyze = React.useCallback(async () => {
    if (blockedByChoice || isSaving || isTranscribing || isAnalyzing) return;
    setAnalyzeError('');
    setIsAnalyzing(true);
    try {
      let parsedResume = uploadedResume;
      if (uploadedInput && !parsedResume) {
        const parsedResult = await parseFusionUploadedResumeSafe(uploadedInput);
        if ('error' in parsedResult) {
          setAnalysisReady(false);
          setAnalyzeError(parsedResult.error);
          return;
        }
        parsedResume = parsedResult.data;
        setUploadedResume(parsedResult.data);
      }

      refreshDynamicFollowups(parsedResume || null);
      setAnalysisReady(true);
    } finally {
      setIsAnalyzing(false);
    }
  }, [
    blockedByChoice,
    isSaving,
    isTranscribing,
    isAnalyzing,
    uploadedInput,
    uploadedResume,
    refreshDynamicFollowups,
  ]);

  const handleSubmit = async () => {
    if (blockedByChoice || isSaving || isTranscribing || isAnalyzing) return;
    const deferredResumeSeed = hasUploadedResume && uploadedResume
      ? buildCareerProfileSeedFromImportedResume(uploadedResume)
      : '';
    const mergedInput = mergeBlocks([
      deferredResumeSeed
        ? `【上传简历信息（提交时融合解析）】\n${deferredResumeSeed}`
        : hasUploadedResume
          ? `【上传简历标题】\n${uploadedResumeTitle || '未命名简历'}`
          : '',
      profileOnlyInput,
    ]);
    const saved = await saveCareerProfile(mergedInput);
    if (!saved) return;
    navigate('/career-profile/result/summary', {
      replace: true,
      state: {
        from: '/career-profile/upload',
      },
    });
  };

  const handleBack = React.useCallback(() => {
    if (backFrom) {
      navigate(backFrom, { replace: true });
      return;
    }

    goBack();
  }, [backFrom, goBack, navigate]);

  const renderUploadedResumeTitleCard = () => {
    if (!hasUploadedResume) return null;
    return (
      <div className="rounded-2xl bg-white dark:bg-surface-dark border border-slate-200/80 dark:border-white/10 p-4 shadow-sm">
        <p className="text-sm font-bold text-slate-800 dark:text-slate-200">已上传简历</p>
        <p className="mt-2 text-sm text-slate-900 dark:text-slate-100">{uploadedResumeTitle || '未命名简历'}</p>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          当前仅展示标题，不做即时解析。点击 AI 智能解析后会与画像输入一起融合整理。
        </p>
      </div>
    );
  };

  const renderSupplementInput = (title: string, placeholder: string) => (
    <div className="rounded-2xl bg-white dark:bg-surface-dark border border-slate-200/80 dark:border-white/10 p-4 shadow-sm">
      <label className="text-sm font-bold text-slate-800 dark:text-slate-200">{title}</label>
      <AutoGrowTextarea
        value={supplementText}
        onChange={(event) => setSupplementText(clampCareerProfileSupplement(event.target.value))}
        maxLength={CAREER_PROFILE_SUPPLEMENT_MAX_CHARS}
        placeholder={placeholder}
        className="mt-2 w-full min-h-[120px] resize-none rounded-lg border bg-slate-50 dark:bg-[#111a22] border-slate-300 dark:border-[#334155] text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 px-4 py-3 text-sm leading-relaxed outline-none transition-all focus:ring-2 focus:ring-primary focus:border-transparent"
        minRows={5}
      />
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500">
            <span className="material-symbols-outlined text-[16px]">notes</span>
            <span className={`text-xs font-medium ${supplementAtLimit ? 'text-amber-600 dark:text-amber-300' : ''}`}>
              已输入 {supplementCharCount}/{CAREER_PROFILE_SUPPLEMENT_MAX_CHARS} 字
            </span>
          </div>
          <button
            type="button"
            onClick={() => setImportDialogOpen(true)}
            className="text-xs text-left text-primary hover:text-blue-600 font-bold flex items-center gap-1.5 py-1"
          >
            <span className="material-symbols-outlined text-[18px]">upload_file</span>
            {hasUploadedResume ? '重新上传简历' : '我有简历文件，去上传'}
          </button>
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
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-md ${isRecording ? 'bg-rose-500 text-white animate-pulse' : 'bg-primary text-white hover:bg-blue-600 active:scale-95'
            } disabled:opacity-60 disabled:cursor-not-allowed`}
        >
          <span className="material-symbols-outlined text-[18px]">
            {isRecording ? 'stop_circle' : 'mic'}
          </span>
          <span>
            {isTranscribing ? '正在转写...' : isRecording ? '结束并上传' : '语音输入经历'}
          </span>
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
      {supplementAtLimit && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50/80 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-400/20 rounded-lg px-2.5 py-2">
          已达到输入上限（{CAREER_PROFILE_SUPPLEMENT_MAX_CHARS} 字）。如需更多内容，可先点击“AI 智能解析”提交本轮信息。
        </p>
      )}
    </div>
  );

  return (
    <div className="flex flex-col min-h-screen bg-background-light dark:bg-background-dark animate-in fade-in duration-300">
      <header className="fixed top-0 left-0 right-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-white/5 mx-auto w-full max-w-md">
        <div className="flex items-center px-4 h-14 relative">
          <BackButton onClick={handleBack} className="z-10" />
          <h2 className="absolute inset-0 flex items-center justify-center text-lg font-black tracking-tight text-slate-900 dark:text-white pointer-events-none">
            职业画像录入
          </h2>
        </div>
      </header>

      <main className="pt-20 px-4 pb-[calc(5.75rem+env(safe-area-inset-bottom))] flex flex-col gap-6 max-w-md mx-auto w-full">
        {/* Standalone upload button removed to avoid double-button awkwardness */}

        {renderUploadedResumeTitleCard()}

        {followupVisible ? (
          <>
            <div className="rounded-2xl bg-white dark:bg-surface-dark border border-slate-200/80 dark:border-white/10 p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[18px]">lightbulb</span>
                  <label className="text-sm font-bold text-slate-800 dark:text-slate-200">AI 智能追问建议</label>
                </div>
                <span className="text-[11px] text-slate-400 dark:text-slate-500">点一下可插入补充区</span>
              </div>

              <div className="flex gap-2 mb-3 overflow-x-auto no-scrollbar pb-1">
                {categories.map((cat, idx) => {
                  const hasPrompts = followupPrompts.some((item) => item.category === cat.key);
                  if (!hasPrompts && activeCategoryIndex !== idx) return null;

                  return (
                    <button
                      key={cat.key}
                      type="button"
                      onClick={() => setActiveCategoryIndex(idx)}
                      disabled={!hasPrompts && activeCategoryIndex === idx}
                      className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${activeCategoryIndex === idx
                        ? 'bg-primary text-white shadow-sm'
                        : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10'
                        } ${!hasPrompts ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {cat.label}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-col gap-2 relative">
                {(() => {
                  const currentCatPrompts = followupPrompts.filter(
                    (item) => item.category === categories[activeCategoryIndex].key
                  );
                  const remainingPrompts = currentCatPrompts.filter((p) => !answeredPromptIds.has(p.id));

                  if (remainingPrompts.length === 0) {
                    return (
                      <div className="py-4 text-center animate-in zoom-in-95 duration-300">
                        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-500/20 mb-2">
                          <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400">check_circle</span>
                        </div>
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                          此分类的追问已回答完毕，看看其他分类或直接提交吧
                        </p>
                      </div>
                    );
                  }

                  const prompt = remainingPrompts[0];
                  return (
                    <button
                      key={prompt.id}
                      type="button"
                      onClick={() => {
                        appendSupplement(`问题：${prompt.text}\n回答：`);
                        setAnsweredPromptIds((prev) => new Set(prev).add(prompt.id));
                      }}
                      className="text-left px-4 py-3.5 rounded-xl border border-primary/20 dark:border-primary/30 bg-blue-50/50 dark:bg-blue-500/5 text-sm font-medium text-blue-900 dark:text-blue-100 hover:border-primary/50 hover:bg-blue-100/50 transition-all shadow-sm flex flex-col gap-2 group animate-in slide-in-from-right-2 duration-300"
                    >
                      <span>{prompt.text}</span>
                      <span className="text-[11px] text-primary/70 font-bold group-hover:text-primary mt-1 flex items-center gap-1">
                        帮我补充 <span className="material-symbols-outlined text-[14px]">edit</span>
                      </span>
                    </button>
                  );
                })()}
              </div>
            </div>
            {renderSupplementInput(
              '补充更多工作细节',
              '在这里随便写写你的经历，比如主导了什么项目、解决了什么难题、取得了什么成果...不用在意排版和用词，我会帮你全部搞定！'
            )}
          </>
        ) : (
          renderSupplementInput(
            '简单聊聊你的经历',
            '在这里随便写写你的经历，比如主导了什么项目、解决了什么难题、取得了什么成果...不用在意排版和用词，我会帮你全部搞定！'
          )
        )}

        <div className="sticky bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-30 mt-1">
          <button
            type="button"
            onClick={() => {
              if (!analysisReady) {
                void handleAnalyze();
                return;
              }
              void handleSubmit();
            }}
            disabled={blockedByChoice || isSaving || isTranscribing || isAnalyzing}
            className="w-full py-3 rounded-xl bg-primary text-white text-sm font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-600 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isAnalyzing
              ? 'AI 正在解析上传内容...'
              : isSaving
                ? 'AI 正在马不停蹄整理画像...'
                : analysisReady
                  ? '一键生成画像'
                  : 'AI 智能解析'}
          </button>
          {!!analyzeError && (
            <p className="mt-2 text-xs text-rose-700 dark:text-rose-300 bg-rose-50/80 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-400/20 rounded-lg px-2.5 py-2">
              {analyzeError}
            </p>
          )}
        </div>


      </main>

      <ResumeImportDialog
        isOpen={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        onImport={handleImportedResume}
        defaultTab="pdf"
      />
    </div>
  );
};

export default GuidedCareerProfileFusionStep;
