import { useCallback } from 'react';
import { DatabaseService } from '../../../../src/database-service';
import type { ChatMessage } from '../types';
import type { AiAnalysisStep } from '../step-types';

type ToastType = 'info' | 'success' | 'error';

type Params = {
  currentUserId?: string;
  isInterviewMode?: boolean;
  currentStep: AiAnalysisStep;
  resumeData: any;
  selectedResumeId: string | number | null;
  showToast: (msg: string, type?: ToastType, durationMs?: number) => void;
  initialReportSummary: string;
  finalReportSummary: string;
  interviewReportSummary: string;
};

export const useAiAnalysisFeedback = ({
  currentUserId,
  isInterviewMode,
  currentStep,
  resumeData,
  selectedResumeId,
  showToast,
  initialReportSummary,
  finalReportSummary,
  interviewReportSummary,
}: Params) => {
  const submitReportFeedback = useCallback(async (
    payload: {
      source: 'initial_report' | 'final_report' | 'interview_report';
      suggestionId: string;
      title: string;
      summaryText?: string;
      rating: 'up' | 'down';
      reason?: string;
    }
  ) => {
    const userId = String(currentUserId || '').trim();
    if (!userId) {
      showToast('请先登录后再反馈', 'info', 1800);
      return false;
    }

    const summaryText = String(payload.summaryText || '').trim();
    const result = await DatabaseService.createSuggestionFeedback({
      userId,
      resumeId: (resumeData as any)?.id ?? selectedResumeId ?? null,
      suggestionId: payload.suggestionId,
      rating: payload.rating,
      title: payload.title,
      reasonMasked: `${String(payload.reason || '').trim() ? `${String(payload.reason || '').trim()} | ` : ''}${summaryText || ''}` || undefined,
      originalValueMasked: null,
      suggestedValueMasked: {
        source: payload.source,
        step: currentStep,
        isInterviewMode: Boolean(isInterviewMode),
        feedbackReason: String(payload.reason || '').trim() || null,
      },
    });

    if (!result.success) {
      showToast('反馈提交失败，请稍后重试', 'error', 2000);
      return false;
    }
    showToast('反馈已提交，感谢你的评价', 'success', 1500);
    return true;
  }, [currentStep, currentUserId, isInterviewMode, resumeData, selectedResumeId, showToast]);

  const handleChatMessageFeedback = useCallback(async (message: ChatMessage, rating: 'up' | 'down', reason?: string) => {
    const userId = String(currentUserId || '').trim();
    if (!userId) {
      showToast('请先登录后再反馈', 'info', 1800);
      return false;
    }

    const messageId = String(message?.id || '').trim();
    const messageText = String(message?.text || '').trim();
    if (!messageId || !messageText) {
      showToast('反馈提交失败，请稍后重试', 'error', 1800);
      return false;
    }

    const result = await DatabaseService.createSuggestionFeedback({
      userId,
      resumeId: (resumeData as any)?.id ?? selectedResumeId ?? null,
      suggestionId: `chat-message-${messageId}`,
      rating,
      title: 'AI 对话消息反馈',
      reasonMasked: (reason ? `${String(reason).trim()} | ` : '') + messageText.slice(0, 2000),
      originalValueMasked: null,
      suggestedValueMasked: {
        source: 'chat_message',
        step: currentStep,
        role: message.role,
        isInterviewMode: Boolean(isInterviewMode),
        feedbackReason: String(reason || '').trim() || null,
      },
    });

    if (!result.success) {
      showToast('反馈提交失败，请稍后重试', 'error', 2000);
      return false;
    }
    showToast('反馈已提交，感谢你的评价', 'success', 1500);
    return true;
  }, [currentStep, currentUserId, isInterviewMode, resumeData, selectedResumeId, showToast]);

  const handleInitialReportFeedback = useCallback((rating: 'up' | 'down', reason?: string) => (
    submitReportFeedback({
      source: 'initial_report',
      suggestionId: 'analysis-initial-report',
      title: '初步诊断报告反馈',
      summaryText: initialReportSummary,
      rating,
      reason,
    })
  ), [initialReportSummary, submitReportFeedback]);

  const handleFinalReportFeedback = useCallback((rating: 'up' | 'down', reason?: string) => (
    submitReportFeedback({
      source: 'final_report',
      suggestionId: 'analysis-final-report',
      title: '最终诊断报告反馈',
      summaryText: finalReportSummary,
      rating,
      reason,
    })
  ), [finalReportSummary, submitReportFeedback]);

  const handleInterviewReportFeedback = useCallback((rating: 'up' | 'down', reason?: string) => (
    submitReportFeedback({
      source: 'interview_report',
      suggestionId: 'analysis-interview-report',
      title: '面试报告反馈',
      summaryText: interviewReportSummary,
      rating,
      reason,
    })
  ), [interviewReportSummary, submitReportFeedback]);

  return {
    handleChatMessageFeedback,
    handleInitialReportFeedback,
    handleFinalReportFeedback,
    handleInterviewReportFeedback,
  };
};

