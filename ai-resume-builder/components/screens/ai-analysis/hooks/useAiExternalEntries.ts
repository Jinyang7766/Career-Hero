import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import { DatabaseService } from '../../../../src/database-service';

type Params = {
  setResumeData?: (v: any) => void;
  sourceResumeIdRef: MutableRefObject<string | number | null>;
  setSelectedResumeId: (v: string | number | null) => void;
  setOriginalResumeData: (v: any) => void;
  setAnalysisResumeId: (v: string | number | null) => void;
  setOptimizedResumeId: (v: string | number | null) => void;
  setTargetCompany: (v: string) => void;
  setJdText: (v: string) => void;
  makeJdKey: (text: string) => string;
  setChatMessages: (v: any) => void;
  setChatInitialized: (v: boolean) => void;
  openChat: (source: 'internal' | 'preview') => void;
  applyAnalysisSnapshot: (snapshot: any) => boolean;
  saveLastAnalysis: (payload: {
    resumeId: string | number;
    jdText: string;
    targetCompany?: string;
    snapshot: any;
    updatedAt: string;
  }) => void;
  navigateToStep: (v: any, replaceHistory?: boolean) => void;
  setStepHistory: (v: any[]) => void;
  setCurrentStep: (v: any) => void;
  setForceReportEntry: (v: boolean) => void;
  handleResumeSelect: (id: string | number, preferReport?: boolean) => void;
};

export const useAiExternalEntries = ({
  setResumeData,
  sourceResumeIdRef,
  setSelectedResumeId,
  setOriginalResumeData,
  setAnalysisResumeId,
  setOptimizedResumeId,
  setTargetCompany,
  setJdText,
  makeJdKey,
  setChatMessages,
  setChatInitialized,
  openChat,
  applyAnalysisSnapshot,
  saveLastAnalysis,
  navigateToStep,
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

    const payloadRaw = localStorage.getItem('ai_report_resume_payload');
    localStorage.removeItem('ai_report_resume_payload');
    let payload: any = null;
    if (payloadRaw) {
      try {
        payload = JSON.parse(payloadRaw);
      } catch (error) {
        console.warn('Failed to parse ai_report_resume_payload:', error);
        payload = null;
      }
    }

    localStorage.removeItem('ai_report_open');
    localStorage.removeItem('ai_report_resume_id');
    localStorage.setItem('ai_analysis_step', 'report');
    setStepHistory([]);
    setCurrentStep('report');
    setForceReportEntry(true);

    if (payload && String(payload.id) === String(targetId) && payload.resume_data) {
      const finalResumeData = {
        id: payload.id,
        ...payload.resume_data,
        resumeTitle: payload.title || payload.resume_data.resumeTitle || '简历'
      };
      if (setResumeData) {
        sourceResumeIdRef.current = finalResumeData.optimizedFromId || finalResumeData.id;
        setResumeData(finalResumeData);
      }
      setSelectedResumeId(payload.id);
      setAnalysisResumeId(payload.id);
      setOptimizedResumeId(
        finalResumeData.optimizedResumeId ||
        (finalResumeData.optimizationStatus === 'optimized' ? payload.id : null)
      );
      setOriginalResumeData(JSON.parse(JSON.stringify(finalResumeData)));
      if (finalResumeData.targetCompany) {
        setTargetCompany(finalResumeData.targetCompany);
      }
      const restoredJdText = (finalResumeData.lastJdText || '').trim();
      if (restoredJdText) {
        setJdText(restoredJdText);
      }
      applyAnalysisSnapshot(finalResumeData.analysisSnapshot);
      if (finalResumeData.analysisSnapshot) {
        saveLastAnalysis({
          resumeId: payload.id,
          jdText: restoredJdText,
          targetCompany: finalResumeData.targetCompany || '',
          snapshot: finalResumeData.analysisSnapshot,
          updatedAt: finalResumeData.analysisSnapshot.updatedAt || new Date().toISOString()
        });
        setAnalysisResumeId(payload.id);
      }
      navigateToStep('report', true);
      return;
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
        setOptimizedResumeId(
          finalResumeData.optimizedResumeId ||
          (finalResumeData.optimizationStatus === 'optimized' ? result.data.id : null)
        );
        if (finalResumeData.targetCompany) {
          setTargetCompany(finalResumeData.targetCompany);
        }
        const restoredJdText = (finalResumeData.lastJdText || '').trim();
        if (restoredJdText) {
          setJdText(restoredJdText);
        }
        applyAnalysisSnapshot(finalResumeData.analysisSnapshot);
        if (finalResumeData.analysisSnapshot) {
          saveLastAnalysis({
            resumeId: result.data.id,
            jdText: restoredJdText,
            targetCompany: finalResumeData.targetCompany || '',
            snapshot: finalResumeData.analysisSnapshot,
            updatedAt: finalResumeData.analysisSnapshot.updatedAt || new Date().toISOString()
          });
          setAnalysisResumeId(result.data.id);
        }
        navigateToStep('report', true);
      } else {
        handleResumeSelect(resumeId, true);
      }
    })();
  }, []);
};
