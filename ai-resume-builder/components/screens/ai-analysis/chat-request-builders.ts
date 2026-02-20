import type { ChatMessage } from './types';

export const buildInterviewSummaryPrompt = (timingContext?: string) =>
  `[INTERVIEW_SUMMARY]\n请基于职位描述与完整对话记录，输出一份“面试综合分析”。\n` +
  `要求：\n` +
  `- 用中文输出。\n` +
  `- 必须给出总分（0-100整数）。\n` +
  `- 不要提出下一题。\n` +
  `- 只基于面试作答证据，禁止简历兜底。\n` +
  `- 禁止背景铺垫与重复表述（如“基于您提供的信息...”）。\n` +
  `- 文风简洁：短句、少形容词、先结论后证据。\n` +
  `- 必须严格按以下模板输出，标题与顺序不可变，且每条都以“- ”开头：\n` +
  `总分：<整数>/100\n` +
  `【综合评价】\n` +
  `- ...\n` +
  `- ...\n` +
  `【表现亮点】\n` +
  `- ...\n` +
  `- ...\n` +
  `【需要加强的地方】\n` +
  `- 问题：...｜改进：...｜练习：...\n` +
  `- 问题：...｜改进：...｜练习：...\n` +
  `【职位匹配度与缺口】\n` +
  `- ...\n` +
  `- ...\n` +
  `【后续训练计划】\n` +
  `- Day 1: ...\n` +
  `- Day 2: ...\n` +
  `- 训练计划中的天数标签必须统一使用 Day N（例如 Day 1, Day 2），禁止使用“第1天/第一天”。\n` +
  `- 除上述模板外不得输出任何额外段落、前言或结语。\n` +
  `${String(timingContext || '').trim() ? `\n[作答用时数据]\n${String(timingContext || '').trim()}\n` : ''}`;

export const buildInterviewWrappedMessage = ({
  isInterviewChat,
  isMicroInterview,
  isStartPhase,
  cleanTextForWrap,
  isAffirmative,
  hasText,
  textToSend,
  hasAudio,
  shouldFollowUp,
  followUpHint,
  forcedNextQuestion,
  shouldEnterClosing,
  skipCurrentQuestion,
}: {
  isInterviewChat: boolean;
  isMicroInterview?: boolean;
  isStartPhase: boolean;
  cleanTextForWrap: string;
  isAffirmative: (v: string) => boolean;
  hasText: boolean;
  textToSend: string;
  hasAudio: boolean;
  shouldFollowUp?: boolean;
  followUpHint?: string;
  forcedNextQuestion?: string;
  shouldEnterClosing?: boolean;
  skipCurrentQuestion?: boolean;
}) => {
  if (!isInterviewChat) {
    if (!isMicroInterview) return hasText ? textToSend : (hasAudio ? '（语音）' : '');
    return `[MICRO_INTERVIEW_MODE]
【你是“微访谈补充助手”。目标是通过最少轮次补齐关键信息（背景、动作、结果、量化证据），用于生成最终诊断报告。
规则：
1. 每轮先给一句简短反馈，再提出1个最关键追问。
2. 若用户回答仍空泛，继续追问，不要结束。
3. 当你判断信息已足够支撑最终诊断（核心经历、动作与结果已清晰，且无关键缺口）时，必须仅输出“结束微访谈”（不要附加任何其他内容）。
4. 输出纯文本，不要使用 Markdown。】

候选人回答：${cleanTextForWrap}`;
  }
  if (isStartPhase && isAffirmative(cleanTextForWrap)) {
    return `[INTERVIEW_MODE]\n【面试开始：候选人已准备好。请先让候选人做自我介绍，并提醒：自我介绍时间为1分钟。随后进入正常面试提问。】`;
  }
  const deepDiveRule = shouldFollowUp
    ? `【当前回答信息不足（${followUpHint || '细节不够具体'}）。本轮必须先追问1个最关键澄清问题（数据/动作/结果三选一优先），不要切换到下一题。追问行必须以“追问：”开头。若你已列出“请补充的要点”，不要再重复原题或另起一句“请重新回答：...”，改为一句简短引导（如“请围绕上述要点补充作答”）。】`
    : `【若候选人回答模糊、缺少可验证细节，先进行1-2轮追问（优先追问数据、动作、影响），补齐后再进入下一题。】`;
  const strictPlanRule = (!shouldFollowUp && forcedNextQuestion)
    ? `【题库强约束：本轮若进入下一题，下一题必须且只能是：${forcedNextQuestion}。禁止改写、禁止替换、禁止新增题目。】`
    : '';
  const skipRule = skipCurrentQuestion
    ? `【候选人本轮选择“跳过该题”。请不要继续追问本题，直接给出该题的高质量参考回复（可复用模板+示例要点），随后立即进入下一题。若有下一题，必须另起一行以“下一题：”开头。】`
    : '';
  const closingRule = shouldEnterClosing
    ? `【收尾阶段：题库问题已完成。本轮不要进入新题。请先询问候选人“是否还有想补充或提问的内容”。若候选人明确表示“没有/无疑问/结束”，请仅输出“结束面试”（不要附加其他内容）。】`
    : '';
  return `[INTERVIEW_MODE]\n【面试官角色保持：请仅进行模拟面试流程。回复请自然流畅，不要使用“点评”、“提问”等标签。输出为纯文本，不要使用任何 Markdown 标记，尤其不要出现 * 号。内容需包含：1.对回答的简短反馈；2.改进建议（如有）；3.参考回复；4.提问动作。${deepDiveRule}${strictPlanRule}${skipRule}${closingRule} 若进入下一题，则下一题必须另起一行，以“下一题：”开头输出（不要把下一题放进参考回复里）。】\n\n候选人回答：${cleanTextForWrap}`;
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
