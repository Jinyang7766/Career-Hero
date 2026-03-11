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
import { buildCareerProfileSummaryDisplayModel } from '../../components/screens/career-profile/summary-display-logic';
import { sanitizeCareerProfileSingleMappingFields } from '../../components/screens/career-profile/CareerProfileStructuredEditor';
import type { ResumeData } from '../../types';

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

const createEmptyFactDraft = () =>
  createCareerProfileFactDraftSections({
    coreSkills: [],
    careerHighlights: [],
    constraints: [],
  });

const applySingleMappingSanitize = (
  draft: CareerProfile,
  base: CareerProfile,
  touchState: Parameters<typeof sanitizeCareerProfileSingleMappingFields>[2]
): CareerProfile => {
  const singleMapped = sanitizeCareerProfileSingleMappingFields(draft, base, touchState);
  return {
    ...draft,
    ...singleMapped,
    personalInfo: {
      ...(draft.personalInfo || {}),
      ...(singleMapped.personalInfo || {}),
    },
  };
};

const pickRow = (rows: Array<{ label: string; value: string }>, label: string): string =>
  rows.find((item) => item.label === label)?.value || '';

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

    expect(projection.resumeData.skills).toHaveLength(2);
    expect(projection.resumeData.skills).toContain('增长策略');
    expect(projection.resumeData.skills).toContain('数据分析');
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

  it('keeps canonical profile fields when atomic tags are generated but not manually edited', () => {
    const base = createBaseProfile();
    const draft = createCareerProfileEditorDraft(
      {
        ...base,
        summary: '保留原总结',
        coreSkills: ['保留原技能'],
        careerHighlights: ['保留原亮点'],
        constraints: ['保留原约束'],
        targetRole: '保留原岗位',
        jobDirection: '保留原方向',
        atomicTagsManualOverride: true as any,
        atomicTags: [
          { id: 's1', category: 'summary', text: '旧总结标签', key: '旧总结标签', sourcePaths: ['summary'] },
          { id: 'i1', category: 'intent', text: '旧岗位标签', key: '旧岗位标签', sourcePaths: ['targetRole'] },
          { id: 'k1', category: 'fact_skill', text: '旧技能标签', key: '旧技能标签', sourcePaths: ['coreSkills[0]'] },
          { id: 'h1', category: 'fact_highlight', text: '旧亮点标签', key: '旧亮点标签', sourcePaths: ['careerHighlights[0]'] },
          { id: 'c1', category: 'fact_constraint', text: '旧约束标签', key: '旧约束标签', sourcePaths: ['constraints[0]'] },
        ] as any,
      } as any,
      null
    );

    expect(draft?.summary).toBe('保留原总结');
    expect(draft?.personalInfo?.title).toBe('保留原岗位');
    expect(draft?.targetRole).toBe('保留原岗位');
    expect(draft?.coreSkills).toEqual(['保留原技能']);
    expect(draft?.careerHighlights).toEqual(['保留原亮点']);
    expect(draft?.constraints).toEqual(['保留原约束']);
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
          { id: 's1', category: 'summary', text: '新总结', key: '新总结', sourcePaths: ['atomicTags.summary'] },
          { id: 'i1', category: 'intent', text: '新岗位', key: '新岗位', sourcePaths: ['atomicTags.intent'] },
          { id: 'k1', category: 'fact_skill', text: '新技能', key: '新技能', sourcePaths: ['atomicTags.fact_skill'] },
          { id: 'h1', category: 'fact_highlight', text: '新亮点', key: '新亮点', sourcePaths: ['atomicTags.fact_highlight'] },
          { id: 'c1', category: 'fact_constraint', text: '新约束', key: '新约束', sourcePaths: ['atomicTags.fact_constraint'] },
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

  it('does not pollute personal name with gender-only identity tags', () => {
    const base = createBaseProfile();
    const draft = createCareerProfileEditorDraft(
      {
        ...base,
        personalInfo: {
          ...(base.personalInfo || {}),
          name: '陈金阳',
          email: 'cjy@example.com',
        },
        atomicTagsManualOverride: true as any,
        atomicTags: [
          {
            id: 'id_gender',
            category: 'identity',
            text: '男',
            key: '男',
            sourcePaths: ['atomicTags.identity'],
          },
        ] as any,
      } as any,
      {
        name: '陈金阳',
        email: 'cjy@example.com',
      }
    );

    expect(draft?.personalInfo?.name).toBe('陈金阳');
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
  it('hydrates mbti field from the same display-source chain used by read-only summary', () => {
    const base = createBaseProfile();
    const draft = createCareerProfileEditorDraft(
      {
        ...base,
        mbti: '',
        personality: 'MBTI: INTJ',
        constraints: ['MBTI: INTJ', '希望远程办公'],
      } as any,
      null
    );

    expect(draft?.mbti).toBe('INTJ');
    expect(draft?.personality).toBe('');
    expect(draft?.constraints).toEqual(['希望远程办公']);
  });

  it('cleans personality for editor while preserving non-mbti descriptions', () => {
    const base = createBaseProfile();
    const draft = createCareerProfileEditorDraft(
      {
        ...base,
        mbti: '',
        personality: '性格特征：(INTJ) 逻辑严谨（善于抽象）',
      } as any,
      null
    );

    expect(draft?.mbti).toBe('INTJ');
    expect(draft?.personality).toBe('逻辑严谨善于抽象');
  });

  it('projects targetRole/jobDirection as a single canonical mapping', () => {
    const base = createBaseProfile();
    const draft = createCareerProfileEditorDraft(
      {
        ...base,
        targetRole: '',
        jobDirection: '数据分析师',
        personalInfo: {
          ...(base.personalInfo || {}),
          title: '',
        },
      } as any,
      null
    );
    const factDraft = createCareerProfileFactDraftSections({
      coreSkills: [],
      careerHighlights: [],
      constraints: [],
    });
    const projection = projectCareerProfileEditorData(draft, factDraft);

    expect(draft?.targetRole).toBe('数据分析师');
    expect(draft?.jobDirection).toBe('');
    expect(projection.extras.targetRole).toBe('数据分析师');
    expect(projection.extras.jobDirection).toBe('');
  });


  it('guards single-mapping save payload from derived backfill and duplicated mirrors', () => {
    const base = {
      ...createBaseProfile(),
      targetRole: '',
      jobDirection: '数据分析师',
      mbti: '',
      personality: 'MBTI: INTJ',
      gender: '',
      personalInfo: {
        ...(createBaseProfile().personalInfo || {}),
        title: '',
        gender: 'female',
      },
    } as CareerProfile;

    const draft = {
      ...base,
      targetRole: '数据分析师',
      jobDirection: '数据分析师',
      mbti: 'INTJ',
      personalInfo: {
        ...(base.personalInfo || {}),
        title: '数据分析师',
      },
    } as CareerProfile;

    const untouched = sanitizeCareerProfileSingleMappingFields(draft, base, {});
    expect(untouched.targetRole).toBe('');
    expect(untouched.jobDirection).toBe('数据分析师');
    expect(untouched.mbti).toBe('');
    expect(untouched.personality).toBe('MBTI: INTJ');
    expect(untouched.gender).toBe('');
    expect(untouched.personalInfo.gender).toBe('female');

    const edited = sanitizeCareerProfileSingleMappingFields(
      {
        ...draft,
        targetRole: '高级数据分析师',
        personalInfo: {
          ...(draft.personalInfo || {}),
          title: '高级数据分析师',
        },
        gender: 'male',
        mbti: 'ENTJ',
        personality: 'MBTI: ENTJ',
      },
      base,
      { intent: true, gender: true, mbti: true, personality: true }
    );

    expect(edited.targetRole).toBe('高级数据分析师');
    expect(edited.jobDirection).toBe('');
    expect(edited.personalInfo.gender).toBe('');
    expect(edited.personality).toBe('');
  });

  it('keeps mbti-derived text read-only in summary display model', () => {
    const resumeData: ResumeData = {
      personalInfo: {
        name: '张三',
        title: '产品经理',
        email: 'zhangsan@example.com',
        phone: '13800000000',
      },
      summary: '具备跨团队协作经验',
      skills: ['增长策略'],
      workExps: [],
      projects: [],
      educations: [],
    };

    const model = buildCareerProfileSummaryDisplayModel(resumeData, {
      mbti: 'INTJ',
      personality: 'MBTI: INTJ',
      workStyle: 'INTJ',
      constraints: ['MBTI: INTJ', '希望每周两天远程'],
    });

    expect(model.preferenceRows.filter((item) => item.label === 'MBTI')).toHaveLength(1);
    expect(model.preferenceRows.some((item) => item.label === '性格特征')).toBe(false);
    expect(model.preferenceRows.some((item) => item.label === '工作方式偏好')).toBe(false);
    expect(model.constraints).toEqual(['希望每周两天远程']);
  });

  it('regresses mbti/personality consistency through edit -> save payload -> summary display', () => {
    const base = {
      ...createBaseProfile(),
      mbti: '',
      personality: 'MBTI: INTJ',
      constraints: ['MBTI: INTJ', '偏好远程'],
    } as CareerProfile;

    const hydrated = createCareerProfileEditorDraft(base, null) as CareerProfile;
    expect(hydrated.mbti).toBe('INTJ');
    expect(hydrated.personality).toBe('');
    expect(hydrated.constraints).toEqual(['偏好远程']);

    const saved = applySingleMappingSanitize(
      {
        ...hydrated,
        mbti: 'ENTP',
        personality: 'MBTI: ENTP',
      } as CareerProfile,
      base,
      { mbti: true, personality: true }
    );

    const projection = projectCareerProfileEditorData(saved, createEmptyFactDraft());
    const model = buildCareerProfileSummaryDisplayModel(projection.resumeData, projection.extras);

    expect(projection.extras.mbti).toBe('ENTP');
    expect(projection.extras.personality).toBe('');
    expect(model.preferenceRows.filter((item) => item.label === 'MBTI' && item.value === 'ENTP')).toHaveLength(1);
    expect(model.preferenceRows.some((item) => item.label === '性格特征')).toBe(false);
  });

  it('regresses basic info consistency through edit -> projection -> summary display', () => {
    const base = createBaseProfile();
    const draft = createCareerProfileEditorDraft(base, null) as CareerProfile;
    const edited = {
      ...draft,
      personalInfo: {
        ...(draft.personalInfo || {}),
        name: '李四',
        email: 'lisi@example.com',
        phone: '13900001111',
        location: '上海',
      },
    } as CareerProfile;

    const projection = projectCareerProfileEditorData(edited, createEmptyFactDraft());
    const model = buildCareerProfileSummaryDisplayModel(projection.resumeData, projection.extras);

    expect(projection.resumeData.personalInfo.name).toBe('李四');
    expect(projection.resumeData.personalInfo.email).toBe('lisi@example.com');
    expect(projection.resumeData.personalInfo.phone).toBe('13900001111');
    expect(projection.resumeData.personalInfo.location).toBe('上海');
    expect(pickRow(model.basicInfoRows, '姓名')).toBe('李四');
    expect(pickRow(model.basicInfoRows, '邮箱')).toBe('lisi@example.com');
    expect(pickRow(model.basicInfoRows, '电话')).toBe('13900001111');
    expect(pickRow(model.basicInfoRows, '所在城市')).toBe('上海');
  });

  it('regresses intent consistency with single mapping through edit -> save payload -> summary display', () => {
    const base = {
      ...createBaseProfile(),
      targetRole: '',
      jobDirection: '数据分析师',
      personalInfo: {
        ...(createBaseProfile().personalInfo || {}),
        title: '数据分析师',
      },
    } as CareerProfile;

    const draft = createCareerProfileEditorDraft(base, null) as CareerProfile;
    const saved = applySingleMappingSanitize(
      {
        ...draft,
        targetRole: '高级数据分析师',
        jobDirection: '高级数据分析师',
        personalInfo: {
          ...(draft.personalInfo || {}),
          title: '高级数据分析师',
        },
      } as CareerProfile,
      base,
      { intent: true }
    );

    const projection = projectCareerProfileEditorData(saved, createEmptyFactDraft());
    const model = buildCareerProfileSummaryDisplayModel(projection.resumeData, projection.extras);

    expect(saved.targetRole).toBe('高级数据分析师');
    expect(saved.jobDirection).toBe('');
    expect(saved.personalInfo.title).toBe('高级数据分析师');
    expect(projection.extras.targetRole).toBe('高级数据分析师');
    expect(projection.extras.jobDirection).toBe('');
    expect(pickRow(model.basicInfoRows, '求职意向')).toBe('高级数据分析师');
  });

  it('dedupes same-value intent and mbti mirrors in summary projection', () => {
    const resumeData: ResumeData = {
      personalInfo: {
        name: '王五',
        title: '数据分析师',
        email: 'wangwu@example.com',
        phone: '13800000001',
      },
      summary: '聚焦数据分析与增长实验。',
      skills: ['SQL'],
      workExps: [],
      projects: [],
      educations: [],
    };

    const model = buildCareerProfileSummaryDisplayModel(resumeData, {
      targetRole: '数据分析师',
      mbti: 'INTJ',
      personality: 'MBTI: INTJ',
      careerHighlights: ['增长复盘机制搭建', ' 增长复盘机制搭建 '],
      constraints: ['可接受远程', '可接受远程 '],
    });

    expect(model.basicInfoRows.filter((item) => item.label === '求职意向')).toHaveLength(1);
    expect(pickRow(model.basicInfoRows, '求职意向')).toBe('数据分析师');
    expect(model.preferenceRows.filter((item) => item.label === 'MBTI' && item.value === 'INTJ')).toHaveLength(1);
    expect(model.preferenceRows.some((item) => item.label === '性格特征')).toBe(false);
    expect(model.highlights).toEqual(['增长复盘机制搭建']);
    expect(model.constraints).toEqual(['可接受远程']);
  });

  it('keeps derived intent/mbti read-only when save payload has no dirty flags', () => {
    const base = {
      ...createBaseProfile(),
      targetRole: '',
      jobDirection: '数据分析师',
      mbti: '',
      personality: 'MBTI: INTJ',
      personalInfo: {
        ...(createBaseProfile().personalInfo || {}),
        title: '数据分析师',
      },
    } as CareerProfile;

    const hydrated = createCareerProfileEditorDraft(base, null) as CareerProfile;
    expect(hydrated.targetRole).toBe('数据分析师');
    expect(hydrated.mbti).toBe('INTJ');
    expect(hydrated.personality).toBe('');

    const untouched = applySingleMappingSanitize(hydrated, base, {});

    expect(untouched.targetRole).toBe('');
    expect(untouched.jobDirection).toBe('数据分析师');
    expect(untouched.personalInfo.title).toBe('数据分析师');
    expect(untouched.mbti).toBe('');
    expect(untouched.personality).toBe('MBTI: INTJ');
  });

});
