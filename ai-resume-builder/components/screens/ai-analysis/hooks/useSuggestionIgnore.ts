import { confirmDialog } from '../../../../src/ui/dialogs';

type Params = {
  suggestions: any[];
  setSuggestions: (next: any[]) => void;
  setChatMessages: (updater: (prev: any[]) => any[]) => void;
  persistSuggestionsState: (nextSuggestions: any[]) => Promise<void>;
  resumeData: any;
  report: any;
  score: number;
  jdText: string;
  targetCompany: string;
  saveLastAnalysis: (payload: any) => void;
  showToast: (msg: string, type?: 'info' | 'success' | 'error') => void;
};

export const useSuggestionIgnore = ({
  suggestions,
  setSuggestions,
  setChatMessages,
  persistSuggestionsState,
  resumeData,
  report,
  score,
  jdText,
  targetCompany,
  saveLastAnalysis,
  showToast,
}: Params) => {
  const handleIgnoreSuggestion = async (suggestion: any) => {
    const suggestionId = String(suggestion?.id || '').trim();
    if (!suggestionId) return;
    const confirmed = await confirmDialog('确认忽略这条优化建议吗？忽略后将不再显示。');
    if (!confirmed) return;

    const nextSuggestions = (suggestions || []).filter((s: any) => String(s?.id || '') !== suggestionId);
    setSuggestions(nextSuggestions as any);
    setChatMessages(prev => prev.map(msg =>
      msg.suggestion?.id === suggestionId
        ? { ...msg, suggestion: { ...msg.suggestion!, status: 'ignored' as const } }
        : msg
    ));
    await persistSuggestionsState(nextSuggestions as any);

    if (resumeData?.id && report) {
      const updatedAt = new Date().toISOString();
      const snapshotForPersist = {
        score,
        summary: report.summary || '',
        strengths: report.strengths || [],
        weaknesses: report.weaknesses || [],
        missingKeywords: report.missingKeywords || [],
        scoreBreakdown: report.scoreBreakdown || { experience: 0, skills: 0, format: 0 },
        suggestions: nextSuggestions,
        updatedAt,
        jdText: jdText || resumeData.lastJdText || '',
        targetCompany: targetCompany || resumeData.targetCompany || '',
      };
      saveLastAnalysis({
        resumeId: resumeData.id,
        jdText: snapshotForPersist.jdText,
        targetCompany: snapshotForPersist.targetCompany,
        snapshot: snapshotForPersist,
        updatedAt,
      });
    }

    showToast('已忽略该建议', 'info');
  };

  return { handleIgnoreSuggestion };
};
