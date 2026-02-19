import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import { DatabaseService } from '../../../../src/database-service';

type Params = {
  currentUserId?: string;
  setResumeData?: (v: any) => void;
  sourceResumeIdRef: MutableRefObject<string | number | null>;
  setSelectedResumeId: (v: string | number | null) => void;
  setAnalysisResumeId: (v: string | number | null) => void;
  setOptimizedResumeId: (v: string | number | null) => void;
  setTargetCompany: (v: string) => void;
  setJdText: (v: string) => void;
  makeJdKey: (text: string) => string;
  setChatMessages: (v: any) => void;
  setChatInitialized: (v: boolean) => void;
  openChat: (source: 'internal' | 'preview') => void;
  setStepHistory: (v: any[]) => void;
  setCurrentStep: (v: any) => void;
  setForceReportEntry: (v: boolean) => void;
  handleResumeSelect: (id: string | number, preferReport?: boolean) => Promise<void> | void;
};

export const useAiExternalEntries = ({
  currentUserId,
  setResumeData,
  sourceResumeIdRef,
  setSelectedResumeId,
  setAnalysisResumeId,
  setOptimizedResumeId,
  setTargetCompany,
  setJdText,
  makeJdKey,
  setChatMessages,
  setChatInitialized,
  openChat,
  setStepHistory,
  setCurrentStep,
  setForceReportEntry,
  handleResumeSelect,
}: Params) => {
  const navOwnerKey = 'ai_nav_owner_user_id';
  const isOwnedByCurrentUser = () => {
    const owner = String(localStorage.getItem(navOwnerKey) || '').trim();
    const uid = String(currentUserId || '').trim();
    if (!owner) return true;
    if (!uid) return false;
    return owner === uid;
  };

  useEffect(() => {
    if (!isOwnedByCurrentUser()) {
      localStorage.removeItem('ai_interview_open');
      localStorage.removeItem('ai_interview_resume_id');
      localStorage.removeItem('ai_interview_entry_mode');
      return;
    }
    const shouldOpen = localStorage.getItem('ai_interview_open') === '1';
    const targetId = localStorage.getItem('ai_interview_resume_id');
    const interviewEntryMode = localStorage.getItem('ai_interview_entry_mode') || 'chat';
    if (!shouldOpen || !targetId) return;

    localStorage.removeItem('ai_interview_open');
    localStorage.removeItem('ai_interview_resume_id');
    localStorage.removeItem('ai_interview_entry_mode');
    localStorage.removeItem(navOwnerKey);
    if (interviewEntryMode === 'scene_select') {
      setStepHistory([]);
      setCurrentStep('jd_input');
    }

    (async () => {
      const resumeId = targetId;
      const result = await DatabaseService.getResume(resumeId);
      if (result.success && result.data) {
        const finalResumeData = {
          id: result.data.id,
          ...result.data.resume_data,
          resumeTitle: result.data.title
        };
        if (setResumeData) {
          sourceResumeIdRef.current = finalResumeData.optimizedFromId || finalResumeData.id;
          setResumeData(finalResumeData);
        }
        setSelectedResumeId(result.data.id);
        setAnalysisResumeId(result.data.id);
        setOptimizedResumeId(
          finalResumeData.optimizedResumeId ||
          (finalResumeData.optimizationStatus === 'optimized' ? result.data.id : null)
        );
        if (finalResumeData.targetCompany) {
          setTargetCompany(finalResumeData.targetCompany);
        }
        const savedJdText = (finalResumeData.lastJdText || '').trim();
        if (savedJdText) {
          setJdText(savedJdText);
        }
        if (savedJdText) {
          const sessions = finalResumeData.interviewSessions || {};
          const sessionKey = makeJdKey(savedJdText);
          const session = sessions[sessionKey];
          if (interviewEntryMode !== 'scene_select' && session && session.messages?.length) {
            setChatMessages(session.messages as any);
            setChatInitialized(true);
          } else {
            setChatMessages([]);
            setChatInitialized(false);
          }
        } else {
          setChatMessages([]);
          setChatInitialized(false);
        }
        if (interviewEntryMode !== 'scene_select') {
          openChat('preview');
        }
      }
    })();
  }, [currentUserId]);

  useEffect(() => {
    if (!isOwnedByCurrentUser()) {
      localStorage.removeItem('ai_result_open');
      localStorage.removeItem('ai_result_resume_id');
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
      'report';
    const targetStep = (
      ['jd_input', 'analyzing', 'report', 'micro_intro', 'chat', 'interview_report', 'comparison', 'final_report']
        .includes(String(targetStepRaw || '').trim().toLowerCase())
        ? String(targetStepRaw || '').trim().toLowerCase()
        : 'report'
    );
    if (!shouldOpenReport || !targetId) return;

    localStorage.removeItem('ai_result_open');
    localStorage.removeItem('ai_result_resume_id');
    localStorage.removeItem('ai_result_step');
    localStorage.removeItem('ai_report_resume_payload');
    localStorage.removeItem('ai_report_open');
    localStorage.removeItem('ai_report_resume_id');
    localStorage.removeItem('ai_report_step');
    localStorage.removeItem(navOwnerKey);
    localStorage.setItem('ai_analysis_step', targetStep);
    setStepHistory([]);
    setForceReportEntry(targetStep === 'report' || targetStep === 'interview_report' || targetStep === 'comparison' || targetStep === 'final_report');
    (async () => {
      const preferReport = targetStep === 'report' || targetStep === 'interview_report' || targetStep === 'comparison' || targetStep === 'final_report';
      await handleResumeSelect(targetId, preferReport);
      setCurrentStep(targetStep);
    })();
  }, [currentUserId]);
};
