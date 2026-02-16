const INTERVIEW_ANSWER_LIMIT_SUFFIX = '请将回答控制在3分钟内';
const SELF_INTRO_REMINDER = '自我介绍时间为1分钟';

export const sanitizeSuggestedValue = (value: any, targetSection?: string) => {
  if (targetSection === 'skills') return value;
  if (typeof value !== 'string') return value;

  let text = value.trim();
  if (!text) return value;

  const prefixPatterns = [
    /^精炼描述为[:：]\s*/i,
    /^修改建议[:：]\s*/i,
    /^优化建议[:：]\s*/i,
    /^建议[:：]\s*/i,
    /^修改原因[:：]\s*/i,
    /^原因[:：]\s*/i,
    /^说明[:：]\s*/i,
    /^请将[:：]?\s*/i,
    /^请把[:：]?\s*/i,
    /^请删除[:：]?\s*/i,
    /^请去掉[:：]?\s*/i,
  ];
  prefixPatterns.forEach((pattern) => {
    text = text.replace(pattern, '');
  });

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 1 && /(建议|原因|说明|修改|优化|请)/.test(lines[0])) {
    return lines.slice(1).join('\n').trim();
  }

  if (/^(建议|修改建议|修改原因|原因|说明|请|请将|请把|请删除|请去掉)/.test(text) && /[:：]/.test(text)) {
    return text.replace(/^[^:：]{0,20}[:：]\s*/, '').trim();
  }

  return text;
};

export const sanitizeReasonText = (value: any) => {
  let text = String(value ?? '').trim();
  if (!text) return '';
  text = text
    .replace(/;/g, '；')
    .replace(/([。！？；，])\s*[；，。！？]+/g, '$1')
    .replace(/([。！？；，]){2,}/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return text;
};

export const isGenderRelatedSuggestion = (suggestion: any) => {
  if (!suggestion) return false;
  const keywordPattern = /(性别|gender|sex|男性|女性|男生|女生|女士|先生|male|female|man|woman)/i;
  if (typeof suggestion === 'string') return keywordPattern.test(suggestion);

  const targetField = String(suggestion.targetField || '').trim().toLowerCase();
  if (targetField === 'gender' || targetField === 'sex') return true;

  const targetSection = String(suggestion.targetSection || '').trim().toLowerCase();
  if (targetSection === 'gender' || targetSection === 'sex') return true;

  const combinedText = [
    suggestion.title,
    suggestion.reason,
    suggestion.targetField,
    suggestion.targetSection,
    Array.isArray(suggestion.suggestedValue) ? suggestion.suggestedValue.join(' ') : suggestion.suggestedValue,
    suggestion.originalValue,
  ]
    .map((item) => String(item || ''))
    .join(' ');
  return keywordPattern.test(combinedText);
};

export const isSelfIntroQuestion = (q: string) => {
  const t = String(q || '').trim();
  if (!t) return false;
  return /自我介绍|介绍一下你自己|简单介绍一下自己|请介绍一下你自己/.test(t);
};

export const formatInterviewQuestion = (q: string) => {
  let t = String(q || '').trim();
  if (!t) return t;

  const isSelf = isSelfIntroQuestion(t);
  const hasSelf =
    t.includes(SELF_INTRO_REMINDER) ||
    t.includes('自我介绍建议控制在1分钟') ||
    t.includes('自我介绍时间为1分钟');

  if (isSelf) {
    t = t.replaceAll(INTERVIEW_ANSWER_LIMIT_SUFFIX, '').trim();
    if (!hasSelf) t = `${t}\n${SELF_INTRO_REMINDER}`;
    return t.trim();
  }

  const hasLimit = t.includes(INTERVIEW_ANSWER_LIMIT_SUFFIX);
  if (!hasLimit) t = `${t}\n${INTERVIEW_ANSWER_LIMIT_SUFFIX}`;
  return t;
};

