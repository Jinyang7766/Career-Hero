import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ResumeData } from '../../types';
import {
  buildPreviewPersonalDirtyKey,
  buildPreviewSectionCollectionDirtyKey,
  buildPreviewSummaryDirtyKey,
} from '../../components/screens/preview/preview-dirty';
import {
  renderPreviewTemplate,
  type PreviewEditBindings,
} from '../../components/screens/preview/PreviewTemplates';

const createResumeData = (): ResumeData => ({
  personalInfo: {
    name: '王小明',
    title: '前端工程师',
    email: 'xiaoming@example.com',
    phone: '13800138000',
    summary: '擅长 React 与性能优化',
  },
  workExps: [
    {
      id: 1,
      title: '火箭公司',
      subtitle: '前端工程师',
      date: '2021-2026',
      description: '负责中后台与可视化平台建设',
    },
  ],
  educations: [],
  projects: [],
  skills: ['React', 'TypeScript'],
  summary: '擅长 React 与性能优化',
  templateId: 'modern',
});

const createEditBindings = (dirtyKeys: string[]): PreviewEditBindings => {
  const dirtySet = new Set(dirtyKeys);
  return {
    enabled: true,
    onPersonalFieldChange: () => {},
    onSummaryChange: () => {},
    onWorkFieldChange: () => {},
    onEducationFieldChange: () => {},
    onProjectFieldChange: () => {},
    onAddWorkItem: () => {},
    onRemoveWorkItem: () => {},
    onAddEducationItem: () => {},
    onRemoveEducationItem: () => {},
    onAddProjectItem: () => {},
    onRemoveProjectItem: () => {},
    onSkillItemChange: () => {},
    onAddSkillItem: () => {},
    onRemoveSkillItem: () => {},
    onSkillsTextChange: () => {},
    isFieldDirty: (dirtyKey: string) => dirtySet.has(dirtyKey),
  };
};

describe('preview template dirty indicator consistency', () => {
  it('renders dirty indicator attributes in all templates for the same dirty keys', () => {
    const data = createResumeData();
    const dirtyKeys = [
      buildPreviewPersonalDirtyKey('name'),
      buildPreviewSummaryDirtyKey(),
      buildPreviewSectionCollectionDirtyKey('workExps'),
    ];

    for (const templateId of ['modern', 'classic', 'minimal'] as const) {
      const html = renderToStaticMarkup(
        renderPreviewTemplate({
          templateId,
          data: { ...data, templateId },
          sectionOrder: ['summary', 'workExps', 'skills', 'educations', 'projects'],
          onMoveSection: () => {},
          hideOrderButtons: false,
          editBindings: createEditBindings(dirtyKeys),
        }) as React.ReactElement
      );

      expect(html).toContain('data-dirty-key="personalInfo.name"');
      expect(html).toContain('data-dirty-key="summary"');
      expect((html.match(/data-dirty="true"/g) || []).length).toBeGreaterThanOrEqual(2);
      expect(html).toContain('该模块存在未保存改动');
    }
  });
});
