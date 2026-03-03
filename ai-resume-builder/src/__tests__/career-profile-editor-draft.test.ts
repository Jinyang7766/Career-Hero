import { describe, expect, it } from 'vitest';
import { createCareerProfileFactDraftSections } from '../career-profile-facts';
import type { CareerProfile } from '../career-profile-utils';
import {
  createCareerProfileEditorDraft,
  patchDraftEducations,
  patchDraftProjects,
  patchDraftWorkExps,
  projectCareerProfileEditorData,
} from '../../components/screens/career-profile/career-profile-editor-draft';

const createBaseProfile = (): CareerProfile => ({
  id: 'cp_1',
  createdAt: '2026-03-03T00:00:00.000Z',
  source: 'manual_self_report',
  summary: '有完整产品与增长经验',
  careerHighlights: ['主导增长项目'],
  coreSkills: ['增长策略'],
  constraints: ['可接受出差'],
  experiences: [
    {
      title: '产品经理',
      period: '2022-2025',
      organization: 'A公司',
      actions: '负责增长策略',
      results: '留存率提升15%',
      skills: ['增长策略'],
      inResume: 'yes',
      confidence: 'high',
      evidence: '项目复盘',
    },
  ],
  projects: [
    {
      id: 1,
      title: '增长实验平台',
      subtitle: '负责人',
      period: '2024',
      description: '建设实验框架',
      link: 'https://example.com/project',
    },
  ],
  educations: [
    {
      id: 1,
      school: '复旦大学',
      degree: '本科',
      major: '信息管理',
      period: '2014-2018',
      description: '',
    },
  ],
  personalInfo: {
    name: '',
    title: '',
    email: '',
    phone: '',
  },
  targetRole: '',
  jobDirection: '',
});

describe('career-profile-editor-draft', () => {
  it('builds draft with personal info fallback from current user', () => {
    const draft = createCareerProfileEditorDraft(createBaseProfile(), {
      name: '测试用户',
      email: 'user@example.com',
      phone: '13800000000',
    });

    expect(draft?.personalInfo?.name).toBe('测试用户');
    expect(draft?.personalInfo?.email).toBe('user@example.com');
    expect(draft?.personalInfo?.phone).toBe('13800000000');
  });

  it('projects draft into resumeData/extras using factDraft as fact source', () => {
    const base = createBaseProfile();
    const factDraft = createCareerProfileFactDraftSections({
      coreSkills: ['增长策略', '数据分析'],
      careerHighlights: ['主导增长项目'],
      constraints: ['可接受出差'],
    });
    const projection = projectCareerProfileEditorData(base, factDraft);

    expect(projection.resumeData.skills).toEqual(['增长策略', '数据分析']);
    expect(projection.extras.careerHighlights).toEqual(['主导增长项目']);
    expect(projection.extras.constraints).toEqual(['可接受出差']);
  });

  it('patches work experiences through workExp projection and writes back to profile experiences', () => {
    const base = createBaseProfile();
    const patched = patchDraftWorkExps(base, (items) =>
      items.map((item) => ({
        ...item,
        title: 'B公司',
        subtitle: '高级产品经理',
        date: '2023-2026',
        description: '负责核心增长闭环\n成果：转化提升20%',
      }))
    );

    expect(patched.experiences[0]?.organization).toBe('B公司');
    expect(patched.experiences[0]?.title).toBe('高级产品经理');
    expect(patched.experiences[0]?.period).toBe('2023-2026');
    expect(patched.experiences[0]?.actions).toBe('负责核心增长闭环');
    expect(patched.experiences[0]?.results).toBe('转化提升20%');
    expect(patched.experiences[0]?.evidence).toBe('项目复盘');
  });

  it('maps project and education date fields back to profile period fields', () => {
    const base = createBaseProfile();
    const nextProjects = patchDraftProjects(base, (items) =>
      items.map((item) => ({ ...item, date: '2025', description: '升级实验平台' }))
    );
    const nextEducations = patchDraftEducations(nextProjects, (items) =>
      items.map((item) => ({ ...item, date: '2013-2017', major: '计算机科学' }))
    );

    expect((nextEducations.projects || [])[0]?.period).toBe('2025');
    expect((nextEducations.projects || [])[0]?.description).toBe('升级实验平台');
    expect((nextEducations.educations || [])[0]?.period).toBe('2013-2017');
    expect((nextEducations.educations || [])[0]?.major).toBe('计算机科学');
  });

  it('hydrates summary sections from atomic tags when manual override is enabled', () => {
    const base = createBaseProfile();
    const draft = createCareerProfileEditorDraft(
      {
        ...base,
        summary: '旧总结',
        coreSkills: ['旧技能'],
        careerHighlights: ['旧亮点'],
        constraints: ['旧约束'],
        targetRole: '旧岗位',
        jobDirection: '旧方向',
        atomicTagsManualOverride: true as any,
        atomicTags: [
          { id: 's1', category: 'summary', text: '新总结', key: '新总结' },
          { id: 'i1', category: 'intent', text: '新岗位', key: '新岗位' },
          { id: 'k1', category: 'fact_skill', text: '新技能', key: '新技能' },
          { id: 'h1', category: 'fact_highlight', text: '新亮点', key: '新亮点' },
          { id: 'c1', category: 'fact_constraint', text: '新约束', key: '新约束' },
        ] as any,
      } as any,
      null
    );

    expect(draft?.summary).toBe('新总结');
    expect(draft?.personalInfo?.title).toBe('新岗位');
    expect(draft?.targetRole).toBe('新岗位');
    expect(draft?.coreSkills).toEqual(['新技能']);
    expect(draft?.careerHighlights).toEqual(['新亮点']);
    expect(draft?.constraints).toEqual(['新约束']);
  });

  it('prefers identity atomic tags for personal name/email over fallback email prefix', () => {
    const base = createBaseProfile();
    const draft = createCareerProfileEditorDraft(
      {
        ...base,
        personalInfo: {
          ...(base.personalInfo || {}),
          name: '123',
          email: '123@163.com',
        },
        atomicTagsManualOverride: true as any,
        atomicTags: [
          {
            id: 'id_name',
            category: 'identity',
            text: '陈金阳',
            key: '陈金阳',
            sourcePaths: ['atomicTags.identity'],
          },
          {
            id: 'id_email',
            category: 'identity',
            text: '123@163.com',
            key: '123163com',
            sourcePaths: ['atomicTags.identity'],
          },
        ] as any,
      } as any,
      {
        name: '123',
        email: '123@163.com',
      }
    );

    expect(draft?.personalInfo?.name).toBe('陈金阳');
    expect(draft?.personalInfo?.email).toBe('123@163.com');
  });

  it('hydrates experience/project/education display blocks from manually edited atomic tags', () => {
    const base = createBaseProfile();
    const draft = createCareerProfileEditorDraft(
      {
        ...base,
        atomicTagsManualOverride: true as any,
        atomicTags: [
          {
            id: 'e1',
            category: 'experience',
            text: '主导 B2B 增长体系搭建',
            key: '主导B2B增长体系搭建',
            sourcePaths: ['atomicTags.experience'],
          },
          {
            id: 'p1',
            category: 'project',
            text: '增长实验平台 2.0',
            key: '增长实验平台20',
            sourcePaths: ['atomicTags.project'],
          },
          {
            id: 'd1',
            category: 'education',
            text: '在职研究生（数据科学）',
            key: '在职研究生数据科学',
            sourcePaths: ['atomicTags.education'],
          },
        ] as any,
      } as any,
      null
    );

    expect(draft?.experiences?.[0]?.organization).toBe('主导 B2B 增长体系搭建');
    expect((draft?.projects as any)?.[0]?.title).toBe('增长实验平台 2.0');
    expect((draft?.educations as any)?.[0]?.school).toBe('在职研究生（数据科学）');
  });
});
