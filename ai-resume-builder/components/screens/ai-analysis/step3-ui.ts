import type { AnalysisMode } from './analysis-mode';

type Step3Context = {
  isInterviewMode?: boolean;
  analysisMode: AnalysisMode;
};

export const shouldShowJdSection = ({ isInterviewMode, analysisMode }: Step3Context): boolean =>
  Boolean(isInterviewMode) || analysisMode === 'targeted';

export const isTargetRoleRequired = ({ isInterviewMode }: { isInterviewMode?: boolean }): boolean =>
  !isInterviewMode;

export const isGenericRoleRequired = ({ isInterviewMode }: Step3Context): boolean =>
  isTargetRoleRequired({ isInterviewMode });

export const isTargetRoleMissing = ({
  isInterviewMode,
  targetCompany,
}: Step3Context & { targetCompany: string }): boolean =>
  isTargetRoleRequired({ isInterviewMode }) && !String(targetCompany || '').trim();

export const isGenericRoleMissing = ({
  isInterviewMode,
  targetCompany,
}: Step3Context & { targetCompany: string }): boolean =>
  isTargetRoleMissing({ isInterviewMode, analysisMode: 'generic', targetCompany });

export const isTargetedJdMissing = ({
  isInterviewMode,
  analysisMode,
  jdText,
}: Step3Context & { jdText: string }): boolean =>
  !isInterviewMode && analysisMode === 'targeted' && !String(jdText || '').trim();

export const isStep3StartBlocked = ({
  isInterviewMode,
  analysisMode,
  targetCompany,
  jdText,
}: Step3Context & { targetCompany: string; jdText: string }): boolean =>
  isTargetRoleMissing({ isInterviewMode, analysisMode, targetCompany }) ||
  isTargetedJdMissing({ isInterviewMode, analysisMode, jdText });

export const getStep3TargetFieldLabel = ({ isInterviewMode, analysisMode }: Step3Context): string => {
  void analysisMode;
  if (isInterviewMode) return '目标公司 / 岗位';
  return '目标岗位（必填）';
};

export const getStep3TargetFieldPlaceholder = ({
  isInterviewMode,
  analysisMode,
}: Step3Context): string => {
  void analysisMode;
  if (isInterviewMode) return '例如：字节跳动 / 腾讯';
  return '例如：后端工程师 / 产品经理 / 数据分析师';
};
