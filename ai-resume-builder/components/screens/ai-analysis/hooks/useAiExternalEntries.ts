import { useAiDiagnosisExternalEntry } from './useAiDiagnosisExternalEntry';
import { useAiInterviewExternalEntry } from './useAiInterviewExternalEntry';
import type { AiExternalEntriesParams } from './useAiExternalEntries.types';

export const useAiExternalEntries = (params: AiExternalEntriesParams) => {
  useAiInterviewExternalEntry(params);
  useAiDiagnosisExternalEntry(params);
};
