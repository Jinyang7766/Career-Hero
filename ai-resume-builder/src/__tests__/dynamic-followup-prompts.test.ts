import { describe, expect, it } from 'vitest';
import { buildDynamicFollowupPrompts } from '../../components/screens/career-profile/dynamic-followup-prompts';

const buildPromptIds = (existingProfile: Record<string, unknown>, isFirstBuild = false): Set<string> => {
  const prompts = buildDynamicFollowupPrompts({
    importedResume: null,
    supplementText: '',
    existingProfile: existingProfile as any,
    isFirstBuild,
  });
  return new Set(prompts.map((item) => item.id));
};

describe('dynamic followup prompts', () => {
  it('filters personality and goal prompts when supplement already contains those signals', () => {
    const prompts = buildDynamicFollowupPrompts({
      importedResume: null,
      supplementText:
        '我是 INTJ，偏好高协作高反馈的工作方式。职业目标是做 AI 产品负责人，目标岗位是产品总监，目标薪资 60-80w。',
    });
    const ids = new Set(prompts.map((item) => item.id));

    expect(ids.has('mbti')).toBe(false);
    expect(ids.has('work_style')).toBe(false);
    expect(ids.has('career_goal')).toBe(false);
    expect(ids.has('job_target')).toBe(false);
  });

  it('filters missing_facts when supplement has enough narrative text', () => {
    const prompts = buildDynamicFollowupPrompts({
      importedResume: null,
      supplementText: '我负责需求分析和跨团队推进上线复盘。'.repeat(30),
    });
    expect(prompts.some((item) => item.id === 'missing_facts')).toBe(false);
  });

  it.each([
    ['mbti field', { mbti: 'INTJ' }],
    ['personality field', { personality: '我的性格倾向偏 INFP，擅长深度思考。' }],
    ['summary field', { summary: '职业画像：MBTI 为 ENTP，偏创新与快速试错。' }],
    ['constraints field', { constraints: ['希望远程优先', 'MBTI: ISTJ'] }],
    [
      'atomicTags text',
      {
        atomicTags: [
          {
            id: 'tag_1',
            category: 'preference',
            text: 'MBTI = ENTJ',
            key: 'mbti-entj',
          },
        ],
      },
    ],
    [
      'atomicTags source path',
      {
        atomicTags: [
          {
            id: 'tag_2',
            category: 'preference',
            text: '建筑师型人格',
            key: 'architect-personality',
            sourcePaths: ['mbti'],
          },
        ],
      },
    ],
  ])('hides mbti prompt when MBTI is identifiable from %s', (_source, patch) => {
    const ids = buildPromptIds({
      experiences: [{ title: 'Developer', actions: 'coding', results: 'success' }],
      coreSkills: ['React'],
      summary: '',
      constraints: [],
      ...patch,
    });

    expect(ids.has('mbti')).toBe(false);
  });

  it('does not ask work_style when style preference exists in constraints', () => {
    const ids = buildPromptIds({
      experiences: [{ title: 'Developer', actions: 'coding', results: 'success' }],
      coreSkills: ['React'],
      constraints: ['希望远程办公，每周 2 天进办公室'],
    });

    expect(ids.has('work_style')).toBe(false);
  });

  it('does not ask career_goal when goal signal exists in summary', () => {
    const ids = buildPromptIds({
      experiences: [{ title: 'Developer', actions: 'coding', results: 'success' }],
      coreSkills: ['React'],
      summary: '未来 2 年职业目标是转向 AI 产品方向并负责核心增长模块。',
    });

    expect(ids.has('career_goal')).toBe(false);
  });

  it('does not ask job_target when target role is carried by intent atomic tag', () => {
    const ids = buildPromptIds({
      experiences: [{ title: 'Developer', actions: 'coding', results: 'success' }],
      coreSkills: ['React'],
      atomicTags: [
        {
          id: 'intent_1',
          category: 'intent',
          text: '目标岗位：高级产品经理',
          key: 'target-role-pm',
          sourcePaths: ['targetRole'],
        },
      ],
    });

    expect(ids.has('job_target')).toBe(false);
  });

  it('does not ask skills when skills are provided via fact_skill atomic tags', () => {
    const ids = buildPromptIds({
      experiences: [{ title: 'Developer', actions: 'coding', results: 'success' }],
      atomicTags: [
        {
          id: 'skill_1',
          category: 'fact_skill',
          text: 'SQL',
          key: 'sql',
          sourcePaths: ['coreSkills[0]'],
        },
      ],
    });

    expect(ids.has('skills')).toBe(false);
  });

  it('keeps prompts for genuinely missing fields', () => {
    const ids = buildPromptIds({
      experiences: [{ title: 'Developer', actions: 'coding', results: 'success' }],
      coreSkills: ['React'],
      personality: '注重沟通协作与执行落地',
      summary: '具备产品增长与跨团队协作经验',
      constraints: ['希望双休'],
    });

    expect(ids.has('mbti')).toBe(true);
    expect(ids.has('career_goal')).toBe(true);
    expect(ids.has('job_target')).toBe(true);
  });
});
