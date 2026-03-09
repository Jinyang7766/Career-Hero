/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CareerProfile } from '../../src/career-profile-utils';
import CareerProfileStructuredEditor from '../../components/screens/career-profile/CareerProfileStructuredEditor';

vi.mock('../../src/app-context', () => ({
  useAppContext: (selector?: (state: { currentUser: any }) => unknown) => {
    const state = { currentUser: null };
    return typeof selector === 'function' ? selector(state) : state;
  },
}));

const baseProfile: CareerProfile = {
  id: 'profile-1',
  createdAt: '2026-03-03T00:00:00.000Z',
  source: 'test',
  summary: '具备完整端到端交付经验',
  careerHighlights: ['主导核心项目上线'],
  coreSkills: ['TypeScript'],
  constraints: [],
  experiences: [],
  personalInfo: {
    name: '测试用户',
    title: '前端工程师',
    email: 'tester@example.com',
  },
};

describe('CareerProfileStructuredEditor Summary Changes', () => {
  it('renders summary as read-only even in inline edit mode', async () => {
    render(
      <CareerProfileStructuredEditor
        profile={baseProfile}
        isSaving={false}
        onSave={() => undefined}
        inlineEditable={true}
      />
    );

    // Wait for the effect to set the draft profile
    const summaryElement = await screen.findByText('具备完整端到端交付经验');
    expect(summaryElement).toBeDefined();
    
    // Check it's not a textarea
    expect(summaryElement.tagName.toLowerCase()).not.toBe('textarea');
    // In our implementation it should be a <p>
    expect(summaryElement.tagName.toLowerCase()).toBe('p');
  });

  it('renders summary block above basic info block', async () => {
    const { container } = render(
      <CareerProfileStructuredEditor
        profile={baseProfile}
        isSaving={false}
        onSave={() => undefined}
        inlineEditable={false}
      />
    );

    await screen.findAllByText('核心优势总结');
    await screen.findAllByText('基础信息');

    const html = container.innerHTML;
    const summaryPos = html.indexOf('核心优势总结');
    const basicInfoPos = html.indexOf('基础信息');

    expect(summaryPos).toBeGreaterThan(-1);
    expect(basicInfoPos).toBeGreaterThan(-1);
    expect(summaryPos).toBeLessThan(basicInfoPos);
  });

  it('deduplicates MBTI from personality and constraints in read-only mode', async () => {
    const profileWithMbtiOverlap: CareerProfile = {
      ...baseProfile,
      mbti: 'INTJ',
      personality: '性格: INTJ, 非常严谨',
      constraints: ['MBTI:INTJ 不接受加班', '只看远程'],
    };

    render(
      <CareerProfileStructuredEditor
        profile={profileWithMbtiOverlap}
        isSaving={false}
        onSave={() => undefined}
        inlineEditable={false}
      />
    );

    await screen.findAllByText('MBTI');
    await screen.findAllByText('INTJ');
    
    // Check for partial text matches
    const personalityText = await screen.findByText(/非常严谨/);
    expect(personalityText).toBeDefined();
    expect(personalityText.textContent).not.toContain('INTJ');
    
    const constraint1 = await screen.findByText(/不接受加班/);
    expect(constraint1).toBeDefined();
    expect(constraint1.textContent).not.toContain('INTJ');
    expect(constraint1.textContent).not.toContain('MBTI');
  });

  it('renders skill chips with wrapping classes for readable display', async () => {
    render(
      <CareerProfileStructuredEditor
        profile={{
          ...baseProfile,
          coreSkills: ['Power BI'],
        }}
        isSaving={false}
        onSave={() => undefined}
        inlineEditable={false}
      />
    );

    const skillChip = await screen.findByText('Power BI');
    expect(skillChip.className).toContain('break-words');
    expect(skillChip.className).toContain('max-w-full');
  });
});
