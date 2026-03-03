import type { GuidedFlowStep } from './types';

export type GuidedFlowStepStatus = 'done' | 'current' | 'todo';

export type GuidedFlowStepMeta = {
  step: GuidedFlowStep;
  title: string;
  shortTitle: string;
  route: string;
};

export const GUIDED_FLOW_STEP_META: GuidedFlowStepMeta[] = [
  {
    step: 'step1_profile_input',
    title: '上传简历与画像补充',
    shortTitle: '上传+补充',
    route: '/career-profile/upload',
  },
  {
    step: 'step2_profile_confirm',
    title: '画像确认入库',
    shortTitle: '画像确认',
    route: '/career-profile/result/summary',
  },
  {
    step: 'step3_mode_and_resume',
    title: '选择模式与简历',
    shortTitle: '模式选择',
    route: '/ai-analysis/jd',
  },
  {
    step: 'step4_report',
    title: '评分与缺口报告',
    shortTitle: '评分报告',
    route: '/ai-analysis/final-report',
  },
  {
    step: 'step5_refine',
    title: '简历精修',
    shortTitle: '简历精修',
    route: '/ai-analysis/comparison',
  },
  {
    step: 'step6_interview',
    title: '模拟面试',
    shortTitle: '模拟面试',
    route: '/ai-interview',
  },
];

const STEP_INDEX = GUIDED_FLOW_STEP_META.reduce<Record<GuidedFlowStep, number>>((acc, item, index) => {
  acc[item.step] = index;
  return acc;
}, {} as Record<GuidedFlowStep, number>);

export const getGuidedFlowStepIndex = (step: GuidedFlowStep | null | undefined): number => {
  if (!step) return -1;
  if (!(step in STEP_INDEX)) return -1;
  return STEP_INDEX[step];
};

export const isGuidedStepAtOrAfter = (
  step: GuidedFlowStep | null | undefined,
  target: GuidedFlowStep
): boolean => {
  const stepIndex = getGuidedFlowStepIndex(step);
  if (stepIndex < 0) return false;
  return stepIndex >= STEP_INDEX[target];
};

export const deriveGuidedFlowStepStatuses = (
  currentStep: GuidedFlowStep | null | undefined
): GuidedFlowStepStatus[] => {
  const currentIndex = getGuidedFlowStepIndex(currentStep);
  return GUIDED_FLOW_STEP_META.map((_, index) => {
    if (index < currentIndex) return 'done';
    if (index === currentIndex) return 'current';
    return 'todo';
  });
};

export const guidedFlowStepToPath = (step: GuidedFlowStep): string => {
  const target = GUIDED_FLOW_STEP_META.find((item) => item.step === step);
  return target?.route || '/career-profile/upload';
};
