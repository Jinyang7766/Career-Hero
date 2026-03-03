const ACTION_PREFIX_RE = /^(请|先|优先|立即|继续|补齐|补充|完善|重写|梳理|准备|练习|复盘|输出|建立|量化|对照|修改|优化|聚焦|减少|增加|完成|提交|验证|搭建|制定|拆解|明确)/;

const normalizeAdviceText = (value: string) =>
  String(value || '')
    .replace(/再进入下一轮面试[。！!]?/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const ensureFullStop = (value: string) => {
  const text = String(value || '').trim();
  if (!text) return '';
  return /[。！？!?]$/.test(text) ? text : `${text}。`;
};

export const toActionableAdvice = (rawAdvice: string): string => {
  const advice = normalizeAdviceText(rawAdvice);
  if (!advice) return '';

  if (ACTION_PREFIX_RE.test(advice)) {
    return ensureFullStop(advice);
  }

  if (/(方向性偏差|方向偏差|方向不匹配|不匹配|偏差)/.test(advice) && /(岗位|方向|职业背景|背景)/.test(advice)) {
    return '先校准目标岗位方向：聚焦 1-2 个目标岗位，并补齐对应项目与成果证据后再投递。';
  }

  if (/(缺乏|欠缺|不足|薄弱|不具备).*(技能|能力|技能栈)/.test(advice)) {
    return '补齐目标岗位核心技能栈：按“学习-实操-产出”完成至少 1 个可展示项目。';
  }

  if (/(经验不足|经历不足|项目不足|案例不足)/.test(advice)) {
    return '补充与目标岗位相关的项目或实习经历，并量化你的个人贡献与结果。';
  }

  if (/(表达|沟通|面试).*(不足|薄弱|不清晰|欠缺)/.test(advice)) {
    return '进行表达训练：用 STAR 结构准备 3 个案例，并完成 1 次模拟面试复盘。';
  }

  if (/匹配度/.test(advice)) {
    return '对照 JD 逐条补齐匹配项：把每条岗位要求映射到 1 段经历或项目证据。';
  }

  return `围绕“${advice.replace(/[。！？!?]+$/g, '')}”制定 1 项可执行改进动作，并在本周完成一次验证。`;
};

export const buildActionableAdvice = (adviceList: string[] = []): string[] => {
  const deduped = new Set<string>();
  const result: string[] = [];
  for (const raw of adviceList || []) {
    const normalized = normalizeAdviceText(raw);
    if (!normalized) continue;
    if (/(简历|排版|版式|字体|模块|措辞)/.test(normalized)) continue;
    const actionable = toActionableAdvice(normalized);
    if (!actionable || deduped.has(actionable)) continue;
    deduped.add(actionable);
    result.push(actionable);
    if (result.length >= 6) break;
  }
  return result;
};
