import type { FollowupPrompt } from './profile-followup-prompts';
import type { FollowupCardStatus } from './fusion-storage';

type FollowupAnswerState = 'none' | 'blank' | 'filled';

const normalizeAnswer = (value: string): string =>
  String(value || '')
    .replace(/[\s\u3000]+/g, ' ')
    .trim();

export const getFollowupPromptAnswerStateById = (
  answersByPromptId: Record<string, string>,
  promptId: string
): FollowupAnswerState => {
  const id = String(promptId || '').trim();
  if (!id) return 'none';

  if (!Object.prototype.hasOwnProperty.call(answersByPromptId || {}, id)) {
    return 'none';
  }

  const answer = normalizeAnswer(String((answersByPromptId || {})[id] || ''));
  return answer ? 'filled' : 'blank';
};

const ensurePromptOrder = (prompts: FollowupPrompt[]): FollowupPrompt[] => {
  const seen = new Set<string>();
  const ordered: FollowupPrompt[] = [];
  prompts.forEach((prompt) => {
    const id = String(prompt?.id || '').trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    ordered.push(prompt);
  });
  return ordered;
};

export const computeFollowupCardStatuses = (params: {
  prompts: FollowupPrompt[];
  currentlyMissingPromptIds: Set<string>;
  answersByPromptId?: Record<string, string>;
  skippedPromptIds?: string[];
}): Array<FollowupPrompt & { status: FollowupCardStatus }> => {
  const orderedPrompts = ensurePromptOrder(params.prompts || []);
  const answersByPromptId = params.answersByPromptId || {};
  const skipped = new Set((params.skippedPromptIds || []).map((id) => String(id || '').trim()));

  return orderedPrompts.map((prompt) => {
    const answerState = getFollowupPromptAnswerStateById(answersByPromptId, prompt.id);
    const unresolved = params.currentlyMissingPromptIds.has(prompt.id);

    let status: FollowupCardStatus = 'pending';
    if (!unresolved || answerState === 'filled') {
      status = 'completed';
    } else if (answerState === 'blank' && !skipped.has(prompt.id)) {
      status = 'missing';
    }

    return {
      ...prompt,
      status,
    };
  });
};
