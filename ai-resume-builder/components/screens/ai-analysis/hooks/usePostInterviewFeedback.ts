import { useCallback } from 'react';
import { DatabaseService } from '../../../../src/database-service';

type Params = {
  currentUserId?: string;
  showToast: (msg: string, type?: 'info' | 'success' | 'error', durationMs?: number) => void;
  effectivePostInterviewSummary: string;
  postInterviewGeneratedResume: any;
  postInterviewOriginalResume: any;
  resumeId?: string | number | null;
};

export const usePostInterviewFeedback = ({
  currentUserId,
  showToast,
  effectivePostInterviewSummary,
  postInterviewGeneratedResume,
  postInterviewOriginalResume,
  resumeId,
}: Params) => {
  const handlePostInterviewFeedback = useCallback(async (rating: 'up' | 'down', reason?: string) => {
    if (!currentUserId) {
      showToast('请先登录后再反馈', 'info', 1800);
      return false;
    }
    const feedbackResumeId =
      (postInterviewGeneratedResume as any)?.id ||
      (postInterviewOriginalResume as any)?.id ||
      resumeId ||
      null;
    const result = await DatabaseService.createSuggestionFeedback({
      userId: String(currentUserId),
      resumeId: feedbackResumeId ? String(feedbackResumeId) : null,
      suggestionId: 'post-interview-generated-resume',
      rating,
      title: '微访谈生成简历整体反馈',
      reasonMasked: `${String(reason || '').trim() ? `${String(reason || '').trim()} | ` : ''}${effectivePostInterviewSummary || ''}` || undefined,
      originalValueMasked: null,
      suggestedValueMasked: {
        source: 'post_interview_report',
        hasGeneratedResume: Boolean(postInterviewGeneratedResume),
        feedbackReason: String(reason || '').trim() || null,
      },
    });
    if (!result.success) {
      showToast('反馈提交失败，请稍后重试', 'error', 2200);
      return false;
    }
    showToast('反馈已提交，感谢你的评价', 'success', 1800);
    return true;
  }, [
    currentUserId,
    effectivePostInterviewSummary,
    postInterviewGeneratedResume,
    postInterviewOriginalResume,
    resumeId,
    showToast,
  ]);

  return { handlePostInterviewFeedback };
};
