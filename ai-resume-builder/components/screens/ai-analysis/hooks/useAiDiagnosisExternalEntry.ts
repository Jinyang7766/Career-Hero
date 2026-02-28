import { useEffect } from 'react';
import type { AiExternalEntriesParams } from './useAiExternalEntries.types';

export const useAiDiagnosisExternalEntry = ({
  currentUserId,
  currentStep = '',
  isInterviewMode = false,
  setForceReportEntry,
  handleResumeSelect,
}: AiExternalEntriesParams) => {
  const navOwnerKey = 'ai_nav_owner_user_id';
  const isOwnedByCurrentUser = () => {
    const owner = String(localStorage.getItem(navOwnerKey) || '').trim();
    const uid = String(currentUserId || '').trim();
    if (!owner) return true;
    if (!uid) return false;
    return owner === uid;
  };

  useEffect(() => {
    if (isInterviewMode) return;
    if (!isOwnedByCurrentUser()) {
      localStorage.removeItem('ai_result_open');
      localStorage.removeItem('ai_result_resume_id');
      localStorage.removeItem('ai_result_prefer_report');
      localStorage.removeItem('ai_result_step');
      localStorage.removeItem('ai_report_open');
      localStorage.removeItem('ai_report_resume_id');
      localStorage.removeItem('ai_report_step');
      localStorage.removeItem('ai_report_resume_payload');
      return;
    }
    const shouldOpenReport =
      localStorage.getItem('ai_result_open') === '1' ||
      localStorage.getItem('ai_report_open') === '1';
    const targetId =
      localStorage.getItem('ai_result_resume_id') ||
      localStorage.getItem('ai_report_resume_id');
    const targetStepRaw =
      localStorage.getItem('ai_result_step') ||
      localStorage.getItem('ai_report_step') ||
      'final_report';
    const targetStep = (
      ['jd_input', 'analyzing', 'report', 'chat', 'interview_report', 'comparison', 'final_report']
        .includes(String(targetStepRaw || '').trim().toLowerCase())
        ? String(targetStepRaw || '').trim().toLowerCase()
        : 'final_report'
    );
    const waitResumeSelect = localStorage.getItem('ai_result_wait_resume_select') === '1';
    if (waitResumeSelect && String(currentStep || '').trim().toLowerCase() !== 'resume_select') return;
    if (!shouldOpenReport || !targetId) return;

    localStorage.removeItem('ai_result_open');
    localStorage.removeItem('ai_result_resume_id');
    const preferReportFromHome = localStorage.getItem('ai_result_prefer_report') === '1';
    localStorage.removeItem('ai_result_prefer_report');
    localStorage.removeItem('ai_result_step');
    localStorage.removeItem('ai_result_wait_resume_select');
    localStorage.removeItem('ai_report_resume_payload');
    localStorage.removeItem('ai_report_open');
    localStorage.removeItem('ai_report_resume_id');
    localStorage.removeItem('ai_report_step');
    localStorage.removeItem(navOwnerKey);
    (async () => {
      if (waitResumeSelect) {
        setForceReportEntry(false);
        localStorage.setItem('ai_analysis_step', 'resume_select');
        await handleResumeSelect(targetId, preferReportFromHome, undefined);
        return;
      }
      const effectiveTargetStep =
        targetStep === 'final_report' || targetStep === 'interview_report'
          ? 'final_report'
          : targetStep === 'comparison' || targetStep === 'report' || targetStep === 'chat'
            ? 'final_report'
            : 'jd_input';
      localStorage.setItem('ai_analysis_step', effectiveTargetStep || 'resume_select');
      const preferReport = effectiveTargetStep !== 'jd_input';
      const mappedTargetStep =
        effectiveTargetStep === 'final_report' ? 'final_report'
            : undefined;
      setForceReportEntry(
        mappedTargetStep === 'final_report'
      );
      await handleResumeSelect(targetId, preferReport, mappedTargetStep);
    })();
  }, [currentUserId, currentStep, isInterviewMode]);
};
