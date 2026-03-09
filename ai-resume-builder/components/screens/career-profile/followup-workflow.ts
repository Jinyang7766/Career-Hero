import type { FollowupPrompt } from './profile-followup-prompts';

export const clampFollowupIndex = (index: number, total: number): number => {
  if (!Number.isFinite(total) || total <= 0) return 0;
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(total - 1, Math.floor(index)));
};

export const moveFollowupIndex = (
  currentIndex: number,
  total: number,
  direction: 'prev' | 'next'
): number => {
  const base = clampFollowupIndex(currentIndex, total);
  if (total <= 0) return 0;
  if (direction === 'prev') return clampFollowupIndex(base - 1, total);
  return clampFollowupIndex(base + 1, total);
};

export const getAutoAdvanceIndex = (currentIndex: number, total: number): number =>
  moveFollowupIndex(currentIndex, total, 'next');

export const buildFollowupAnswerBlocks = (
  prompts: Array<Pick<FollowupPrompt, 'id' | 'text'>>,
  answersByPromptId: Record<string, string>
): string => {
  const blocks = prompts
    .map((prompt) => {
      const id = String(prompt.id || '').trim();
      if (!id) return '';
      const answer = String((answersByPromptId || {})[id] || '').trim();
      if (!answer) return '';
      const text = String(prompt.text || '').trim();
      if (!text) return '';
      return `问题：${text}\n回答：${answer}`;
    })
    .filter(Boolean);

  return blocks.join('\n\n');
};
