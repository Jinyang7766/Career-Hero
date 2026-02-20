import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import { DatabaseService } from '../../../../src/database-service';
import { getActiveInterviewFocus, getActiveInterviewMode, getActiveInterviewType } from '../interview-plan-utils';

type Params = {
  currentUserId?: string;
  currentStep?: string;
  isInterviewMode?: boolean;
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
  openChat: (source: 'internal' | 'preview', options?: { skipRestore?: boolean }) => void;
  setStepHistory: (v: any[]) => void;
  setChatEntrySource?: (v: 'internal' | 'preview' | null) => void;
  setLastChatStep?: (v: any) => void;
  setCurrentStep: (v: any) => void;
  setForceReportEntry: (v: boolean) => void;
  handleResumeSelect: (
    id: string | number,
    preferReport?: boolean,
    targetStep?: 'report' | 'chat' | 'final_report'
  ) => Promise<void> | void;
};

export const useAiExternalEntries = ({
  currentUserId,
  currentStep = '',
  isInterviewMode = false,
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
  setChatEntrySource,
  setLastChatStep,
  setCurrentStep,
  setForceReportEntry,
  handleResumeSelect,
}: Params) => {
  const expectedChatMode = isInterviewMode ? 'interview' : 'micro';
  const normalizeSceneText = (value: any) =>
    String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const pickLatestSessionMessages = (resumeRow: any, jdText: string) => {
    const sessions = resumeRow?.interviewSessions || {};
    const normalizedJdText = String(jdText || '').trim();
    const sessionJdKey = normalizedJdText ? makeJdKey(normalizedJdText) : '';
    const allSessions = Object.values(sessions || {}) as any[];
    if (!allSessions.length) return [] as any[];

    const jdMatchedRaw = sessionJdKey
      ? allSessions.filter((session: any) => {
        const sessionJdText = String(session?.jdText || '').trim();
        const sessionKey = sessionJdText ? makeJdKey(sessionJdText) : '';
        return !!sessionKey && sessionKey === sessionJdKey;
      })
      : allSessions;
    // Home entry may carry a stale/empty lastJdText while history exists under another jdKey.
    // Fall back to all sessions in the same scene so history appears immediately.
    const jdMatched = jdMatchedRaw.length ? jdMatchedRaw : allSessions;

    const strictModeMatched = jdMatched.filter((session: any) => {
      const chatMode = String(session?.chatMode || '').trim().toLowerCase();
      if (chatMode !== expectedChatMode) return false;
      if (!isInterviewMode) return true;
      const sessionType = String(session?.interviewType || '').trim().toLowerCase();
      const sessionMode = String(session?.interviewMode || '').trim().toLowerCase();
      const sessionFocus = normalizeSceneText(session?.interviewFocus);
      const sessionCompany = normalizeSceneText(session?.targetCompany);
      const sessionResumeId = String(session?.resumeId || '').trim();
      return (
        sessionType === String(getActiveInterviewType() || 'general').trim().toLowerCase() &&
        sessionMode === String(getActiveInterviewMode() || 'comprehensive').trim().toLowerCase() &&
        sessionFocus === normalizeSceneText(getActiveInterviewFocus()) &&
        sessionCompany === normalizeSceneText(resumeRow?.targetCompany || '') &&
        (!sessionResumeId || sessionResumeId === String(resumeRow?.id || '').trim())
      );
    });
    const pool = strictModeMatched;
    const latest = pool.reduce((acc: any, curr: any) => {
      const accAt = Date.parse(String(acc?.updatedAt || ''));
      const currAt = Date.parse(String(curr?.updatedAt || ''));
      if (!Number.isFinite(accAt)) return curr;
      if (!Number.isFinite(currAt)) return acc;
      return currAt > accAt ? curr : acc;
    }, null);
    const messages = Array.isArray(latest?.messages) ? latest.messages : [];
    return messages;
  };
  const navOwnerKey = 'ai_nav_owner_user_id';
  const isOwnedByCurrentUser = () => {
    const owner = String(localStorage.getItem(navOwnerKey) || '').trim();
    const uid = String(currentUserId || '').trim();
    if (!owner) return true;
    if (!uid) return false;
    return owner === uid;
  };

  useEffect(() => {
    if (!isInterviewMode) return;
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
          const sessionJdKey = makeJdKey(savedJdText);
          const jdMatchedSessions = Object.values(sessions).filter((session: any) => {
            if (!session) return false;
            const directJdText = String(session?.jdText || '').trim();
            const directJdKey = directJdText ? makeJdKey(directJdText) : '';
            return directJdKey === sessionJdKey;
          }) as any[];
          const strictModeMatched = jdMatchedSessions.filter((session: any) => {
            const chatMode = String(session?.chatMode || '').trim().toLowerCase();
            return chatMode === expectedChatMode;
          });
          const matchedSessions = strictModeMatched;
          const session = matchedSessions.reduce((acc: any, curr: any) => {
            const accAt = Date.parse(String(acc?.updatedAt || ''));
            const currAt = Date.parse(String(curr?.updatedAt || ''));
            if (!Number.isFinite(accAt)) return curr;
            if (!Number.isFinite(currAt)) return acc;
            return currAt > accAt ? curr : acc;
          }, null);
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
  }, [currentUserId, isInterviewMode]);

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
      'report';
    const targetStep = (
      ['jd_input', 'analyzing', 'report', 'micro_intro', 'chat', 'interview_report', 'comparison', 'final_report']
        .includes(String(targetStepRaw || '').trim().toLowerCase())
        ? String(targetStepRaw || '').trim().toLowerCase()
        : 'report'
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
        // Homepage continue-diagnosis flow: mimic manual resume click behavior exactly.
        setForceReportEntry(false);
        localStorage.setItem('ai_analysis_step', 'resume_select');
        await handleResumeSelect(targetId, preferReportFromHome, undefined);
        return;
      }
      // Align homepage/report external entry with resume_select behavior:
      // use the same handleResumeSelect inference path, avoid extra overrides.
      const effectiveTargetStep = targetStep;
      localStorage.setItem('ai_analysis_step', effectiveTargetStep || 'resume_select');
      const preferReport = effectiveTargetStep !== 'jd_input' && effectiveTargetStep !== 'resume_select';
      const mappedTargetStep =
        effectiveTargetStep === 'report' ? 'report'
          : effectiveTargetStep === 'chat' ? 'chat'
            : effectiveTargetStep === 'final_report' ? 'final_report'
              : undefined;
      setForceReportEntry(
        mappedTargetStep === 'report' ||
        effectiveTargetStep === 'interview_report' ||
        effectiveTargetStep === 'comparison' ||
        mappedTargetStep === 'final_report'
      );
      await handleResumeSelect(targetId, preferReport, mappedTargetStep);
    })();
  }, [currentUserId, currentStep, expectedChatMode, isInterviewMode]);
};
