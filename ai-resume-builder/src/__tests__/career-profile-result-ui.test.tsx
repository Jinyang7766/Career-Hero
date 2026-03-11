// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CareerProfileResult from '../../components/screens/CareerProfileResult';
import * as fusionStorage from '../../components/screens/career-profile/fusion-storage';

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
    loading: false,
  }),
}));

vi.mock('../../components/screens/dashboard/useCareerProfileComposer', () => ({
  useCareerProfileComposer: () => ({
    profile: { id: 'p1' },
    isSaving: false,
    saveStructuredCareerProfile: vi.fn(),
  }),
}));

vi.mock('../../components/screens/career-profile/CareerProfileStructuredEditor', () => ({
  default: () => <div data-testid="editor" />,
}));

describe('CareerProfileResult UI', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    cleanup();
  });

  it('removes the specific descriptive text per requirement', () => {
    vi.spyOn(fusionStorage, 'readFusionFollowupProgress').mockReturnValue({
      cards: [
        { id: '1', category: 'exp', text: 'test', status: 'pending' },
      ],
    } as any);

    render(
      <MemoryRouter>
        <CareerProfileResult />
      </MemoryRouter>
    );

    expect(screen.queryByText(/追问页与结果页已联动同一批追问卡片/)).toBeNull();
  });

  it('shows numeric badge for pending count on the action button', () => {
    vi.spyOn(fusionStorage, 'readFusionFollowupProgress').mockReturnValue({
      cards: [
        { id: '1', category: 'exp', text: 't1', status: 'pending' },
        { id: '2', category: 'exp', text: 't2', status: 'pending' },
        { id: '3', category: 'exp', text: 't3', status: 'completed' },
      ],
    } as any);

    render(
      <MemoryRouter>
        <CareerProfileResult />
      </MemoryRouter>
    );

    // Badge should show "2" (the pending count)
    const badge = screen.getByText('2');
    expect(badge).toBeTruthy();
    expect(badge.className).toContain('bg-rose-500');
  });

  it('excludes "pending" status from the summary pill area', () => {
    vi.spyOn(fusionStorage, 'readFusionFollowupProgress').mockReturnValue({
      cards: [
        { id: '1', category: 'exp', text: 't1', status: 'pending' },
        { id: '2', category: 'exp', text: 't2', status: 'missing' },
      ],
    } as any);

    render(
      <MemoryRouter>
        <CareerProfileResult />
      </MemoryRouter>
    );

    // "missing" (缺失) should be there as a pill
    expect(screen.getByText('缺失')).toBeTruthy();
    
    // "pending" (待补充) should NOT be there as a pill
    const labels = screen.queryAllByText('待补充');
    expect(labels.length).toBe(0);
  });

  it('keeps followup entry copy distinct from background update action', () => {
    vi.spyOn(fusionStorage, 'readFusionFollowupProgress').mockReturnValue({
      cards: [{ id: '1', category: 'exp', text: 't1', status: 'pending' }],
    } as any);

    render(
      <MemoryRouter>
        <CareerProfileResult />
      </MemoryRouter>
    );

    expect(screen.getByRole('button', { name: /继续定向追问/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /更新背景资料/ })).toBeTruthy();
    expect(screen.queryByText('补充核心事实')).toBeNull();
  });
});
