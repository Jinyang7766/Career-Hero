export type FollowUpDecision = {
  shouldFollowUp: boolean;
  hint: string;
};

export type ReverseQaMode = 'none' | 'announce' | 'evaluate' | 'force_end';

export type ReverseQaResolution = {
  inReverseQa: boolean;
  reverseQaMode: ReverseQaMode;
  reverseQaQuestionNo: number;
  reverseQaUserDone: boolean;
  reverseQaJustActivated: boolean;
  nextReverseQaActive: boolean;
  nextReverseQaAskedCount: number;
  nextReverseQaPendingEvaluation: boolean;
};

export const isNoMoreQuestionSignal = (raw: string) =>
  /(没有(了)?|没(有)?问题了|无(问题|疑问)|不用了|结束|就这样|没了)/i.test(String(raw || '').trim());

export const detectFollowUpNeed = (raw: string): FollowUpDecision => {
  const text = String(raw || '').trim();
  if (!text) return { shouldFollowUp: false, hint: '' };
  const normalized = text.replace(/\s+/g, '');
  const isShort = normalized.length < 18;
  const hasNumberEvidence = /(\d+(\.\d+)?%?)|(\d+\s*(ms|s|秒|天|周|月|年|人|次|万|百万|亿元|k|K|w|W))/i.test(text);
  const hasActionEvidence = /(负责|主导|推进|制定|设计|执行|落地|优化|搭建|复盘|拆解|调整|实施|改造|推动|协调|分析了|我做了|我通过|通过.+(优化|调整|分析|改造))/i.test(text);
  const hasDataKeyword = /(gmv|roi|ctr|cvr|uv|pv|客单价|转化率|点击率|留存率|复购率|曝光|订单量|营收|成本|毛利|投产比|客诉率|退款率|履约率|nps)/i.test(text);
  const hasDataEvidence = hasNumberEvidence || hasDataKeyword;
  const hasResultEvidence = /(提升|增长|下降|降低|减少|改善|达成|实现|结果|产出|收益|效果|拉升|优化后|最终|同比|环比)/i.test(text);
  const structureHitCount = [hasActionEvidence, hasDataEvidence, hasResultEvidence].filter(Boolean).length;
  const vagueWords = ['负责', '参与', '很多', '一些', '一般', '还行', '差不多', '优化了', '提升了', '做过', '了解'];
  const uncertainWords = ['记不清', '不太清楚', '不确定', '可能', '大概', '应该', '差不多'];
  const vagueHits = vagueWords.filter((w) => text.includes(w)).length;
  const uncertainHits = uncertainWords.filter((w) => text.includes(w)).length;
  const missingStructuredFields: string[] = [];
  if (!hasActionEvidence) missingStructuredFields.push('动作');
  if (!hasDataEvidence) missingStructuredFields.push('数据');
  if (!hasResultEvidence) missingStructuredFields.push('结果');
  const lacksStructuredEvidence = structureHitCount < 2;
  const shouldFollowUp =
    isShort ||
    uncertainHits > 0 ||
    (vagueHits >= 2 && !hasNumberEvidence) ||
    lacksStructuredEvidence;
  const reasons: string[] = [];
  if (isShort) reasons.push('回答过短');
  if (uncertainHits > 0) reasons.push('不确定表达较多');
  if (vagueHits >= 2 && !hasNumberEvidence) reasons.push('缺少量化证据');
  if (lacksStructuredEvidence) reasons.push(`结构化信息不足（动作/数据/结果至少需覆盖两项，当前缺少：${missingStructuredFields.join('、') || '关键要素'}）`);
  return {
    shouldFollowUp,
    hint: reasons.join('、') || '细节不够具体',
  };
};

type ResolveReverseQaStateParams = {
  isInterviewChat: boolean;
  isClosingPhase: boolean;
  hasText: boolean;
  textToSend: string;
  reverseQaActive: boolean;
  reverseQaAskedCount: number;
  reverseQaMax: number;
};

export const resolveReverseQaState = ({
  isInterviewChat,
  isClosingPhase,
  hasText,
  textToSend,
  reverseQaActive,
  reverseQaAskedCount,
  reverseQaMax,
}: ResolveReverseQaStateParams): ReverseQaResolution => {
  const reverseQaJustActivated = isInterviewChat && isClosingPhase && !reverseQaActive;
  let nextReverseQaActive = reverseQaActive;
  let nextReverseQaAskedCount = reverseQaAskedCount;
  let nextReverseQaPendingEvaluation = false;

  if (reverseQaJustActivated) {
    nextReverseQaActive = true;
    nextReverseQaAskedCount = 0;
  }

  const inReverseQa = isInterviewChat && nextReverseQaActive;
  const reverseQaUserDone = inReverseQa && hasText && isNoMoreQuestionSignal(textToSend);
  let reverseQaMode: ReverseQaMode = 'none';
  let reverseQaQuestionNo = 0;

  if (inReverseQa) {
    if (reverseQaUserDone) {
      reverseQaMode = 'force_end';
    } else if (reverseQaJustActivated) {
      reverseQaMode = 'announce';
    } else {
      nextReverseQaAskedCount += 1;
      reverseQaQuestionNo = nextReverseQaAskedCount;
      nextReverseQaPendingEvaluation = true;
      reverseQaMode = reverseQaQuestionNo > reverseQaMax ? 'force_end' : 'evaluate';
    }
  }

  return {
    inReverseQa,
    reverseQaMode,
    reverseQaQuestionNo,
    reverseQaUserDone,
    reverseQaJustActivated,
    nextReverseQaActive,
    nextReverseQaAskedCount,
    nextReverseQaPendingEvaluation,
  };
};
