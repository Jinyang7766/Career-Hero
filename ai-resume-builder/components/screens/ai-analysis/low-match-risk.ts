export type LowMatchRiskLevel = 'low' | 'medium' | 'high';

export type LowMatchRiskDescriptor = {
  level: LowMatchRiskLevel;
  label: 'Low' | 'Medium' | 'High';
  labelZh: string;
  hint: string;
};

const clampScore = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
};

export const resolveLowMatchRiskLevel = (score: number): LowMatchRiskLevel => {
  const normalized = clampScore(score);
  if (normalized >= 75) return 'low';
  if (normalized >= 55) return 'medium';
  return 'high';
};

export const getLowMatchRiskDescriptor = (score: number): LowMatchRiskDescriptor => {
  const level = resolveLowMatchRiskLevel(score);
  if (level === 'low') {
    return {
      level,
      label: 'Low',
      labelZh: '低风险',
      hint: '当前匹配相对稳定，可继续保持定向优化。',
    };
  }
  if (level === 'medium') {
    return {
      level,
      label: 'Medium',
      labelZh: '中风险',
      hint: '存在一定匹配缺口，建议补强核心证据或切换通用优化。',
    };
  }
  return {
    level,
    label: 'High',
    labelZh: '高风险',
    hint: '当前 JD 低匹配风险较高，建议优先转为通用优化并补齐基础素材。',
  };
};
