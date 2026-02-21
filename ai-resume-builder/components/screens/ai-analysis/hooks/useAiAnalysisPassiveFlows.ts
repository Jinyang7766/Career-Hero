import { useAiAnalysisPassiveDataFlows } from './useAiAnalysisPassiveDataFlows';
import { useAiAnalysisPassiveStateFlows } from './useAiAnalysisPassiveStateFlows';
import type { AiAnalysisPassiveFlowsParams } from './useAiAnalysisPassiveFlows.types';

export const useAiAnalysisPassiveFlows = (params: AiAnalysisPassiveFlowsParams) => {
  useAiAnalysisPassiveStateFlows(params);
  useAiAnalysisPassiveDataFlows(params);
};
