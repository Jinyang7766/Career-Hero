import React, { useState, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react';
import { useAppContext } from '../../../src/app-context';
import type { CareerProfile } from '../../../src/career-profile-utils';
import {
  buildCareerProfileAtomicTags,
  createCareerProfileFactDraftSections,
  cascadeCareerProfileFactDraftEdit,
  materializeCareerProfileFactsFromDraft,
  type CareerProfileAtomicTag,
  type CareerProfileAtomicTagCategory,
  type CareerProfileFactSectionKey,
  type CareerProfileFactDraftSections,
} from '../../../src/career-profile-facts';
import { buildCareerProfileSummaryDisplayModel } from './summary-display-logic';
import {
  createCareerProfileEditorDraft,
  projectCareerProfileEditorData,
} from './career-profile-editor-draft';
import {
  ATOMIC_TAG_CATEGORY_CONFIGS,
  mergeAtomicTagsPreferManual,
  parseAtomicTagText,
  replaceAtomicTagsByCategory,
  toAtomicCategoryText,
} from './atomic-tag-editor';
import AutoGrowTextarea from '../../editor/AutoGrowTextarea';

type Props = {
  profile: CareerProfile | null;
  isSaving: boolean;
  onSave: (draft: CareerProfile) => Promise<void | boolean> | void | boolean;
  inlineEditable?: boolean;
  onInlineEditCancel?: () => void;
  onInlineEditSaved?: () => void;
};

const splitListText = (value: string): string[] =>
  String(value || '')
    .split(/[、,，\n;；]/)
    .map((item) => item.trim())
    .filter(Boolean);

const joinListText = (items: string[] | undefined): string => (Array.isArray(items) ? items.join('\n') : '');

const listAtomicTextsByCategory = (
  tags: CareerProfileAtomicTag[] | undefined,
  category: CareerProfileAtomicTagCategory,
  maxItems = 40
): string[] => {
  if (!Array.isArray(tags)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of tags) {
    if (!item || item.category !== category) continue;
    const text = String(item.text || '').trim();
    if (!text) continue;
    const key = String(item.key || text).trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= maxItems) break;
  }
  return out;
};

const buildFactDraftFromAtomicTags = (
  tags: CareerProfileAtomicTag[] | undefined,
  seedFactItems?: CareerProfile['factItems']
): CareerProfileFactDraftSections =>
  createCareerProfileFactDraftSections({
    coreSkills: listAtomicTextsByCategory(tags, 'fact_skill', 30),
    careerHighlights: listAtomicTextsByCategory(tags, 'fact_highlight', 20),
    constraints: listAtomicTextsByCategory(tags, 'fact_constraint', 20),
    factItems: seedFactItems || [],
  });

const toTrimmedText = (value: unknown): string => String(value || '').trim();

const normalizeLooseTextKey = (value: unknown): string =>
  toTrimmedText(value)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[，,。.!！？?;；:：、"'`~@#$%^&*+=<>《》()（）[\]{}【】|\/\-_]/g, '')
    .trim();

const MBTI_TOKEN_RE = /(?:^|[^A-Z])(I|E)(N|S)(T|F)(J|P)(?:$|[^A-Z])/i;

const normalizeMbtiToken = (value: unknown): string => {
  const text = toTrimmedText(value).toUpperCase();
  if (!text) return '';
  const match = text.match(MBTI_TOKEN_RE);
  if (!match) return '';
  return `${match[1]}${match[2]}${match[3]}${match[4]}`;
};

const isMbtiOnlyText = (value: unknown): boolean => {
  const compact = toTrimmedText(value).replace(/\s+/g, '').toUpperCase();
  if (!compact) return false;
  return /^(MBTI|人格|性格)[:：-]?[IESNTFJP]{4}$/.test(compact) || /^[IESNTFJP]{4}$/.test(compact);
};

export type CareerProfileSingleMappingTouchState = {
  intent?: boolean;
  gender?: boolean;
  mbti?: boolean;
  personality?: boolean;
};

export const sanitizeCareerProfileSingleMappingFields = (
  draftProfile: CareerProfile,
  baseProfile: CareerProfile | null,
  touchState: CareerProfileSingleMappingTouchState = {}
) => {
  const intentTouched = Boolean(touchState.intent);
  const genderTouched = Boolean(touchState.gender);
  const mbtiTouched = Boolean(touchState.mbti);
  const personalityTouched = Boolean(touchState.personality);

  const draftIntent = toTrimmedText(
    draftProfile.personalInfo?.title || draftProfile.targetRole || draftProfile.jobDirection
  );
  const baseTargetRole = toTrimmedText(baseProfile?.targetRole);
  const baseJobDirection = toTrimmedText(baseProfile?.jobDirection);
  const basePersonalTitle = toTrimmedText(baseProfile?.personalInfo?.title);

  const targetRole = intentTouched ? draftIntent : baseTargetRole;
  const jobDirectionCandidate = intentTouched ? '' : baseJobDirection;
  const jobDirection =
    jobDirectionCandidate && jobDirectionCandidate !== targetRole ? jobDirectionCandidate : '';
  const personalTitle = intentTouched
    ? draftIntent
    : toTrimmedText(draftProfile.personalInfo?.title) ||
      basePersonalTitle ||
      targetRole ||
      jobDirection;

  const draftGender = toTrimmedText(draftProfile.gender || draftProfile.personalInfo?.gender);
  const baseGender = toTrimmedText(baseProfile?.gender);
  const basePersonalGender = toTrimmedText(baseProfile?.personalInfo?.gender);
  const gender = genderTouched ? draftGender : baseGender;
  const personalGenderCandidate = genderTouched ? '' : basePersonalGender;
  const personalGender =
    personalGenderCandidate && personalGenderCandidate !== gender ? personalGenderCandidate : '';

  let mbti = toTrimmedText(mbtiTouched ? draftProfile.mbti : baseProfile?.mbti);
  let personality = toTrimmedText(
    personalityTouched ? draftProfile.personality : baseProfile?.personality
  );

  const mbtiToken = normalizeMbtiToken(mbti);
  const personalityToken = normalizeMbtiToken(personality);
  const isSamePlainText =
    Boolean(mbti) &&
    Boolean(personality) &&
    normalizeLooseTextKey(mbti) === normalizeLooseTextKey(personality);
  const isSameMbtiOnly =
    Boolean(mbtiToken) && personalityToken === mbtiToken && isMbtiOnlyText(personality);
  if (isSamePlainText || isSameMbtiOnly) {
    personality = '';
  }

  return {
    targetRole,
    jobDirection,
    mbti,
    personality,
    gender,
    personalInfo: {
      title: personalTitle,
      gender: personalGender,
    },
  };
};

export interface CareerProfileEditorRef {
  handleSave: () => Promise<void>;
}

const CareerProfileStructuredEditor = forwardRef<CareerProfileEditorRef, Props>((props, ref) => {
  const {
    profile,
    isSaving,
    onSave,
    inlineEditable = false,
    onInlineEditCancel,
    onInlineEditSaved,
  } = props;
  const currentUser = useAppContext((state) => state.currentUser);

  const [draftProfile, setDraftProfile] = useState<CareerProfile | null>(null);
  const [factDraft, setFactDraft] = useState<CareerProfileFactDraftSections>({
    coreSkills: [],
    careerHighlights: [],
    constraints: [],
  });
  const [atomicTagDraft, setAtomicTagDraft] = useState<CareerProfileAtomicTag[]>([]);
  const [fieldTouchState, setFieldTouchState] = useState<CareerProfileSingleMappingTouchState>({});

  useEffect(() => {
    if (!profile) return;
    const nextDraftProfile = createCareerProfileEditorDraft(profile, currentUser);
    if (!nextDraftProfile) return;
    const nextAtomicTags =
      Array.isArray(nextDraftProfile.atomicTags) && nextDraftProfile.atomicTags.length > 0
        ? nextDraftProfile.atomicTags
        : buildCareerProfileAtomicTags(nextDraftProfile);
    const mergedAtomicTags = mergeAtomicTagsPreferManual([], nextAtomicTags);
    const nextFactDraft = buildFactDraftFromAtomicTags(
      mergedAtomicTags,
      nextDraftProfile.factItems || []
    );
    setDraftProfile(nextDraftProfile);
    setFactDraft(nextFactDraft);
    setAtomicTagDraft(mergedAtomicTags);
    setFieldTouchState({});
  }, [profile, currentUser]);

  const updateDraftProfile = (updater: (prev: CareerProfile) => CareerProfile) => {
    setDraftProfile((prev) => (prev ? updater(prev) : prev));
  };

  const { resumeData, extras } = useMemo(
    () => projectCareerProfileEditorData(draftProfile, factDraft),
    [draftProfile, factDraft]
  );

  const summaryDisplay = useMemo(
    () => buildCareerProfileSummaryDisplayModel(resumeData, extras),
    [resumeData, extras]
  );
  const isInlineEditing = inlineEditable;

  const draftPersonalInfo = draftProfile?.personalInfo || {};
  const draftExperiences = Array.isArray(draftProfile?.experiences) ? draftProfile.experiences : [];
  const draftProjects = Array.isArray(draftProfile?.projects) ? draftProfile.projects : [];
  const draftEducations = Array.isArray(draftProfile?.educations) ? draftProfile.educations : [];
  const draftGender = String(draftProfile?.gender || draftPersonalInfo.gender || '');

  const setPersonalInfoField = (field: keyof NonNullable<CareerProfile['personalInfo']>, value: string) => {
    updateDraftProfile((prev) => ({
      ...prev,
      personalInfo: {
        ...(prev.personalInfo || {}),
        [field]: value,
      },
    }));
  };

  const setDraftProfileTextField = (
    field: 'mbti' | 'personality' | 'workStyle' | 'careerGoal' | 'targetSalary',
    value: unknown
  ) => {
    const text = String(value || '');
    if (field === 'mbti' || field === 'personality') {
      setFieldTouchState((prev) => ({ ...prev, [field]: true }));
    }
    updateDraftProfile((prev) => ({
      ...prev,
      [field]: text,
    }));
  };

  const setCareerIntent = (value: string) => {
    const next = String(value || '');
    setFieldTouchState((prev) => ({ ...prev, intent: true }));
    updateDraftProfile((prev) => ({
      ...prev,
      personalInfo: {
        ...(prev.personalInfo || {}),
        title: next,
      },
      targetRole: next,
      jobDirection:
        String(prev.jobDirection || '').trim() && String(prev.jobDirection || '').trim() !== next
          ? prev.jobDirection
          : '',
    }));
  };

  const setGender = (value: string) => {
    setFieldTouchState((prev) => ({ ...prev, gender: true }));
    updateDraftProfile((prev) => ({
      ...prev,
      gender: value,
      personalInfo: {
        ...(prev.personalInfo || {}),
        gender: '',
      } as any,
    } as any));
  };

  const applyFactSectionTextPatch = (section: CareerProfileFactSectionKey, texts: string[]) => {
    setFactDraft((prevDraft) => cascadeCareerProfileFactDraftEdit(prevDraft, section, texts));
  };

  const atomicCategoryConfigMap = useMemo(
    () => new Map(ATOMIC_TAG_CATEGORY_CONFIGS.map((item) => [item.key, item] as const)),
    []
  );

  const updateAtomicCategoryText = (category: CareerProfileAtomicTagCategory, rawValue: string) => {
    const config = atomicCategoryConfigMap.get(category);
    if (!config) return;
    const nextItems = parseAtomicTagText(rawValue, config.maxItems, config.maxLen);

    if (category === 'intent') {
      setCareerIntent(nextItems[0] || '');
    } else if (category === 'summary') {
      updateDraftProfile((prev) => ({
        ...prev,
        summary: nextItems[0] || '',
      }));
    }

    const nextAtomicTags = replaceAtomicTagsByCategory(atomicTagDraft, category, nextItems, config.label);
    setAtomicTagDraft(nextAtomicTags);

    if (category === 'fact_skill' || category === 'fact_highlight' || category === 'fact_constraint') {
      const seedFactItems = materializeCareerProfileFactsFromDraft(factDraft).factItems;
      setFactDraft(buildFactDraftFromAtomicTags(nextAtomicTags, seedFactItems));
    }
  };

  const updateExperienceItem = (
    index: number,
    field: keyof CareerProfile['experiences'][number],
    value: string
  ) => {
    updateDraftProfile((prev) => ({
      ...prev,
      experiences: (prev.experiences || []).map((item, idx) =>
        idx === index ? { ...item, [field]: value } : item
      ),
    }));
  };

  const removeExperienceItem = (index: number) => {
    updateDraftProfile((prev) => ({
      ...prev,
      experiences: (prev.experiences || []).filter((_, idx) => idx !== index),
    }));
  };

  const appendExperienceItem = () => {
    updateDraftProfile((prev) => ({
      ...prev,
      experiences: [
        ...(prev.experiences || []),
        {
          title: '',
          period: '',
          organization: '',
          actions: '',
          results: '',
          skills: [],
          inResume: 'unknown',
          confidence: 'medium',
          evidence: '来自全量画像编辑',
        },
      ],
    }));
  };

  const updateProjectItem = (index: number, field: string, value: string) => {
    updateDraftProfile((prev) => ({
      ...prev,
      projects: (Array.isArray(prev.projects) ? prev.projects : []).map((item: any, idx: number) =>
        idx === index ? { ...(item || {}), [field]: value } : item
      ),
    }));
  };

  const removeProjectItem = (index: number) => {
    updateDraftProfile((prev) => ({
      ...prev,
      projects: (Array.isArray(prev.projects) ? prev.projects : []).filter((_: any, idx: number) => idx !== index),
    }));
  };

  const appendProjectItem = () => {
    updateDraftProfile((prev) => ({
      ...prev,
      projects: [
        ...(Array.isArray(prev.projects) ? prev.projects : []),
        { id: Date.now(), title: '', subtitle: '', period: '', description: '', link: '' },
      ],
    }));
  };

  const updateEducationItem = (index: number, field: string, value: string) => {
    updateDraftProfile((prev) => ({
      ...prev,
      educations: (Array.isArray(prev.educations) ? prev.educations : []).map((item: any, idx: number) => {
        if (idx !== index) return item;
        const next = { ...(item || {}), [field]: value };
        if (field === 'school') {
          const currentTitle = String(item?.title || '').trim();
          const currentSchool = String(item?.school || '').trim();
          if (!currentTitle || currentTitle === currentSchool) {
            next.title = value;
          }
        }
        if (field === 'period') {
          next.date = value;
        }
        return next;
      }),
    }));
  };

  const removeEducationItem = (index: number) => {
    updateDraftProfile((prev) => ({
      ...prev,
      educations: (Array.isArray(prev.educations) ? prev.educations : []).filter((_: any, idx: number) => idx !== index),
    }));
  };

  const appendEducationItem = () => {
    updateDraftProfile((prev) => ({
      ...prev,
      educations: [
        ...(Array.isArray(prev.educations) ? prev.educations : []),
        { id: Date.now(), title: '', school: '', degree: '', major: '', period: '', description: '' },
      ],
    }));
  };

  const handleSave = async () => {
    if (!draftProfile) return;
    const factSections = materializeCareerProfileFactsFromDraft(factDraft);
    const singleMappedFields = sanitizeCareerProfileSingleMappingFields(
      draftProfile,
      profile,
      fieldTouchState
    );

    const profileBase: CareerProfile = {
      ...draftProfile,
      personalInfo: {
        ...(draftProfile.personalInfo || {}),
        title: singleMappedFields.personalInfo.title,
        gender: singleMappedFields.personalInfo.gender,
      },
      summary: String(draftProfile.summary || '').trim(),
      coreSkills: factSections.coreSkills,
      mbti: singleMappedFields.mbti,
      personality: singleMappedFields.personality,
      workStyle: String(draftProfile.workStyle || '').trim(),
      careerGoal: String(draftProfile.careerGoal || '').trim(),
      targetRole: singleMappedFields.targetRole,
      jobDirection: singleMappedFields.jobDirection,
      targetSalary: String(draftProfile.targetSalary || '').trim(),
      gender: singleMappedFields.gender,
      careerHighlights: factSections.careerHighlights,
      constraints: factSections.constraints,
      factItems: factSections.factItems,
      rawInput: '',
    };

    const syncedAtomicTags = mergeAtomicTagsPreferManual(
      buildCareerProfileAtomicTags(profileBase),
      atomicTagDraft
    );

    const updatedProfile: CareerProfile = {
      ...profileBase,
      atomicTags: syncedAtomicTags,
      atomicTagsManualOverride: true,
    };

    const saveResult = await onSave(updatedProfile);
    if (saveResult === false) return;
    const nextAtomicTags =
      Array.isArray(updatedProfile.atomicTags) && updatedProfile.atomicTags.length > 0
        ? updatedProfile.atomicTags
        : buildCareerProfileAtomicTags(updatedProfile);
    const mergedAtomicTags = mergeAtomicTagsPreferManual([], nextAtomicTags);
    const hydratedProfile =
      createCareerProfileEditorDraft(
        {
          ...updatedProfile,
          atomicTags: mergedAtomicTags,
          atomicTagsManualOverride: true,
        },
        currentUser
      ) || updatedProfile;
    setDraftProfile(hydratedProfile);
    setFactDraft(buildFactDraftFromAtomicTags(mergedAtomicTags, hydratedProfile.factItems || []));
    setAtomicTagDraft(mergedAtomicTags);
    setFieldTouchState({});
    onInlineEditSaved?.();
  };

  useImperativeHandle(ref, () => ({
    handleSave,
  }));

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* 画像核心事实编辑（仅编辑态显示） */}
      {false && (
        <div className="rounded-2xl bg-white dark:bg-surface-dark border border-slate-200/80 dark:border-white/10 p-4 sm:p-5 shadow-sm">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-violet-500/10 text-violet-500">
              <span className="material-symbols-outlined text-[18px]">sell</span>
            </div>
            <div className="min-w-0">
              <h3 className="my-0 text-sm font-black text-slate-800 dark:text-slate-200">画像核心事实</h3>
              <p className="my-0 mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                这是支撑您职业画像的最底层事实库，已为您自动去重并分类，确保每一项信息精准且唯一。
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {ATOMIC_TAG_CATEGORY_CONFIGS.map((section) => {
              const text = toAtomicCategoryText(atomicTagDraft, section.key);
              const currentCount = text ? text.split('\n').filter(Boolean).length : 0;
              return (
                <label
                  key={section.key}
                  className="block rounded-xl bg-slate-50 dark:bg-white/5 px-4 py-3 border border-transparent focus-within:border-primary/30 transition-all"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[10px] font-black tracking-widest text-slate-500 dark:text-slate-400 uppercase">
                      {section.label}
                    </span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums">
                      {currentCount}/{section.maxItems}
                    </span>
                  </div>
                  <AutoGrowTextarea
                    value={text}
                    onChange={(event) => updateAtomicCategoryText(section.key, event.target.value)}
                    placeholder="每行一个核心事实"
                    className="w-full bg-transparent text-[13px] font-bold text-slate-800 dark:text-slate-100 outline-none placeholder:text-slate-400 resize-none min-h-[40px]"
                    minRows={2}
                  />
                </label>
              );
            })}
          </div>
        </div>
      )}

      {(
        <>
          {/* 核心优势总结 */}
          {(isInlineEditing || summaryDisplay.summary) && (
            <div id="section-summary" className="relative rounded-2xl bg-white dark:bg-surface-dark border border-slate-200/80 dark:border-white/10 p-5 sm:p-6 shadow-sm overflow-hidden group">
              <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-primary via-primary/50 to-primary/10" />
              <div className="absolute -top-4 -right-4 size-24 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-colors" />
              
              <div className="relative z-10">
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-primary text-white shadow-sm shadow-primary/20">
                    <span className="material-symbols-outlined text-[18px]">psychology</span>
                  </div>
                  <h3 className="my-0 text-base font-black text-slate-900 dark:text-white tracking-tight">核心优势总结</h3>
                </div>
                
                <div className="relative">
                  <span className="absolute -left-1 -top-2 text-4xl text-primary/10 font-serif pointer-events-none">“</span>
                  <p className="my-0 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed relative z-10 pl-3">
                    {isInlineEditing ? String(draftProfile?.summary || '') : summaryDisplay.summary}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 基础信息 */}
          {(isInlineEditing || summaryDisplay.basicInfoRows.length > 0) && (
            <div id="section-basic" className="rounded-2xl bg-white dark:bg-surface-dark border border-slate-200/80 dark:border-white/10 p-4 sm:p-5 shadow-sm">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-cyan-500/10 text-cyan-500">
                  <span className="material-symbols-outlined text-[18px]">badge</span>
                </div>
                <h3 className="my-0 text-sm font-black text-slate-800 dark:text-slate-200">基础信息</h3>
              </div>
              {isInlineEditing ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label className="rounded-xl bg-slate-50 dark:bg-white/5 px-4 py-3 border border-transparent focus-within:border-primary/30 transition-all">
                    <span className="text-[10px] font-black tracking-widest text-slate-500 dark:text-slate-400 uppercase block mb-1">姓名</span>
                    <input
                      value={draftPersonalInfo.name || ''}
                      onChange={(event) => setPersonalInfoField('name', event.target.value)}
                      className="w-full h-9 bg-transparent text-[13px] font-bold text-slate-800 dark:text-slate-100 outline-none placeholder:text-slate-400"
                    />
                  </label>
                  <label className="rounded-xl bg-slate-50 dark:bg-white/5 px-4 py-3 border border-transparent focus-within:border-primary/30 transition-all">
                    <span className="text-[10px] font-black tracking-widest text-slate-500 dark:text-slate-400 uppercase block mb-1">求职意向</span>
                    <input
                      value={draftPersonalInfo.title || ''}
                      onChange={(event) => setCareerIntent(event.target.value)}
                      className="w-full h-9 bg-transparent text-[13px] font-bold text-slate-800 dark:text-slate-100 outline-none placeholder:text-slate-400"
                    />
                  </label>
                  <label className="rounded-xl bg-slate-50 dark:bg-white/5 px-4 py-3 border border-transparent focus-within:border-primary/30 transition-all">
                    <span className="text-[10px] font-black tracking-widest text-slate-500 dark:text-slate-400 uppercase block mb-1">性别</span>
                    <select
                      value={draftGender}
                      onChange={(event) => setGender(event.target.value)}
                      className="w-full h-9 bg-transparent text-[13px] font-bold text-slate-800 dark:text-slate-100 outline-none"
                    >
                      <option value="">未填写</option>
                      <option value="male">男</option>
                      <option value="female">女</option>
                    </select>
                  </label>
                  <label className="rounded-xl bg-slate-50 dark:bg-white/5 px-4 py-3 border border-transparent focus-within:border-primary/30 transition-all">
                    <span className="text-[10px] font-black tracking-widest text-slate-500 dark:text-slate-400 uppercase block mb-1">年龄</span>
                    <input
                      value={draftPersonalInfo.age || ''}
                      onChange={(event) => setPersonalInfoField('age', event.target.value)}
                      className="w-full h-9 bg-transparent text-[13px] font-bold text-slate-800 dark:text-slate-100 outline-none placeholder:text-slate-400"
                    />
                  </label>
                  <label className="rounded-xl bg-slate-50 dark:bg-white/5 px-4 py-3 border border-transparent focus-within:border-primary/30 transition-all">
                    <span className="text-[10px] font-black tracking-widest text-slate-500 dark:text-slate-400 uppercase block mb-1">所在城市</span>
                    <input
                      value={draftPersonalInfo.location || ''}
                      onChange={(event) => setPersonalInfoField('location', event.target.value)}
                      className="w-full h-9 bg-transparent text-[13px] font-bold text-slate-800 dark:text-slate-100 outline-none placeholder:text-slate-400"
                    />
                  </label>
                  <label className="rounded-xl bg-slate-50 dark:bg-white/5 px-4 py-3 border border-transparent focus-within:border-primary/30 transition-all">
                    <span className="text-[10px] font-black tracking-widest text-slate-500 dark:text-slate-400 uppercase block mb-1">邮箱</span>
                    <input
                      value={draftPersonalInfo.email || ''}
                      onChange={(event) => setPersonalInfoField('email', event.target.value)}
                      className="w-full h-9 bg-transparent text-[13px] font-bold text-slate-800 dark:text-slate-100 outline-none placeholder:text-slate-400"
                    />
                  </label>
                  <label className="rounded-xl bg-slate-50 dark:bg-white/5 px-4 py-3 border border-transparent focus-within:border-primary/30 transition-all">
                    <span className="text-[10px] font-black tracking-widest text-slate-500 dark:text-slate-400 uppercase block mb-1">电话</span>
                    <input
                      value={draftPersonalInfo.phone || ''}
                      onChange={(event) => setPersonalInfoField('phone', event.target.value)}
                      className="w-full h-9 bg-transparent text-[13px] font-bold text-slate-800 dark:text-slate-100 outline-none placeholder:text-slate-400"
                    />
                  </label>
                  <label className="rounded-xl bg-slate-50 dark:bg-white/5 px-4 py-3 border border-transparent focus-within:border-primary/30 transition-all">
                    <span className="text-[10px] font-black tracking-widest text-slate-500 dark:text-slate-400 uppercase block mb-1">LinkedIn</span>
                    <input
                      value={draftPersonalInfo.linkedin || ''}
                      onChange={(event) => setPersonalInfoField('linkedin', event.target.value)}
                      className="w-full h-9 bg-transparent text-[13px] font-bold text-slate-800 dark:text-slate-100 outline-none placeholder:text-slate-400"
                    />
                  </label>
                  <label className="rounded-xl bg-slate-50 dark:bg-white/5 px-4 py-3 border border-transparent focus-within:border-primary/30 transition-all sm:col-span-2">
                    <span className="text-[10px] font-black tracking-widest text-slate-500 dark:text-slate-400 uppercase block mb-1">个人网址</span>
                    <input
                      value={draftPersonalInfo.website || ''}
                      onChange={(event) => setPersonalInfoField('website', event.target.value)}
                      className="w-full h-9 bg-transparent text-[13px] font-bold text-slate-800 dark:text-slate-100 outline-none placeholder:text-slate-400"
                    />
                  </label>
                </div>
              ) : (
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                  {summaryDisplay.basicInfoRows.map((item) => (
                    <div key={`${item.label}-${item.value}`}>
                      <dt className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{item.label}</dt>
                      <dd className="m-0 mt-0.5 text-xs text-slate-700 dark:text-slate-200 break-words">{item.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          )}

          {/* 职业目标与偏好 */}
          {(isInlineEditing || summaryDisplay.preferenceRows.length > 0 || summaryDisplay.constraints.length > 0) && (
            <div id="section-preference" className="rounded-2xl bg-white dark:bg-surface-dark border border-slate-200/80 dark:border-white/10 p-4 sm:p-5 shadow-sm">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-teal-500/10 text-teal-500">
                  <span className="material-symbols-outlined text-[18px]">tune</span>
                </div>
                <h3 className="my-0 text-sm font-black text-slate-800 dark:text-slate-200">职业目标与偏好</h3>
              </div>
              {isInlineEditing ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <label className="rounded-xl bg-slate-50 dark:bg-white/5 px-4 py-3 border border-transparent focus-within:border-primary/30 transition-all">
                      <span className="text-[10px] font-black tracking-widest text-slate-500 dark:text-slate-400 uppercase block mb-1">目标薪资</span>
                      <input
                        value={String(draftProfile?.targetSalary || '')}
                        onChange={(event) => setDraftProfileTextField('targetSalary', event.target.value)}
                        className="w-full h-9 bg-transparent text-[13px] font-bold text-slate-800 dark:text-slate-100 outline-none placeholder:text-slate-400"
                      />
                    </label>
                    <label className="rounded-xl bg-slate-50 dark:bg-white/5 px-4 py-3 sm:col-span-2 border border-transparent focus-within:border-primary/30 transition-all">
                      <span className="text-[10px] font-black tracking-widest text-slate-500 dark:text-slate-400 uppercase block mb-1">职业目标</span>
                      <AutoGrowTextarea
                        value={String(draftProfile?.careerGoal || '')}
                        onChange={(event) => setDraftProfileTextField('careerGoal', event.target.value)}
                        className="w-full bg-transparent text-[13px] font-bold text-slate-800 dark:text-slate-100 outline-none placeholder:text-slate-400 resize-none min-h-[40px]"
                        minRows={2}
                      />
                    </label>
                    <label className="rounded-xl bg-slate-50 dark:bg-white/5 px-4 py-3 sm:col-span-2 border border-transparent focus-within:border-primary/30 transition-all">
                      <span className="text-[10px] font-black tracking-widest text-slate-500 dark:text-slate-400 uppercase block mb-1">MBTI</span>
                      <input
                        value={String(draftProfile?.mbti || '')}
                        onChange={(event) => setDraftProfileTextField('mbti', event.target.value)}
                        className="w-full h-9 bg-transparent text-[13px] font-bold text-slate-800 dark:text-slate-100 outline-none placeholder:text-slate-400"
                        placeholder="例如: INTJ"
                      />
                    </label>
                    <label className="rounded-xl bg-slate-50 dark:bg-white/5 px-4 py-3 sm:col-span-2 border border-transparent focus-within:border-primary/30 transition-all">
                      <span className="text-[10px] font-black tracking-widest text-slate-500 dark:text-slate-400 uppercase block mb-1">性格特征</span>
                      <AutoGrowTextarea
                        value={String(draftProfile?.personality || '')}
                        onChange={(event) => setDraftProfileTextField('personality', event.target.value)}
                        className="w-full bg-transparent text-[13px] font-bold text-slate-800 dark:text-slate-100 outline-none placeholder:text-slate-400 resize-none min-h-[40px]"
                        minRows={1}
                      />
                    </label>
                    <label className="rounded-xl bg-slate-50 dark:bg-white/5 px-4 py-3 sm:col-span-2 border border-transparent focus-within:border-primary/30 transition-all">
                      <span className="text-[10px] font-black tracking-widest text-slate-500 dark:text-slate-400 uppercase block mb-1">工作方式偏好</span>
                      <AutoGrowTextarea
                        value={String(draftProfile?.workStyle || '')}
                        onChange={(event) => setDraftProfileTextField('workStyle', event.target.value)}
                        className="w-full bg-transparent text-[13px] font-bold text-slate-800 dark:text-slate-100 outline-none placeholder:text-slate-400 resize-none min-h-[40px]"
                        minRows={1}
                      />
                    </label>
                    <label className="rounded-xl bg-slate-50 dark:bg-white/5 px-4 py-3 sm:col-span-2 border border-transparent focus-within:border-primary/30 transition-all">
                      <span className="text-[10px] font-black tracking-widest text-slate-500 dark:text-slate-400 uppercase block mb-1">求职约束</span>
                      <AutoGrowTextarea
                        value={joinListText(factDraft.constraints.map((item) => item.text))}
                        onChange={(event) => applyFactSectionTextPatch('constraints', splitListText(event.target.value))}
                        className="w-full bg-transparent text-[13px] font-bold text-slate-800 dark:text-slate-100 outline-none placeholder:text-slate-400 resize-none min-h-[40px]"
                        minRows={1}
                      />
                    </label>
                  </div>
                </div>
              ) : (
                <>
                  {summaryDisplay.preferenceRows.length > 0 && (
                    <dl className="space-y-2.5">
                      {summaryDisplay.preferenceRows.map((item) => {
                        // 去重逻辑：如果当前行是性格特征或职业目标等，且包含 MBTI 文本，则剔除 MBTI 部分
                        let displayValue = item.value;
                        const mbtiRow = summaryDisplay.preferenceRows.find(r => r.label === 'MBTI');
                        if (mbtiRow && item.label !== 'MBTI') {
                          const mbtiToken = mbtiRow.value.toUpperCase();
                          // 匹配如 "INTJ", "MBTI: INTJ", "性格: INTJ" 等，不区分大小写
                          const mbtiRegex = new RegExp(`(MBTI[:：\\s-]*)?${mbtiToken}`, 'gi');
                          displayValue = displayValue.replace(mbtiRegex, '').replace(/^[，,。.!！？?;；:：、\s]+|[，,。.!！？?;；:：、\s]+$/g, '').trim();
                        }
                        
                        if (String(item.label || '').includes('性格特征')) {
                          displayValue = displayValue.replace(/[()（）]/g, '');
                        }
                        
                        if (!displayValue) return null;

                        return (
                          <div key={`${item.label}-${item.value}`}>
                            <dt className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{item.label}</dt>
                            <dd className="m-0 mt-0.5 text-xs text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">{displayValue}</dd>
                          </div>
                        );
                      })}
                    </dl>
                  )}
                  {summaryDisplay.constraints.length > 0 && (
                    <div className={summaryDisplay.preferenceRows.length > 0 ? 'mt-3.5' : ''}>
                      <p className="my-0 text-[11px] font-semibold text-slate-500 dark:text-slate-400">求职约束</p>
                      <ul className="mt-2 my-0 pl-4 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                        {summaryDisplay.constraints.map((item) => {
                          let displayItem = item;
                          const mbtiRow = summaryDisplay.preferenceRows.find(r => r.label === 'MBTI');
                          if (mbtiRow) {
                            const mbtiToken = mbtiRow.value.toUpperCase();
                            const mbtiRegex = new RegExp(`(MBTI[:：\\s-]*)?${mbtiToken}`, 'gi');
                            displayItem = displayItem.replace(mbtiRegex, '').replace(/^[，,。.!！？?;；:：、\s]+|[|，,。.!！？?;；:：、\s]+$/g, '').trim();
                          }
                          if (displayItem.includes('性格特征')) {
                            displayItem = displayItem
                              .replace(/[()（）]/g, '')
                              .replace(/性格特征\s*[:：]?\s*/, '性格特征：')
                              .replace(/\s{2,}/g, ' ')
                              .trim();
                          }
                          if (!displayItem) return null;
                          return <li key={item} className="leading-relaxed">{displayItem}</li>;
                        }).filter(Boolean)}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* 专业技能 */}
          {(isInlineEditing || summaryDisplay.skills.length > 0) && (
            <div id="section-skills" className="rounded-2xl bg-white dark:bg-surface-dark border border-slate-200/80 dark:border-white/10 p-4 sm:p-5 shadow-sm">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-amber-500/10 text-amber-500">
                  <span className="material-symbols-outlined text-[18px]">extension</span>
                </div>
                <h3 className="my-0 text-sm font-black text-slate-800 dark:text-slate-200">专业技能</h3>
              </div>
              {isInlineEditing ? (
                <div className="rounded-xl bg-slate-50 dark:bg-white/5 px-4 py-3 border border-transparent focus-within:border-primary/30 transition-all">
                  <AutoGrowTextarea
                    value={joinListText(factDraft.coreSkills.map((item) => item.text))}
                    onChange={(event) => applyFactSectionTextPatch('coreSkills', splitListText(event.target.value))}
                    className="w-full bg-transparent text-[13px] font-bold text-slate-800 dark:text-slate-100 outline-none placeholder:text-slate-400 resize-none min-h-[40px]"
                    placeholder="用顿号、逗号或换行分隔技能"
                    minRows={2}
                  />
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {summaryDisplay.skills.map((skill, idx) => (
                    <span key={`${skill}-${idx}`} className="max-w-full break-words px-2.5 py-1 bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 text-xs rounded-md">
                      {skill}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 工作经历 */}
          {(isInlineEditing || summaryDisplay.workExps.length > 0) && (
            <div id="section-work" className="rounded-2xl bg-white dark:bg-surface-dark border border-slate-200/80 dark:border-white/10 p-4 sm:p-5 shadow-sm">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-blue-500/10 text-blue-500">
                  <span className="material-symbols-outlined text-[18px]">work</span>
                </div>
                <h3 className="my-0 text-sm font-black text-slate-800 dark:text-slate-200">工作履历</h3>
              </div>
              {isInlineEditing ? (
                <div className="space-y-3">
                  {draftExperiences.map((item, index) => (
                    <div key={`${item.organization || item.title || 'experience'}-${index}`} className="rounded-lg border border-slate-200 dark:border-white/10 p-3 bg-slate-50/60 dark:bg-white/5">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">经历 {index + 1}</span>
                        <button
                          type="button"
                          onClick={() => removeExperienceItem(index)}
                          className="h-6 w-6 rounded-md border border-rose-200 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                          title="删除经历"
                        >
                          <span className="material-symbols-outlined text-[14px]">remove</span>
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <label className="rounded-xl bg-white dark:bg-white/5 px-4 py-2 border border-transparent focus-within:border-primary/30 transition-all shadow-sm">
                          <span className="text-[10px] font-black tracking-widest text-slate-500 dark:text-slate-400 uppercase block mb-0.5">公司/组织</span>
                          <input
                            value={item.organization || ''}
                            onChange={(event) => updateExperienceItem(index, 'organization', event.target.value)}
                            className="w-full h-8 bg-transparent text-[13px] font-bold text-slate-800 dark:text-slate-100 outline-none placeholder:text-slate-400"
                          />
                        </label>
                        <label className="rounded-xl bg-white dark:bg-white/5 px-4 py-2 border border-transparent focus-within:border-primary/30 transition-all shadow-sm">
                          <span className="text-[10px] font-black tracking-widest text-slate-500 dark:text-slate-400 uppercase block mb-0.5">职位</span>
                          <input
                            value={item.title || ''}
                            onChange={(event) => updateExperienceItem(index, 'title', event.target.value)}
                            className="w-full h-8 bg-transparent text-[13px] font-bold text-slate-800 dark:text-slate-100 outline-none placeholder:text-slate-400"
                          />
                        </label>
                        <label className="rounded-xl bg-white dark:bg-white/5 px-4 py-2 border border-transparent focus-within:border-primary/30 transition-all shadow-sm sm:col-span-2">
                          <span className="text-[10px] font-black tracking-widest text-slate-500 dark:text-slate-400 uppercase block mb-0.5">时间段</span>
                          <input
                            value={item.period || ''}
                            onChange={(event) => updateExperienceItem(index, 'period', event.target.value)}
                            className="w-full h-8 bg-transparent text-[13px] font-bold text-slate-800 dark:text-slate-100 outline-none placeholder:text-slate-400"
                          />
                        </label>
                        <label className="rounded-xl bg-white dark:bg-white/5 px-4 py-3 border border-transparent focus-within:border-primary/30 transition-all shadow-sm sm:col-span-2">
                          <span className="text-[10px] font-black tracking-widest text-slate-500 dark:text-slate-400 uppercase block mb-1">关键行动</span>
                          <AutoGrowTextarea
                            value={item.actions || ''}
                            onChange={(event) => updateExperienceItem(index, 'actions', event.target.value)}
                            className="w-full bg-transparent text-[13px] font-bold text-slate-800 dark:text-slate-100 outline-none placeholder:text-slate-400 resize-none min-h-[60px]"
                            minRows={3}
                          />
                        </label>
                        <label className="rounded-xl bg-white dark:bg-white/5 px-4 py-3 border border-transparent focus-within:border-primary/30 transition-all shadow-sm sm:col-span-2">
                          <span className="text-[10px] font-black tracking-widest text-slate-500 dark:text-slate-400 uppercase block mb-1">关键成果</span>
                          <AutoGrowTextarea
                            value={item.results || ''}
                            onChange={(event) => updateExperienceItem(index, 'results', event.target.value)}
                            className="w-full bg-transparent text-[13px] font-bold text-slate-800 dark:text-slate-100 outline-none placeholder:text-slate-400 resize-none min-h-[40px]"
                            minRows={2}
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={appendExperienceItem}
                    className="h-9 px-3 rounded-lg border border-slate-300 dark:border-white/10 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 inline-flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[16px]">add</span>
                    添加一段经历
                  </button>
                </div>
              ) : (
                <div className="space-y-6 relative before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-[1.5px] before:bg-slate-100 dark:before:bg-white/5">
                  {summaryDisplay.workExps.map((w, i) => (
                    <div key={w.id || i} className="relative pl-7 group">
                      <div className="absolute left-0 top-1.5 size-[15px] rounded-full bg-white dark:bg-surface-dark border-2 border-blue-500 z-10 group-hover:scale-110 transition-transform" />
                      <div className="flex flex-col gap-1">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="mt-0 mb-0 text-[15px] font-bold text-slate-900 dark:text-white leading-tight">{w.title}</h4>
                          {(w.startDate || w.endDate || w.date) && (
                            <span className="shrink-0 text-[10px] font-medium text-slate-500 dark:text-slate-400 tabular-nums">
                              {w.date || `${w.startDate || ''} - ${w.endDate || '至今'}`.replace(/^ - $/, '')}
                            </span>
                          )}
                        </div>
                        <p className="my-0 text-xs font-semibold text-blue-600 dark:text-blue-400">{w.subtitle}</p>
                        {w.description && (
                          <div className="mt-2 text-[13px] text-slate-600 dark:text-slate-400 whitespace-pre-wrap leading-relaxed space-y-2">
                            {w.description.split('\n').map((line, idx) => {
                              const trimmed = line.trim();
                              if (!trimmed) return null;
                              // 优化长列表的可读性：自动识别项目符号
                              const isBullet = trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*');
                              return (
                                <div key={idx} className={`${isBullet ? 'pl-4 relative' : ''}`}>
                                  {isBullet && <span className="absolute left-0 top-0 text-primary">•</span>}
                                  {isBullet ? trimmed.substring(1).trim() : trimmed}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 项目经历 */}
          {(isInlineEditing || summaryDisplay.projects.length > 0) && (
            <div id="section-projects" className="rounded-2xl bg-white dark:bg-surface-dark border border-slate-200/80 dark:border-white/10 p-4 sm:p-5 shadow-sm">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-500">
                  <span className="material-symbols-outlined text-[18px]">rocket_launch</span>
                </div>
                <h3 className="my-0 text-sm font-black text-slate-800 dark:text-slate-200">重点项目</h3>
              </div>
              {isInlineEditing ? (
                <div className="space-y-3">
                  {draftProjects.map((item: any, index) => (
                    <div key={item.id || index} className="rounded-lg border border-slate-200 dark:border-white/10 p-3 bg-slate-50/60 dark:bg-white/5">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">项目 {index + 1}</span>
                        <button
                          type="button"
                          onClick={() => removeProjectItem(index)}
                          className="h-6 w-6 rounded-md border border-rose-200 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                          title="删除项目"
                        >
                          <span className="material-symbols-outlined text-[14px]">remove</span>
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <label className="rounded-xl bg-white dark:bg-white/5 px-4 py-2 border border-transparent focus-within:border-primary/30 transition-all shadow-sm">
                          <span className="text-[10px] font-black tracking-widest text-slate-500 dark:text-slate-400 uppercase block mb-0.5">项目名称</span>
                          <input
                            value={item.title || ''}
                            onChange={(event) => updateProjectItem(index, 'title', event.target.value)}
                            className="w-full h-8 bg-transparent text-[13px] font-bold text-slate-800 dark:text-slate-100 outline-none placeholder:text-slate-400"
                          />
                        </label>
                        <label className="rounded-xl bg-white dark:bg-white/5 px-4 py-2 border border-transparent focus-within:border-primary/30 transition-all shadow-sm">
                          <span className="text-[10px] font-black tracking-widest text-slate-500 dark:text-slate-400 uppercase block mb-0.5">角色</span>
                          <input
                            value={item.subtitle || ''}
                            onChange={(event) => updateProjectItem(index, 'subtitle', event.target.value)}
                            className="w-full h-8 bg-transparent text-[13px] font-bold text-slate-800 dark:text-slate-100 outline-none placeholder:text-slate-400"
                          />
                        </label>
                        <label className="rounded-xl bg-white dark:bg-white/5 px-4 py-2 border border-transparent focus-within:border-primary/30 transition-all shadow-sm sm:col-span-2">
                          <span className="text-[10px] font-black tracking-widest text-slate-500 dark:text-slate-400 uppercase block mb-0.5">时间段</span>
                          <input
                            value={item.period || ''}
                            onChange={(event) => updateProjectItem(index, 'period', event.target.value)}
                            className="w-full h-8 bg-transparent text-[13px] font-bold text-slate-800 dark:text-slate-100 outline-none placeholder:text-slate-400"
                          />
                        </label>
                        <label className="rounded-xl bg-white dark:bg-white/5 px-4 py-3 border border-transparent focus-within:border-primary/30 transition-all shadow-sm sm:col-span-2">
                          <span className="text-[10px] font-black tracking-widest text-slate-500 dark:text-slate-400 uppercase block mb-1">项目描述</span>
                          <AutoGrowTextarea
                            value={item.description || ''}
                            onChange={(event) => updateProjectItem(index, 'description', event.target.value)}
                            className="w-full bg-transparent text-[13px] font-bold text-slate-800 dark:text-slate-100 outline-none placeholder:text-slate-400 resize-none min-h-[60px]"
                            minRows={3}
                          />
                        </label>
                        <label className="rounded-xl bg-white dark:bg-white/5 px-4 py-2 border border-transparent focus-within:border-primary/30 transition-all shadow-sm sm:col-span-2">
                          <span className="text-[10px] font-black tracking-widest text-slate-500 dark:text-slate-400 uppercase block mb-0.5">项目链接（可选）</span>
                          <input
                            value={item.link || ''}
                            onChange={(event) => updateProjectItem(index, 'link', event.target.value)}
                            className="w-full h-8 bg-transparent text-[13px] font-bold text-slate-800 dark:text-slate-100 outline-none placeholder:text-slate-400"
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={appendProjectItem}
                    className="h-9 px-3 rounded-lg border border-slate-300 dark:border-white/10 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 inline-flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[16px]">add</span>
                    添加一个项目
                  </button>
                </div>
              ) : (
                <div className="space-y-6 relative before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-[1.5px] before:bg-slate-100 dark:before:bg-white/5">
                  {summaryDisplay.projects.map((p, i) => (
                    <div key={p.id || i} className="relative pl-7 group">
                      <div className="absolute left-0 top-1.5 size-[15px] rounded-full bg-white dark:bg-surface-dark border-2 border-emerald-500 z-10 group-hover:scale-110 transition-transform" />
                      <div className="flex flex-col gap-1">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="mt-0 mb-0 text-[15px] font-bold text-slate-900 dark:text-white leading-tight">{p.title}</h4>
                          {p.date && (
                            <span className="shrink-0 text-[10px] font-medium text-slate-500 dark:text-slate-400 tabular-nums">
                              {p.date}
                            </span>
                          )}
                        </div>
                        <p className="my-0 text-xs font-semibold text-emerald-600 dark:text-emerald-400">{p.subtitle}</p>
                        {p.description && (
                          <div className="mt-2 text-[13px] text-slate-600 dark:text-slate-400 whitespace-pre-wrap leading-relaxed space-y-2">
                            {p.description.split('\n').map((line: string, idx: number) => {
                              const trimmed = line.trim();
                              if (!trimmed) return null;
                              const isBullet = trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*');
                              return (
                                <div key={idx} className={`${isBullet ? 'pl-4 relative' : ''}`}>
                                  {isBullet && <span className="absolute left-0 top-0 text-primary">•</span>}
                                  {isBullet ? trimmed.substring(1).trim() : trimmed}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 教育背景 */}
          {(isInlineEditing || summaryDisplay.educations.length > 0) && (
            <div id="section-education" className="rounded-2xl bg-white dark:bg-surface-dark border border-slate-200/80 dark:border-white/10 p-4 sm:p-5 shadow-sm">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-purple-500/10 text-purple-500">
                  <span className="material-symbols-outlined text-[18px]">school</span>
                </div>
                <h3 className="my-0 text-sm font-black text-slate-800 dark:text-slate-200">教育背景</h3>
              </div>
              {isInlineEditing ? (
                <div className="space-y-3">
                  {draftEducations.map((item: any, index) => (
                    <div key={item.id || index} className="rounded-lg border border-slate-200 dark:border-white/10 p-3 bg-slate-50/60 dark:bg-white/5">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">教育 {index + 1}</span>
                        <button
                          type="button"
                          onClick={() => removeEducationItem(index)}
                          className="h-6 w-6 rounded-md border border-rose-200 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                          title="删除教育背景"
                        >
                          <span className="material-symbols-outlined text-[14px]">remove</span>
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <label className="rounded-xl bg-white dark:bg-white/5 px-4 py-2 border border-transparent focus-within:border-primary/30 transition-all shadow-sm">
                          <span className="text-[10px] font-black tracking-widest text-slate-500 dark:text-slate-400 uppercase block mb-0.5">学校/院校</span>
                          <input
                            value={item.school || item.title || ''}
                            onChange={(event) => updateEducationItem(index, 'school', event.target.value)}
                            className="w-full h-8 bg-transparent text-[13px] font-bold text-slate-800 dark:text-slate-100 outline-none placeholder:text-slate-400"
                          />
                        </label>
                        <label className="rounded-xl bg-white dark:bg-white/5 px-4 py-2 border border-transparent focus-within:border-primary/30 transition-all shadow-sm">
                          <span className="text-[10px] font-black tracking-widest text-slate-500 dark:text-slate-400 uppercase block mb-0.5">学历</span>
                          <input
                            value={item.degree || ''}
                            onChange={(event) => updateEducationItem(index, 'degree', event.target.value)}
                            className="w-full h-8 bg-transparent text-[13px] font-bold text-slate-800 dark:text-slate-100 outline-none placeholder:text-slate-400"
                          />
                        </label>
                        <label className="rounded-xl bg-white dark:bg-white/5 px-4 py-2 border border-transparent focus-within:border-primary/30 transition-all shadow-sm">
                          <span className="text-[10px] font-black tracking-widest text-slate-500 dark:text-slate-400 uppercase block mb-0.5">专业</span>
                          <input
                            value={item.major || ''}
                            onChange={(event) => updateEducationItem(index, 'major', event.target.value)}
                            className="w-full h-8 bg-transparent text-[13px] font-bold text-slate-800 dark:text-slate-100 outline-none placeholder:text-slate-400"
                          />
                        </label>
                        <label className="rounded-xl bg-white dark:bg-white/5 px-4 py-2 border border-transparent focus-within:border-primary/30 transition-all shadow-sm">
                          <span className="text-[10px] font-black tracking-widest text-slate-500 dark:text-slate-400 uppercase block mb-0.5">时间段</span>
                          <input
                            value={item.period || item.date || ''}
                            onChange={(event) => updateEducationItem(index, 'period', event.target.value)}
                            className="w-full h-8 bg-transparent text-[13px] font-bold text-slate-800 dark:text-slate-100 outline-none placeholder:text-slate-400"
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={appendEducationItem}
                    className="h-9 px-3 rounded-lg border border-slate-300 dark:border-white/10 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 inline-flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[16px]">add</span>
                    添加教育背景
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {summaryDisplay.educations.map((e, i) => (
                    <div key={e.id || i} className="flex items-start gap-4 py-1 group">
                      <div className="flex items-center justify-center size-10 rounded-xl bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 shrink-0">
                        <span className="material-symbols-outlined text-[20px]">school</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="mt-0 mb-0 text-[15px] font-bold text-slate-900 dark:text-white leading-tight">{e.title || e.school}</h4>
                          {e.date && (
                            <span className="shrink-0 text-[10px] font-medium text-slate-500 dark:text-slate-400 tabular-nums">
                                {e.date}
                            </span>
                          )}
                        </div>
                        <p className="my-0 mt-1 text-[13px] text-slate-600 dark:text-slate-400">
                          {Array.from(new Set([e.degree, e.major, e.subtitle].filter(Boolean).map(s => String(s).trim()))).join(' · ')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

    </div>
  );
});

export default CareerProfileStructuredEditor;
