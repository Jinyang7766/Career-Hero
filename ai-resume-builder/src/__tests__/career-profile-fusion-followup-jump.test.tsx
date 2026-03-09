// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import GuidedCareerProfileFusionStep from '../../components/screens/career-profile/GuidedCareerProfileFusionStep';

vi.mock('../app-context', () => ({
  useAppContext: (selector: any) =>
    selector({
      currentUser: { id: 'test-user' },
      goBack: vi.fn(),
    }),
}));

vi.mock('../../components/screens/career-profile/useCareerProfileVoiceInput', () => ({
  useCareerProfileVoiceInput: () => ({
    audioSupported: false,
    isRecording: false,
    isTranscribing: false,
    voiceError: '',
    voiceHint: '',
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
  }),
}));

vi.mock('../../components/screens/career-profile/dynamic-followup-prompts', () => ({
  buildDynamicFollowupPrompts: () => [
    { id: 'p1', category: 'experience', text: '请补充项目成果' },
    { id: 'p2', category: 'others', text: '请补充目标岗位' },
  ],
}));

describe('career-profile fusion followup jump', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('does not render followup cards in fusion page and jumps to followup route after analysis', async () => {
    render(
      <MemoryRouter initialEntries={['/career-profile/upload']}>
        <Routes>
          <Route path="/career-profile/upload" element={<GuidedCareerProfileFusionStep />} />
          <Route path="/career-profile/followup" element={<div>FOLLOWUP_PAGE</div>} />
        </Routes>
      </MemoryRouter>
    );

    const textarea = screen.getByPlaceholderText(
      '在这里随便写写你的经历，比如主导了什么项目、解决了什么难题、取得了什么成果...不用在意排版和用词，我会帮你全部搞定！'
    );

    fireEvent.change(textarea, { target: { value: '我做过增长运营项目' } });
    fireEvent.click(screen.getByText('AI 智能解析'));

    expect(await screen.findByText('下一步')).toBeTruthy();
    expect(screen.getByText('补充更多工作细节')).toBeTruthy();
    expect(screen.queryByText('补充更多工作细节（可选）')).toBeNull();
    expect(screen.queryByText('AI 定向追问卡片')).toBeNull();

    fireEvent.click(screen.getByText('下一步'));
    expect(await screen.findByText('FOLLOWUP_PAGE')).toBeTruthy();
  });
});
