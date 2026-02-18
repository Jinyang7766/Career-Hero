import type { ChatMessage } from './types';

export const buildInterviewSummaryPrompt = () =>
  `[INTERVIEW_SUMMARY]\n请基于候选人简历、职位描述（JD）与完整对话记录，输出一份“面试综合分析”。\n` +
  `要求：\n` +
  `- 用中文输出。\n` +
  `- 不要输出任何分数、百分比评分或打分标签。\n` +
  `- 不要提出下一题。\n` +
  `- 重点结合：回答质量（结构、深度、证据、数据/影响）、简历内容匹配度、JD匹配度。\n` +
  `- 输出结构：\n` +
  `1) 综合评价（3-5句）\n` +
  `2) 表现亮点（3-6条）\n` +
  `3) 需要加强的地方（5-8条，每条包含：问题 -> 如何改进 -> 建议练习/准备素材）\n` +
  `4) JD 匹配度与缺口（分点说明）\n` +
  `5) 简历可改进点（3-6条，针对表达与证据补强）\n` +
  `6) 1-2 周训练计划（按天/按主题）\n`;

export const buildInterviewWrappedMessage = ({
  isInterviewChat,
  isStartPhase,
  cleanTextForWrap,
  isAffirmative,
  hasText,
  textToSend,
  hasAudio,
  shouldFollowUp,
  followUpHint,
}: {
  isInterviewChat: boolean;
  isStartPhase: boolean;
  cleanTextForWrap: string;
  isAffirmative: (v: string) => boolean;
  hasText: boolean;
  textToSend: string;
  hasAudio: boolean;
  shouldFollowUp?: boolean;
  followUpHint?: string;
}) => {
  if (!isInterviewChat) return hasText ? textToSend : (hasAudio ? '（语音）' : '');
  if (isStartPhase && isAffirmative(cleanTextForWrap)) {
    return `[INTERVIEW_MODE]\n【面试开始：候选人已准备好。请先让候选人做自我介绍，并提醒：自我介绍时间为1分钟。随后进入正常面试提问。】`;
  }
  const deepDiveRule = shouldFollowUp
    ? `【当前回答信息不足（${followUpHint || '细节不够具体'}）。本轮必须先追问1个最关键澄清问题（数据/动作/结果三选一优先），不要切换到下一题。追问行必须以“追问：”开头。】`
    : `【若候选人回答模糊、缺少可验证细节，先进行1-2轮追问（优先追问数据、动作、影响），补齐后再进入下一题。】`;
  return `[INTERVIEW_MODE]\n【面试官角色保持：请仅进行模拟面试流程。回复请自然流畅，不要使用“点评”、“提问”等标签。输出为纯文本，不要使用任何 Markdown 标记，尤其不要出现 * 号。内容需包含：1.对回答的简短反馈；2.改进建议（如有）；3.参考回复；4.提问动作。${deepDiveRule} 若进入下一题，则下一题必须另起一行，以“下一题：”开头输出（不要把下一题放进参考回复里）。】\n\n候选人回答：${cleanTextForWrap}`;
};

export const buildSummaryRequestBody = ({
  message,
  resumeData,
  jobDescription,
  chatHistory,
  score,
}: {
  message: string;
  resumeData: any;
  jobDescription: string;
  chatHistory: ChatMessage[];
  score: number;
}) => ({
  mode: 'interview_summary',
  message,
  audio: null,
  resumeData,
  jobDescription,
  chatHistory,
  score,
  suggestions: [],
});

export const buildChatRequestBody = ({
  message,
  audio,
  resumeData,
  diagnosisDossier,
  jobDescription,
  chatHistory,
  score,
  suggestions,
  isInterviewChat,
  interviewType,
}: {
  message: string;
  audio: any;
  resumeData: any;
  diagnosisDossier?: any;
  jobDescription: string;
  chatHistory: ChatMessage[];
  score: number;
  suggestions: any[];
  isInterviewChat: boolean;
  interviewType?: string;
}) => ({
  message,
  audio,
  resumeData,
  diagnosisDossier: diagnosisDossier || null,
  jobDescription,
  chatHistory,
  score,
  suggestions: isInterviewChat ? [] : suggestions,
  interviewType,
});
