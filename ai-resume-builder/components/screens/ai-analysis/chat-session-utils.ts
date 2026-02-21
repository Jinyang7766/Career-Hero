import type { ChatMessage } from './types';

export type InterviewAnswerTiming = {
  questionNo: number;
  seconds: number;
  questionText?: string;
  recordedAt: string;
};

const normalizeForHash = (value: string) =>
  String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

const hashText = (value: string) => {
  const normalized = normalizeForHash(value);
  if (!normalized) return 'default';
  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 31 + normalized.charCodeAt(i)) | 0;
  }
  return `h_${Math.abs(hash)}`;
};

export const buildPendingReplyKey = ({
  currentUserId,
  resumeId,
  jdText,
  lastJdText,
  isInterviewMode,
}: {
  currentUserId?: string;
  resumeId?: string | number;
  jdText?: string;
  lastJdText?: string;
  isInterviewMode: boolean;
}) => {
  const uid = String(currentUserId || 'anon').trim() || 'anon';
  const rid = String(resumeId || 'no_resume').trim() || 'no_resume';
  const jdKey = hashText(String(jdText || lastJdText || ''));
  const mode = isInterviewMode ? 'interview' : 'micro';
  return `ai_chat_pending_reply:${uid}:${rid}:${jdKey}:${mode}`;
};

export const buildTimingStorageKey = ({
  currentUserId,
  resumeId,
  jdText,
  lastJdText,
  isInterviewMode,
  interviewType,
  interviewMode,
}: {
  currentUserId?: string;
  resumeId?: string | number;
  jdText?: string;
  lastJdText?: string;
  isInterviewMode: boolean;
  interviewType: string;
  interviewMode: string;
}) => {
  const uid = String(currentUserId || 'anon').trim() || 'anon';
  const rid = String(resumeId || 'no_resume').trim() || 'no_resume';
  const jdKey = hashText(String(jdText || lastJdText || ''));
  const normalizedType = String(interviewType || 'general').trim().toLowerCase() || 'general';
  const normalizedMode = String(interviewMode || 'comprehensive').trim().toLowerCase() || 'comprehensive';
  const mode = isInterviewMode ? 'interview' : 'micro';
  return `ai_chat_answer_timing:${uid}:${rid}:${jdKey}:${mode}:${normalizedType}:${normalizedMode}`;
};

export const countUserAnswers = (messages: ChatMessage[]) =>
  messages.filter((m) => {
    if (m.role !== 'user') return false;
    const txt = String(m.text || '').trim();
    const hasTextAnswer = !!txt && txt !== '结束面试' && txt !== '结束微访谈';
    const hasVoiceAnswer = !!m.audioUrl || !!m.audioPending;
    return hasTextAnswer || hasVoiceAnswer;
  }).length;

const summarizeQuestionText = (text: string) => {
  const line = String(text || '').trim().replace(/^下一题：\s*/u, '');
  const normalized = line.replace(/\s+/g, ' ');
  return normalized.slice(0, 80);
};

export const findPendingQuestion = (
  messages: ChatMessage[],
  isSelfIntroQuestion: (q: string) => boolean
) => {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (!msg || msg.role !== 'model') continue;
    const text = String(msg.text || '').trim();
    if (!text) continue;
    const hasUserAfter = messages.slice(i + 1).some((m) => m.role === 'user');
    if (hasUserAfter) continue;
    const looksLikeQuestion =
      text.includes('？') ||
      text.includes('?') ||
      text.startsWith('下一题：') ||
      text.startsWith('追问：') ||
      isSelfIntroQuestion(text);
    if (!looksLikeQuestion) continue;
    return {
      messageId: msg.id,
      text: summarizeQuestionText(text),
    };
  }
  return null;
};

export const buildTimingContextForSummary = (entries: InterviewAnswerTiming[]) => {
  if (!entries.length) return '';
  const total = entries.reduce((sum, item) => sum + Math.max(0, Number(item.seconds) || 0), 0);
  const avg = Math.round(total / entries.length);
  const max = entries.reduce((m, item) => Math.max(m, Number(item.seconds) || 0), 0);
  const min = entries.reduce((m, item) => Math.min(m, Number(item.seconds) || 0), Number.MAX_SAFE_INTEGER);
  const overLong = entries.filter((item) => (Number(item.seconds) || 0) > 180).length;
  const overShort = entries.filter((item) => (Number(item.seconds) || 0) < 20).length;
  const perQuestionLines = entries
    .map((item) => `- 第${item.questionNo}题：${item.seconds}秒${item.questionText ? `（${item.questionText}）` : ''}`)
    .join('\n');
  return [
    `题目数：${entries.length}`,
    `总作答时长：${total}秒`,
    `平均每题：${avg}秒`,
    `最短/最长：${min === Number.MAX_SAFE_INTEGER ? 0 : min}秒 / ${max}秒`,
    `过短(<20秒)题数：${overShort}`,
    `过长(>180秒)题数：${overLong}`,
    '分题用时：',
    perQuestionLines,
  ].join('\n');
};

export const isUnusableInterviewSummary = (text: string) => {
  const normalized = String(text || '').trim().toLowerCase();
  if (!normalized) return true;
  if (normalized.length < 20) return true;
  return (
    normalized.includes('开小差') ||
    normalized.includes('稍后再试') ||
    normalized.includes('暂时不可用') ||
    normalized.includes('系统繁忙') ||
    normalized.includes('服务不可用') ||
    normalized.includes('生成失败') ||
    normalized.includes('连接中断')
  );
};

export const buildFallbackInterviewSummary = (messages: ChatMessage[], entries: InterviewAnswerTiming[]) => {
  const userAnswers = (messages || []).filter((m) => {
    if (m.role !== 'user') return false;
    const txt = String(m.text || '').trim();
    return !!txt && txt !== '结束面试' && txt !== '结束微访谈';
  });
  const answerCount = userAnswers.length;
  const totalSec = (entries || []).reduce((sum, item) => sum + Math.max(0, Number(item.seconds) || 0), 0);
  const avgSec = answerCount > 0 ? Math.round(totalSec / Math.max(1, answerCount)) : 0;
  return [
    `综合评价：本次面试已完成，共作答 ${answerCount} 题，平均每题约 ${avgSec} 秒。系统已记录你的作答过程，建议结合下方改进方向继续打磨表达与案例细节。`,
    '表现亮点：整体作答节奏稳定，能够围绕问题进行回应。',
    '需要加强的地方：建议进一步补充量化结果、行动细节与复盘反思，提升回答说服力。',
    '职位匹配度与缺口：当前已具备基础匹配能力，后续可围绕岗位核心能力做更有针对性的准备。',
    '后续训练计划：选择 3-5 道高频题，按“场景-行动-结果-复盘”结构反复演练并优化答案。',
  ].join('\n\n');
};
