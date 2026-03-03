import { describe, expect, it } from 'vitest';
import type { ResumeData } from '../../types';
import {
  buildPreviewPersonalDirtyKey,
  buildPreviewSectionCollectionDirtyKey,
  buildPreviewSectionFieldDirtyKey,
  buildPreviewSkillDirtyKey,
  buildPreviewSkillsCollectionDirtyKey,
  buildPreviewSummaryDirtyKey,
  resolvePreviewDirtyKeys,
} from '../../components/screens/preview/preview-dirty';
import { getPreviewExportGuardState } from '../../components/screens/preview/preview-export-guard';

const createResumeData = (): ResumeData => ({
  personalInfo: {
    name: '张三',
    title: '产品经理',
    email: 'zhangsan@example.com',
    phone: '13800000000',
    summary: '5 年产品经验',
  },
  workExps: [
    { id: 1, title: 'A 公司', subtitle: '产品经理', date: '2022-2025', description: '负责增长项目' },
  ],
  educations: [
    { id: 2, title: '复旦大学', subtitle: '信息管理', date: '2014-2018', description: '' },
  ],
  projects: [
    { id: 3, title: '增长平台', subtitle: '负责人', date: '2024', description: '搭建实验平台' },
  ],
  skills: ['策略', '数据分析'],
  summary: '5 年产品经验',
  templateId: 'modern',
});

describe('preview-dirty', () => {
  it('tracks field-level dirty state and clears after reverting value', () => {
    const baseline = createResumeData();
    const dirtyKey = buildPreviewPersonalDirtyKey('name');

    const changed = {
      ...baseline,
      personalInfo: { ...baseline.personalInfo, name: '李四' },
    };
    expect(
      resolvePreviewDirtyKeys({ baseline, current: changed, trackedKeys: [dirtyKey] })
    ).toEqual([dirtyKey]);

    const reverted = {
      ...changed,
      personalInfo: { ...changed.personalInfo, name: baseline.personalInfo.name },
    };
    expect(
      resolvePreviewDirtyKeys({ baseline, current: reverted, trackedKeys: [dirtyKey] })
    ).toEqual([]);
  });

  it('tracks summary / section / skills dirty keys consistently', () => {
    const baseline = createResumeData();
    const current: ResumeData = {
      ...baseline,
      summary: '8 年产品经验',
      workExps: [...baseline.workExps, { id: 9, title: '', subtitle: '', date: '', description: '' }],
      skills: ['策略', '用户研究'],
    };

    const trackedKeys = [
      buildPreviewSummaryDirtyKey(),
      buildPreviewSectionCollectionDirtyKey('workExps'),
      buildPreviewSectionFieldDirtyKey('workExps', 1, 'title'),
      buildPreviewSkillDirtyKey(1),
      buildPreviewSkillsCollectionDirtyKey(),
    ];

    const dirty = resolvePreviewDirtyKeys({ baseline, current, trackedKeys });
    expect(dirty).toContain(buildPreviewSummaryDirtyKey());
    expect(dirty).toContain(buildPreviewSectionCollectionDirtyKey('workExps'));
    expect(dirty).toContain(buildPreviewSkillDirtyKey(1));
    expect(dirty).toContain(buildPreviewSkillsCollectionDirtyKey());
    expect(dirty).not.toContain(buildPreviewSectionFieldDirtyKey('workExps', 1, 'title'));
  });
});

describe('preview-export-guard', () => {
  it('blocks export with explicit copy during edit mode', () => {
    const state = getPreviewExportGuardState({
      isEditMode: true,
      isSavingEdit: false,
      hasDirtyChanges: true,
      isGenerating: false,
    });

    expect(state.disabled).toBe(true);
    expect(state.buttonText).toContain('完成编辑');
    expect(state.reason).toContain('完成');
    expect(state.helperText).toContain('编辑态');
  });

  it('allows export only when not editing and no pending dirty changes', () => {
    const state = getPreviewExportGuardState({
      isEditMode: false,
      isSavingEdit: false,
      hasDirtyChanges: false,
      isGenerating: false,
    });

    expect(state.disabled).toBe(false);
    expect(state.buttonText).toBe('导出 PDF');
    expect(state.reason).toBe('');
  });
});
