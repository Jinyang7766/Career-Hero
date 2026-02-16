export type ScoreBreakdownLike = {
  experience: number;
  skills: number;
  format: number;
};

const SCORE_WEIGHTS = { experience: 0.4, skills: 0.4, format: 0.2 } as const;

export const normalizeScoreBreakdown = (
  raw: ScoreBreakdownLike,
  totalScore?: number
): ScoreBreakdownLike => {
  if (!raw) return { experience: 0, skills: 0, format: 0 };

  const sum = (raw.experience || 0) + (raw.skills || 0) + (raw.format || 0);
  const maxExpected = {
    experience: Math.round(SCORE_WEIGHTS.experience * 100),
    skills: Math.round(SCORE_WEIGHTS.skills * 100),
    format: Math.round(SCORE_WEIGHTS.format * 100),
  };

  const looksLikeContrib =
    sum > 0 &&
    sum <= 100 &&
    (totalScore ? Math.abs(sum - totalScore) <= 3 : true) &&
    raw.experience <= maxExpected.experience &&
    raw.skills <= maxExpected.skills &&
    raw.format <= maxExpected.format;

  if (!looksLikeContrib) {
    return {
      experience: Math.min(100, Math.max(0, Math.round(raw.experience || 0))),
      skills: Math.min(100, Math.max(0, Math.round(raw.skills || 0))),
      format: Math.min(100, Math.max(0, Math.round(raw.format || 0))),
    };
  }

  const toDimScore = (value: number, weight: number) =>
    Math.min(100, Math.max(0, Math.round((value || 0) / weight)));

  return {
    experience: toDimScore(raw.experience || 0, SCORE_WEIGHTS.experience),
    skills: toDimScore(raw.skills || 0, SCORE_WEIGHTS.skills),
    format: toDimScore(raw.format || 0, SCORE_WEIGHTS.format),
  };
};

const clampScore = (value: number) => Math.min(100, Math.max(0, Math.round(value || 0)));
const calcTotalFromBreakdown = (b: ScoreBreakdownLike) =>
  clampScore((b.experience || 0) * SCORE_WEIGHTS.experience + (b.skills || 0) * SCORE_WEIGHTS.skills + (b.format || 0) * SCORE_WEIGHTS.format);

export const resolveDisplayScore = (rawScore: number, breakdown: ScoreBreakdownLike) => {
  const hasBreakdown =
    (breakdown?.experience || 0) > 0 ||
    (breakdown?.skills || 0) > 0 ||
    (breakdown?.format || 0) > 0;
  return hasBreakdown ? calcTotalFromBreakdown(breakdown) : clampScore(rawScore);
};

