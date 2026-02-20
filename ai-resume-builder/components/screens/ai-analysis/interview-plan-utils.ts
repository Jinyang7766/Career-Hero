const resolveStorageUserId = (): string => {
  try {
    const analysisUid = String(localStorage.getItem('ai_analysis_user_id') || '').trim();
    if (analysisUid) return analysisUid;
    const userRaw = localStorage.getItem('user');
    if (userRaw) {
      const parsed = JSON.parse(userRaw);
      const uid = String(parsed?.id || '').trim();
      if (uid) return uid;
    }
    const sessionRaw = localStorage.getItem('supabase_session');
    if (sessionRaw) {
      const parsed = JSON.parse(sessionRaw);
      const uid = String(parsed?.user?.id || '').trim();
      if (uid) return uid;
    }
  } catch {
    // ignore storage parsing failures
  }
  return '';
};

const getScopedStorageKey = (baseKey: string, currentUserId?: string | null) => {
  const uid = String(currentUserId || resolveStorageUserId()).trim();
  if (!uid) return baseKey;
  return `${baseKey}:${uid}`;
};

const readInterviewPreference = (baseKey: string, currentUserId?: string | null): string => {
  try {
    const scopedKey = getScopedStorageKey(baseKey, currentUserId);
    const scoped = String(localStorage.getItem(scopedKey) || '').trim();
    if (scoped) return scoped;
    return String(localStorage.getItem(baseKey) || '').trim();
  } catch {
    return '';
  }
};

export const getActiveInterviewType = () => {
  const t = readInterviewPreference('ai_interview_type').toLowerCase();
  if (t === 'technical' || t === 'hr' || t === 'general') return t;
  return 'general';
};

export const getActiveInterviewMode = () => {
  const mode = readInterviewPreference('ai_interview_mode').toLowerCase();
  if (mode === 'simple' || mode === 'comprehensive') return mode;
  return 'comprehensive';
};

export const getActiveInterviewFocus = () =>
  readInterviewPreference('ai_interview_focus').slice(0, 300);

export const getInterviewQuestionLimit = () => {
  const mode = getActiveInterviewMode();
  return mode === 'simple' ? 3 : 12;
};

export const getPlanStorageKey = (
  resumeId: string | number | null | undefined,
  makeJdKey: (text: string) => string,
  effectiveJdText: string,
  interviewFocus?: string,
  targetCompany?: string,
  currentUserId?: string | number | null
) => {
  const interviewType = getActiveInterviewType();
  const interviewMode = getActiveInterviewMode();
  const focusKey = makeJdKey(String(interviewFocus || '').trim() || 'none');
  const companyKey = makeJdKey(String(targetCompany || '').trim() || 'none');
  const userKey = String(currentUserId || 'anonymous').trim() || 'anonymous';
  return `ai_interview_plan_${userKey}_${String(resumeId || 'unknown')}_${makeJdKey(effectiveJdText)}_${interviewType}_${interviewMode}_${focusKey}_${companyKey}`;
};

export const getLegacyPlanStorageKey = (
  resumeId: string | number | null | undefined,
  makeJdKey: (text: string) => string,
  effectiveJdText: string,
  interviewFocus?: string,
  targetCompany?: string
) => {
  const interviewType = getActiveInterviewType();
  const interviewMode = getActiveInterviewMode();
  const focusKey = makeJdKey(String(interviewFocus || '').trim() || 'none');
  const companyKey = makeJdKey(String(targetCompany || '').trim() || 'none');
  return `ai_interview_plan_${String(resumeId || 'unknown')}_${makeJdKey(effectiveJdText)}_${interviewType}_${interviewMode}_${focusKey}_${companyKey}`;
};

export const getInterviewerTitle = () => {
  const type = getActiveInterviewType();
  if (type === 'technical') return 'AI 复试深挖面试官';
  if (type === 'hr') return 'AI HR 面试官';
  return 'AI 初试面试官';
};

export const getInterviewerAvatarUrl = () => {
  const type = getActiveInterviewType();
  if (type === 'technical') return '/ai-avatar-technical-opt.png';
  if (type === 'hr') return '/ai-avatar-hr-opt.png';
  return '/ai-avatar.png';
};

export const getWarmupQuestion = (interviewType: string) => {
  if (interviewType === 'technical') return '你最引以为傲的职业成就是什么？或者一个你最近解决过的棘手问题是什么？';
  if (interviewType === 'hr') return '请用三个关键词定义你的个人工作风格，并分别说明一个真实体现该关键词的例子。';
  return '请先做一个1分钟的自我介绍，重点突出与你目标岗位最相关的经历与优势。';
};

export const getFallbackPlanByType = (interviewType: string): string[] => {
  if (interviewType === 'technical') {
    return [
      '请介绍一个你最有代表性的项目，并说明你负责的技术模块。',
      '该项目的核心技术方案是如何设计的？为什么这样选型？',
      '上线后遇到过哪些性能或稳定性问题？你如何定位与优化？',
      '请描述一次你处理复杂故障或线上事故的过程。',
      '如果业务量翻倍，你会如何改造当前架构？',
      '你如何保障代码质量与可维护性？',
      '回到这个项目，你认为最大的技术遗憾和改进方向是什么？',
    ];
  }
  if (interviewType === 'hr') {
    return [
      '请分享一次你与同事意见冲突并最终达成一致的案例。',
      '你如何在高压和紧急任务下保持交付质量？',
      '请讲一个你主动推动改进并产生结果的经历。',
      '你过去离职/转岗的主要考虑是什么？',
      '你为什么想加入这个岗位/公司？',
      '如果入职，你前3个月的工作目标是什么？',
    ];
  }
  return [
    '请介绍一个最有代表性的项目，并说明你的职责与结果。',
    '这个项目中最困难的问题是什么？你如何解决？',
    '请举例说明一次跨团队协作并推动结果落地的经历。',
    '你最匹配这个岗位的能力是什么？请给出证据。',
    '如果你入职该岗位，前3个月会如何规划与交付？',
    '请补充一个能体现你岗位匹配度的关键成果。'
  ];
};

const normalizeQuestionText = (value: any): string =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s\.,;:!?，。！？；：、（）()\[\]{}<>《》“”"'`~\-—_]+/g, '');

const isSameOrSimilarQuestion = (a: any, b: any): boolean => {
  const na = normalizeQuestionText(a);
  const nb = normalizeQuestionText(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
};

export const composeInterviewPlan = (interviewType: string, baseQuestions: string[]): string[] => {
  const warmup = String(getWarmupQuestion(interviewType) || '').trim();
  const dedupedBase = (baseQuestions || []).map((q) => String(q || '').trim()).filter(Boolean);
  if (!warmup) return dedupedBase;
  const rest = dedupedBase.filter((q) => !isSameOrSimilarQuestion(q, warmup));
  return [warmup, ...rest];
};

export const sanitizePlanQuestions = (
  items: any[],
  interviewType: string,
  options?: { minCount?: number; maxCount?: number }
): string[] => {
  const selfIntroRe = /(自我介绍|介绍一下你自己|简单介绍一下自己)/;
  const maxCount = Math.max(1, Math.min(12, Number(options?.maxCount) || 12));
  const desiredMin = Number(options?.minCount);
  const minCount = Math.max(1, Math.min(maxCount, Number.isFinite(desiredMin) ? desiredMin : 4));
  const unique: string[] = [];
  for (const it of (items || [])) {
    const q = String(it || '').trim();
    if (!q) continue;
    if (selfIntroRe.test(q)) continue;
    if (unique.includes(q)) continue;
    unique.push(q);
    if (unique.length >= maxCount) break;
  }
  if (unique.length < minCount) {
    for (const fallback of getFallbackPlanByType(interviewType)) {
      if (!fallback || selfIntroRe.test(fallback) || unique.includes(fallback)) continue;
      unique.push(fallback);
      if (unique.length >= minCount) break;
    }
  }
  return unique.slice(0, maxCount);
};
