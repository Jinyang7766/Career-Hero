// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import GuidedCareerProfileFollowupStep from '../../components/screens/career-profile/GuidedCareerProfileFollowupStep';
import {
  FOLLOWUP_SESSION_KEY,
  getScopedFusionStorageKey,
  writeFusionFollowupSession,
} from '../../components/screens/career-profile/fusion-storage';

const saveCareerProfileMock = vi.fn();

vi.mock('../app-context', () => ({
  useAppContext: (selector: any) =>
    selector({
      currentUser: { id: 'test-user' },
      goBack: vi.fn(),
    }),
}));

vi.mock('../useUserProfile', () => ({
  useUserProfile: () => ({
    userProfile: {},
  }),
}));

vi.mock('../../components/screens/dashboard/useCareerProfileComposer', () => ({
  useCareerProfileComposer: () => ({
    isSaving: false,
    saveCareerProfile: saveCareerProfileMock,
  }),
}));

describe('career-profile followup page', () => {
  beforeEach(() => {
    saveCareerProfileMock.mockReset();
    saveCareerProfileMock.mockResolvedValue(true);
    localStorage.clear();

    const sessionKey = getScopedFusionStorageKey(FOLLOWUP_SESSION_KEY, 'test-user');
    writeFusionFollowupSession(sessionKey, {
      sourcePath: '/career-profile/upload',
      supplementText: '我做过增长项目',
      uploadedResumeTitle: '测试简历',
      uploadedResume: null,
      prompts: [
        { id: 'p1', category: 'experience', text: '请补充项目成果' },
        { id: 'p2', category: 'others', text: '请补充目标岗位' },
      ],
      answersByPromptId: {},
      draftByPromptId: {},
      skippedPromptIds: [],
      currentIndex: 0,
    });
  });

  it('supports single-question minimal UI, enter/blur auto-advance, and id-safe writes', async () => {
    render(
      <MemoryRouter initialEntries={['/career-profile/followup']}>
        <Routes>
          <Route path="/career-profile/followup" element={<GuidedCareerProfileFollowupStep />} />
          <Route path="/career-profile/result/summary" element={<div>RESULT_PAGE</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('问题 1/2')).toBeTruthy();

    // Verify minimal UI: No instruction cards, no prev/next buttons
    expect(screen.queryByText('一次一题 · 滑动切换')).toBeNull();
    expect(screen.queryByText('上一题')).toBeNull();
    expect(screen.queryByText('下一题')).toBeNull();
    expect(screen.queryByText('提交并下一题')).toBeNull();
    expect(screen.queryByText('跳过当前题')).toBeNull();

    const textarea = screen.getByPlaceholderText('请输入你的真实经历与细节（默认空白，不会预填模板）') as HTMLTextAreaElement;
    expect(textarea.value).toBe('');

    // Enter to next question
    fireEvent.change(textarea, { target: { value: '项目转化率提升 20%' } });
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });
    
    expect(await screen.findByText('问题 2/2')).toBeTruthy();
    expect(textarea.value).toBe('');

    // Blur to auto-advance (and since it's last question, trigger generate)
    fireEvent.change(textarea, { target: { value: '目标是 AI 产品经理' } });
    fireEvent.blur(textarea);

    expect(saveCareerProfileMock).toHaveBeenCalledTimes(1);
    const payload = String(saveCareerProfileMock.mock.calls[0][0] || '');
    expect(payload).toContain('问题：请补充项目成果\n回答：项目转化率提升 20%');
    expect(payload).toContain('问题：请补充目标岗位\n回答：目标是 AI 产品经理');

    expect(await screen.findByText('RESULT_PAGE')).toBeTruthy();
  });
});
