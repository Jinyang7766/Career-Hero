import { describe, expect, it } from 'vitest';
import { toSkillListForImport } from '../skill-utils';
import { sanitizeResumeSkills, sanitizeSkillList } from '../resume-skill-sanitizer';

describe('toSkillListForImport', () => {
  it('extracts skills from nested mixed structures', () => {
    const input = [
      { skill: 'Python, SQL' },
      { 技能: ['Tableau', 'PowerBI'] },
      { name: 'PMP' },
      'Python',
    ];
    const result = toSkillListForImport(input);

    expect(result).toEqual(expect.arrayContaining(['Python', 'SQL', 'Tableau', 'PowerBI', 'PMP认证']));
    expect(new Set(result).size).toBe(result.length);
  });

  it('keeps A/B skill tokens while splitting normal slash tokens', () => {
    const input = ['专业技能: Python/SQL/A/B测试', '数据建模'];
    const result = toSkillListForImport(input);

    expect(result).toEqual(expect.arrayContaining(['Python', 'SQL', 'A/B测试', '数据建模']));
  });

  it('normalizes LLM and certificate aliases with dedupe', () => {
    const input = ['ChatGPT', 'LLM', 'CET-6', '大学英语六级'];
    const result = toSkillListForImport(input);

    expect(result).toEqual(expect.arrayContaining(['LLM', 'CET-6']));
    expect(result.filter((x) => x === 'LLM').length).toBe(1);
    expect(result.filter((x) => x === 'CET-6').length).toBe(1);
  });

  it('removes A and B fragments when A/B skill exists', () => {
    const input = ['A', 'B测试', 'A/B测试', 'SQL'];
    const result = toSkillListForImport(input);

    expect(result).toEqual(expect.arrayContaining(['A/B测试', 'SQL']));
    expect(result).not.toContain('A');
    expect(result).not.toContain('B测试');
  });
});

describe('sanitizeSkillList', () => {
  it('dedupes near-duplicate tokens and filters weak noise', () => {
    const result = sanitizeSkillList([
      'SQL',
      ' sql ',
      'Power BI',
      'PowerBI',
      'A/B Test',
      'A/B Testing',
      '管理',
    ]);

    expect(result.some((x) => x.toLowerCase() === 'sql')).toBe(true);
    expect(result).toContain('PowerBI');
    expect(result.some((x) => /^a\/b\s*test/i.test(x))).toBe(true);
    expect(result).not.toContain('管理');
    expect(result.filter((x) => x.toLowerCase().includes('sql')).length).toBe(1);
  });

  it('caps output by default guard limit (10)', () => {
    const result = sanitizeSkillList([
      'SQL', 'Python', 'Excel', 'PowerBI', 'Tableau', 'GA4', 'A/B Test', 'LLM', 'RAG', 'Docker', 'Linux', 'Redis',
    ]);

    expect(result.length).toBe(10);
  });

  it('sanitizes resume payload skills in place-safe way', () => {
    const resume = {
      summary: 'x',
      skills: ['SQL', 'sql', '策略', 'Python'],
    } as any;

    const cleaned = sanitizeResumeSkills(resume);

    expect(cleaned.summary).toBe('x');
    expect(cleaned.skills).toHaveLength(2);
    expect(cleaned.skills.some((x) => x.toLowerCase() === 'python')).toBe(true);
    expect(cleaned.skills.some((x) => x.toLowerCase() === 'sql')).toBe(true);
  });
});
