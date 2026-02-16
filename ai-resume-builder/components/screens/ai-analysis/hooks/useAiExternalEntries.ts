import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import { DatabaseService } from '../../../../src/database-service';

type Params = {
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
  useEffect(() => {
    const shouldOpen = localStorage.getItem('ai_interview_open') === '1';
    const targetId = localStorage.getItem('ai_interview_resume_id');
    if (!shouldOpen || !targetId) return;

    localStorage.removeItem('ai_interview_open');
    localStorage.removeItem('ai_interview_resume_id');

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
          if (session && session.messages?.length) {
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
        openChat('preview');
      }
    })();
  }, []);

  useEffect(() => {
    const shouldOpenReport = localStorage.getItem('ai_report_open') === '1';
    const targetId = localStorage.getItem('ai_report_resume_id');
    if (!shouldOpenReport || !targetId) return;

    localStorage.removeItem('ai_report_resume_payload');
    localStorage.removeItem('ai_report_open');
    localStorage.removeItem('ai_report_resume_id');
    localStorage.setItem('ai_analysis_step', 'report');
    setStepHistory([]);
    setForceReportEntry(true);
    setCurrentStep('report');
    void handleResumeSelect(targetId, true);
  }, []);
};
