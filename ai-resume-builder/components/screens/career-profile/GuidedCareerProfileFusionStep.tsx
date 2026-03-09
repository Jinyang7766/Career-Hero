import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import BackButton from '../../shared/BackButton';
import ResumeImportDialog, { type ResumeImportInput } from '../../ResumeImportDialog';
import type { ResumeData } from '../../../types';
import { useAppContext } from '../../../src/app-context';
import { useCareerProfileVoiceInput } from './useCareerProfileVoiceInput';
import { buildDynamicFollowupPrompts } from './dynamic-followup-prompts';
import type { FollowupPrompt } from './profile-followup-prompts';
import { parseFusionUploadedResumeSafe } from './fusion-upload-parser';
import {
  CAREER_PROFILE_SUPPLEMENT_MAX_CHARS,
  appendCareerProfileSupplement,
  clampCareerProfileSupplement,
} from './fusion-input-limit';
import {
  type FollowupSessionSnapshot,
  FOLLOWUP_PROGRESS_KEY,
  FOLLOWUP_SESSION_KEY,
  clearFusionFollowupProgress,
  clearFusionFollowupSession,
  getScopedFusionStorageKey,
  writeFusionFollowupProgress,
  writeFusionFollowupSession,
} from './fusion-storage';
import { computeFollowupCardStatuses } from './followup-card-status';
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

  const [importDialogOpen, setImportDialogOpen] = React.useState(false);
  const [uploadedInput, setUploadedInput] = React.useState<ResumeImportInput | null>(null);
  const [uploadedResume, setUploadedResume] = React.useState<ImportedResume | null>(null);
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);
  const [analyzeError, setAnalyzeError] = React.useState('');
  const [supplementText, setSupplementText] = React.useState('');
  const [analysisReady, setAnalysisReady] = React.useState(false);
  const [followupPrompts, setFollowupPrompts] = React.useState<FollowupPrompt[]>([]);

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

  const handleImportedResume = React.useCallback((input: ResumeImportInput) => {
    setUploadedInput(input);
    setUploadedResume(null);
    setAnalyzeError('');
    setAnalysisReady(false);
    setFollowupPrompts([]);
  }, []);

  const hasUploadedResume = Boolean(uploadedInput);
  const hasProfileInput = normalizeToken(supplementText).length > 0;
  const supplementCharCount = supplementText.length;
  const supplementAtLimit = supplementCharCount >= CAREER_PROFILE_SUPPLEMENT_MAX_CHARS;
  const blockedByChoice = !hasUploadedResume && !hasProfileInput;

  const refreshDynamicFollowups = React.useCallback(
    (parsedResume: ImportedResume | null) => {
      const prompts = buildDynamicFollowupPrompts({
        importedResume: parsedResume,
        supplementText,
      });
      setFollowupPrompts(prompts);
      return prompts;
    },
    [supplementText]
  );

  React.useEffect(() => {
    if (!analysisReady) return;
    refreshDynamicFollowups(uploadedResume || null);
  }, [analysisReady, refreshDynamicFollowups, uploadedResume]);

  React.useEffect(() => {
    if (!followupProgressKey || !followupSessionKey) return;
    if (!analysisReady) {
      clearFusionFollowupProgress(followupProgressKey);
      clearFusionFollowupSession(followupSessionKey);
      return;
    }

    const currentlyMissingPromptIds = new Set(followupPrompts.map((item) => item.id));
    const nextStatuses = computeFollowupCardStatuses({
      prompts: followupPrompts,
      currentlyMissingPromptIds,
      answersByPromptId: {},
      skippedPromptIds: [],
    });

    writeFusionFollowupProgress(
      followupProgressKey,
      nextStatuses.map((item) => ({
        id: item.id,
        category: item.category,
        text: item.text,
        status: item.status,
      }))
    );
  }, [analysisReady, followupProgressKey, followupPrompts, followupSessionKey]);

  const handleAnalyze = React.useCallback(async () => {
    if (blockedByChoice || isTranscribing || isAnalyzing) return;
    setAnalyzeError('');
    setIsAnalyzing(true);
    try {
      let parsedResume = uploadedResume;
      if (uploadedInput && !parsedResume) {
        const parsedResult = await parseFusionUploadedResumeSafe(uploadedInput);
        if (!parsedResult.ok) {
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
    isAnalyzing,
    isTranscribing,
    refreshDynamicFollowups,
    uploadedInput,
    uploadedResume,
  ]);

  const handleGoFollowup = React.useCallback(() => {
    if (!analysisReady || isTranscribing || isAnalyzing) return;
    if (!followupSessionKey || !followupProgressKey) {
      setAnalyzeError('追问状态初始化失败，请刷新页面后重试。');
      return;
    }

    const prompts = followupPrompts;
    const session: Omit<FollowupSessionSnapshot, 'updatedAt'> = {
      sourcePath: '/career-profile/upload',
      supplementText,
      uploadedResumeTitle: uploadedResumeTitle || (hasUploadedResume ? '未命名简历' : ''),
      uploadedResume: (uploadedResume || null) as Record<string, any> | null,
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
        from: '/career-profile/upload',
        followupSession: session,
      },
    });
  }, [
    analysisReady,
    followupProgressKey,
    followupPrompts,
    followupSessionKey,
    hasUploadedResume,
    isAnalyzing,
    isTranscribing,
    navigate,
    supplementText,
    uploadedResume,
    uploadedResumeTitle,
  ]);

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
          当前仅展示标题，不做即时解析。点击 AI 智能解析后，会进入独立追问页继续补充并生成画像。
        </p>
      </div>
    );
  };

  const renderSupplementInput = (title: string, placeholder: string) => (
    <div className="rounded-2xl bg-white dark:bg-surface-dark border border-slate-200/80 dark:border-white/10 p-4 shadow-sm">
      <label className="text-sm font-bold text-slate-800 dark:text-slate-200">{title}</label>
      <AutoGrowTextarea
        value={supplementText}
        onChange={(event) => {
          setAnalyzeError('');
          setAnalysisReady(false);
          setFollowupPrompts([]);
          setSupplementText(clampCareerProfileSupplement(event.target.value));
        }}
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
            onClick={() => {
              setAnalysisReady(false);
              setFollowupPrompts([]);
              setImportDialogOpen(true);
            }}
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
          disabled={!audioSupported || isTranscribing || isAnalyzing}
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
          已达到输入上限（{CAREER_PROFILE_SUPPLEMENT_MAX_CHARS} 字）。可先点击“AI 智能解析”进入追问页完成后续生成。
        </p>
      )}
    </div>
  );

  const canStartFollowup = analysisReady && !isTranscribing && !isAnalyzing;

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
        {renderUploadedResumeTitleCard()}

        {renderSupplementInput(
          analysisReady ? '补充更多工作细节（可选）' : '简单聊聊你的经历',
          '在这里随便写写你的经历，比如主导了什么项目、解决了什么难题、取得了什么成果...不用在意排版和用词，我会帮你全部搞定！'
        )}

        
        <div className="sticky bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-30 mt-1">
          <button
            type="button"
            onClick={() => {
              if (!analysisReady) {
                void handleAnalyze();
                return;
              }
              handleGoFollowup();
            }}
            disabled={blockedByChoice || isTranscribing || isAnalyzing}
            className="w-full py-3 rounded-xl bg-primary text-white text-sm font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-600 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isAnalyzing ? 'AI 正在解析上传内容...' : canStartFollowup ? '下一步' : 'AI 智能解析'}
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
