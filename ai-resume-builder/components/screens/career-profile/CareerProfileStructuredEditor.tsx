import React from 'react';
import type { CareerProfile, CareerProfileExperience } from '../../../src/career-profile-utils';

type Props = {
  profile: CareerProfile | null;
  isSaving: boolean;
  onSave: (draft: CareerProfile) => Promise<void> | void;
};

const splitByLines = (value: string) =>
  String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

const splitBySkillTokens = (value: string) =>
  String(value || '')
    .split(/[、,，\n]/)
    .map((token) => token.trim())
    .filter(Boolean);

const createEmptyExperience = (): CareerProfileExperience => ({
  title: '',
  period: '',
  organization: '',
  actions: '',
  results: '',
  skills: [],
  inResume: 'unknown',
  confidence: 'medium',
  evidence: '来自用户自述',
});

const cloneProfile = (profile: CareerProfile | null): CareerProfile | null => {
  if (!profile) return null;
  return {
    ...profile,
    careerHighlights: Array.isArray(profile.careerHighlights) ? [...profile.careerHighlights] : [],
    coreSkills: Array.isArray(profile.coreSkills) ? [...profile.coreSkills] : [],
    constraints: Array.isArray(profile.constraints) ? [...profile.constraints] : [],
    experiences: Array.isArray(profile.experiences)
      ? profile.experiences.map((item) => ({
        ...item,
        skills: Array.isArray(item.skills) ? [...item.skills] : [],
      }))
      : [],
  };
};

const CareerProfileStructuredEditor: React.FC<Props> = ({
  profile,
  isSaving,
  onSave,
}) => {
  const [draft, setDraft] = React.useState<CareerProfile | null>(() => cloneProfile(profile));

  React.useEffect(() => {
    setDraft(cloneProfile(profile));
  }, [profile]);

  const updateDraft = React.useCallback((updater: (prev: CareerProfile) => CareerProfile) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return updater(prev);
    });
  }, []);

  const updateExperience = React.useCallback((index: number, updater: (prev: CareerProfileExperience) => CareerProfileExperience) => {
    updateDraft((prev) => {
      const nextList = Array.isArray(prev.experiences) ? [...prev.experiences] : [];
      if (!nextList[index]) return prev;
      nextList[index] = updater(nextList[index]);
      return { ...prev, experiences: nextList };
    });
  }, [updateDraft]);

  const removeExperience = React.useCallback((index: number) => {
    updateDraft((prev) => {
      const nextList = Array.isArray(prev.experiences) ? [...prev.experiences] : [];
      if (index < 0 || index >= nextList.length) return prev;
      nextList.splice(index, 1);
      return { ...prev, experiences: nextList };
    });
  }, [updateDraft]);

  const addExperience = React.useCallback(() => {
    updateDraft((prev) => ({
      ...prev,
      experiences: [...(Array.isArray(prev.experiences) ? prev.experiences : []), createEmptyExperience()],
    }));
  }, [updateDraft]);

  if (!draft) {
    return (
      <div className="rounded-2xl bg-white dark:bg-surface-dark border border-slate-200/80 dark:border-white/10 p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">AI 整理结果</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              先填写经历并点击“交给 AI 帮你整理和提炼”，整理完成后可以在这里逐项编辑确认。
            </p>
          </div>
          <span className="material-symbols-outlined text-slate-400 dark:text-slate-500">edit_note</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white dark:bg-surface-dark border border-slate-200/80 dark:border-white/10 p-4 shadow-sm space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">AI 整理结果（可编辑）</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            可以直接修改后保存，后续 JD 诊断和简历优化会按这里的事实库执行。
          </p>
        </div>
        <span className="material-symbols-outlined text-primary">auto_fix_high</span>
      </div>

      <div>
        <label className="text-xs font-bold text-slate-700 dark:text-slate-300">职业画像总结</label>
        <textarea
          value={String(draft.summary || '')}
          onChange={(event) => updateDraft((prev) => ({ ...prev, summary: event.target.value }))}
          className="mt-1 w-full min-h-[96px] resize-none rounded-lg border bg-slate-50 dark:bg-[#111a22] border-slate-300 dark:border-[#334155] text-slate-900 dark:text-white px-3 py-2 text-sm leading-relaxed outline-none transition-all focus:ring-2 focus:ring-primary focus:border-transparent"
          placeholder="例如：你具备哪些岗位能力、核心优势与约束条件"
        />
      </div>

      <div className="grid grid-cols-1 gap-3">
        <div>
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300">亮点事实（每行一条）</label>
          <textarea
            value={(draft.careerHighlights || []).join('\n')}
            onChange={(event) => updateDraft((prev) => ({ ...prev, careerHighlights: splitByLines(event.target.value) }))}
            className="mt-1 w-full min-h-[84px] resize-none rounded-lg border bg-slate-50 dark:bg-[#111a22] border-slate-300 dark:border-[#334155] text-slate-900 dark:text-white px-3 py-2 text-sm leading-relaxed outline-none transition-all focus:ring-2 focus:ring-primary focus:border-transparent"
            placeholder="例如：主导某业务增长项目，转化率提升 15%"
          />
        </div>

        <div>
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300">核心技能（逗号/顿号分隔）</label>
          <input
            value={(draft.coreSkills || []).join('、')}
            onChange={(event) => updateDraft((prev) => ({ ...prev, coreSkills: splitBySkillTokens(event.target.value) }))}
            className="mt-1 w-full h-11 rounded-lg border bg-slate-50 dark:bg-[#111a22] border-slate-300 dark:border-[#334155] text-slate-900 dark:text-white px-3 text-sm outline-none transition-all focus:ring-2 focus:ring-primary focus:border-transparent"
            placeholder="例如：SQL、A/B Test、数据分析"
          />
        </div>

        <div>
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300">约束条件（每行一条）</label>
          <textarea
            value={(draft.constraints || []).join('\n')}
            onChange={(event) => updateDraft((prev) => ({ ...prev, constraints: splitByLines(event.target.value) }))}
            className="mt-1 w-full min-h-[84px] resize-none rounded-lg border bg-slate-50 dark:bg-[#111a22] border-slate-300 dark:border-[#334155] text-slate-900 dark:text-white px-3 py-2 text-sm leading-relaxed outline-none transition-all focus:ring-2 focus:ring-primary focus:border-transparent"
            placeholder="例如：未明确的数据不要补全，未知时间线不要编造"
          />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-slate-700 dark:text-slate-300">关键经历条目</p>
          <button
            type="button"
            onClick={addExperience}
            className="h-8 px-3 rounded-lg bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-200 dark:hover:bg-white/15 transition-colors"
          >
            + 新增经历
          </button>
        </div>

        {(draft.experiences || []).length === 0 && (
          <p className="text-xs text-slate-500 dark:text-slate-400">暂无经历条目，可点击“新增经历”补充。</p>
        )}

        {(draft.experiences || []).map((item, index) => (
          <div key={`${item.title || 'exp'}-${index}`} className="rounded-xl border border-slate-200 dark:border-white/10 p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">经历 {index + 1}</p>
              <button
                type="button"
                onClick={() => removeExperience(index)}
                className="text-xs font-bold text-rose-600 hover:text-rose-700 transition-colors"
              >
                删除
              </button>
            </div>

            <input
              value={String(item.title || '')}
              onChange={(event) => updateExperience(index, (prev) => ({ ...prev, title: event.target.value }))}
              className="w-full h-10 rounded-lg border bg-slate-50 dark:bg-[#111a22] border-slate-300 dark:border-[#334155] text-slate-900 dark:text-white px-3 text-sm outline-none transition-all focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="经历标题"
            />

            <div className="grid grid-cols-2 gap-2.5">
              <input
                value={String(item.period || '')}
                onChange={(event) => updateExperience(index, (prev) => ({ ...prev, period: event.target.value }))}
                className="h-10 rounded-lg border bg-slate-50 dark:bg-[#111a22] border-slate-300 dark:border-[#334155] text-slate-900 dark:text-white px-3 text-sm outline-none transition-all focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="时间范围"
              />
              <input
                value={String(item.organization || '')}
                onChange={(event) => updateExperience(index, (prev) => ({ ...prev, organization: event.target.value }))}
                className="h-10 rounded-lg border bg-slate-50 dark:bg-[#111a22] border-slate-300 dark:border-[#334155] text-slate-900 dark:text-white px-3 text-sm outline-none transition-all focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="公司/组织"
              />
            </div>

            <textarea
              value={String(item.actions || '')}
              onChange={(event) => updateExperience(index, (prev) => ({ ...prev, actions: event.target.value }))}
              className="w-full min-h-[72px] resize-none rounded-lg border bg-slate-50 dark:bg-[#111a22] border-slate-300 dark:border-[#334155] text-slate-900 dark:text-white px-3 py-2 text-sm leading-relaxed outline-none transition-all focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="你做了什么"
            />

            <textarea
              value={String(item.results || '')}
              onChange={(event) => updateExperience(index, (prev) => ({ ...prev, results: event.target.value }))}
              className="w-full min-h-[72px] resize-none rounded-lg border bg-slate-50 dark:bg-[#111a22] border-slate-300 dark:border-[#334155] text-slate-900 dark:text-white px-3 py-2 text-sm leading-relaxed outline-none transition-all focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="结果与产出（未知可留空）"
            />

            <input
              value={(item.skills || []).join('、')}
              onChange={(event) => updateExperience(index, (prev) => ({ ...prev, skills: splitBySkillTokens(event.target.value) }))}
              className="w-full h-10 rounded-lg border bg-slate-50 dark:bg-[#111a22] border-slate-300 dark:border-[#334155] text-slate-900 dark:text-white px-3 text-sm outline-none transition-all focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="涉及技能（逗号/顿号分隔）"
            />

            <div className="grid grid-cols-2 gap-2.5">
              <select
                value={item.inResume}
                onChange={(event) => updateExperience(index, (prev) => ({ ...prev, inResume: event.target.value as CareerProfileExperience['inResume'] }))}
                className="h-10 rounded-lg border bg-slate-50 dark:bg-[#111a22] border-slate-300 dark:border-[#334155] text-slate-900 dark:text-white px-3 text-sm outline-none transition-all focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="yes">已写入简历</option>
                <option value="no">未写入简历</option>
                <option value="unknown">未确认</option>
              </select>
              <select
                value={item.confidence}
                onChange={(event) => updateExperience(index, (prev) => ({ ...prev, confidence: event.target.value as CareerProfileExperience['confidence'] }))}
                className="h-10 rounded-lg border bg-slate-50 dark:bg-[#111a22] border-slate-300 dark:border-[#334155] text-slate-900 dark:text-white px-3 text-sm outline-none transition-all focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="high">高置信度</option>
                <option value="medium">中置信度</option>
                <option value="low">低置信度</option>
              </select>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => { void onSave(draft); }}
        disabled={isSaving}
        className="w-full h-11 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isSaving ? '保存中...' : '保存当前画像编辑'}
      </button>
    </div>
  );
};

export default CareerProfileStructuredEditor;
