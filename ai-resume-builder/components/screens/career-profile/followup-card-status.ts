import type { FollowupPrompt } from './profile-followup-prompts';
import type { FollowupCardStatus } from './fusion-storage';

type TemplateAnswerState = 'none' | 'blank' | 'filled';

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeAnswer = (value: string): string =>
  String(value || '')
    .replace(/[\s\u3000]+/g, ' ')
    .trim();

const isBlankLikeAnswer = (value: string): boolean => {
  const normalized = normalizeAnswer(value).toLowerCase();
  if (!normalized) return true;
  if (/^(待补充|待完善|暂无|无|n\/?a|null|none|todo|tbd|---|……|\.\.\.)$/i.test(normalized)) {
    return true;
  }
  const compact = normalized.replace(/[，,。.!！？?;；:：、'"“”‘’()（）\[\]{}【】<>《》·`~@#$%^&*_+=|\\/\-]/g, '');
  return compact.length < 2;
};

export const getFollowupPromptTemplateAnswerState = (
  supplementText: string,
  promptText: string
): TemplateAnswerState => {
  const text = String(supplementText || '');
  const prompt = String(promptText || '').trim();
  if (!text || !prompt) return 'none';

  const pattern = new RegExp(
    `问题：\\s*${escapeRegExp(prompt)}\\s*(?:\\r?\\n)+回答：([\\s\\S]*?)(?=(?:\\r?\\n)\\s*问题：|$)`,
    'i'
  );
  const match = text.match(pattern);
  if (!match) return 'none';

  const answer = normalizeAnswer(match[1] || '');
  return isBlankLikeAnswer(answer) ? 'blank' : 'filled';
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
  supplementText: string;
}): Array<FollowupPrompt & { status: FollowupCardStatus }> => {
  const orderedPrompts = ensurePromptOrder(params.prompts || []);

  return orderedPrompts.map((prompt) => {
    const answerState = getFollowupPromptTemplateAnswerState(params.supplementText, prompt.text);
    const unresolved = params.currentlyMissingPromptIds.has(prompt.id);

    let status: FollowupCardStatus = 'pending';
    if (!unresolved || answerState === 'filled') {
      status = 'completed';
    } else if (answerState === 'blank') {
      status = 'missing';
    }

    return {
      ...prompt,
      status,
    };
  });
};
