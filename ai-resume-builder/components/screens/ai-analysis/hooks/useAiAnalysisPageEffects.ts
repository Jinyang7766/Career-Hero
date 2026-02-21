import { useAiAnalysisInterviewPlanEffects } from './useAiAnalysisInterviewPlanEffects';
import { useAiAnalysisPageUiEffects } from './useAiAnalysisPageUiEffects';
import type { AiAnalysisPageEffectsParams } from './useAiAnalysisPageEffects.types';

export const useAiAnalysisPageEffects = (params: AiAnalysisPageEffectsParams) => {
  useAiAnalysisPageUiEffects(params);
  useAiAnalysisInterviewPlanEffects(params);
};
