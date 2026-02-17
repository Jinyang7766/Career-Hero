import { DatabaseService } from '../../../../src/database-service';
import type { ResumeData } from '../../../../types';
import type { ChatMessage } from '../types';
import { makeJdKey } from '../id-utils';

type AnalysisSessionState =
  | 'idle'
  | 'jd_ready'
  | 'analyzing'
  | 'report_ready'
  | 'interview_in_progress'
  | 'paused'
  | 'interview_done'
  | 'error';

type Params = {
  resumeData: ResumeData;
  setResumeData?: (v: ResumeData) => void;
  jdText: string;
  setJdText: (v: string) => void;
  targetCompany: string;
  setTargetCompany: (v: string) => void;
  setChatMessages: (v: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  setChatInitialized: (v: boolean) => void;
};

export const useInterviewSessionStore = ({
  resumeData,
  setResumeData,
  jdText,
  setJdText,
  targetCompany,
  setTargetCompany,
  setChatMessages,
  setChatInitialized,
}: Params) => {
  const LAST_ANALYSIS_KEY = 'ai_last_analysis_snapshot';

  const saveLastAnalysis = (payload: {
    resumeId: string | number;
    jdText: string;
    targetCompany?: string;
    snapshot: any;
    updatedAt: string;
    analysisReportId?: string;
    optimizedResumeId?: string | number;
  }) => {
    try {
      localStorage.setItem(LAST_ANALYSIS_KEY, JSON.stringify(payload));
    } catch (error) {
      console.warn('Failed to save last analysis snapshot:', error);
    }
  };

  const loadLastAnalysis = () => {
    try {
      const raw = localStorage.getItem(LAST_ANALYSIS_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (error) {
      console.warn('Failed to parse last analysis snapshot:', error);
      return null;
    }
  };

  const clearLastAnalysis = () => {
    localStorage.removeItem(LAST_ANALYSIS_KEY);
  };

  const getAnalysisSession = (overrideJdText?: string) => {
    const sessionJdText = (overrideJdText ?? jdText ?? resumeData?.lastJdText ?? '').trim();
    if (!sessionJdText || !resumeData) return null;
    const jdKey = makeJdKey(sessionJdText);
    const byJd = (resumeData as any).analysisSessionByJd || {};
    return byJd[jdKey] || null;
  };

  const persistAnalysisSessionState = async (
    state: AnalysisSessionState,
    patch?: Partial<{
      jdText: string;
      targetCompany: string;
      score: number;
      step: string;
      error: string;
      lastMessageAt: string;
      force: boolean;
    }>
  ) => {
    if (!resumeData?.id) return;
    const sessionJdText = (patch?.jdText ?? jdText ?? resumeData.lastJdText ?? '').trim();
    if (!sessionJdText) return;

    const jdKey = makeJdKey(sessionJdText);
    const byJd = (resumeData as any).analysisSessionByJd || {};
    const prev = byJd[jdKey] || {};
    const now = new Date().toISOString();
    const force = !!patch?.force;

    if (!force && prev.state === state) {
      // Avoid noisy writes on every render/send while preserving real transitions.
      const prevAt = Date.parse(String(prev.updatedAt || ''));
      const ageMs = Number.isFinite(prevAt) ? (Date.now() - prevAt) : Number.MAX_SAFE_INTEGER;
      if (ageMs < 12000 && !patch?.error && !patch?.lastMessageAt) {
        return;
      }
    }

    const nextSession = {
      ...prev,
      state,
      jdKey,
      jdText: sessionJdText,
      targetCompany: patch?.targetCompany ?? targetCompany ?? resumeData.targetCompany ?? '',
      score: (typeof patch?.score === 'number' ? patch.score : prev.score),
      step: patch?.step ?? prev.step,
      error: patch?.error ?? '',
      lastMessageAt: patch?.lastMessageAt ?? prev.lastMessageAt,
      updatedAt: now,
    };

    const updatedResumeData = {
      ...resumeData,
      analysisSessionByJd: {
        ...byJd,
        [jdKey]: nextSession,
      },
      lastJdText: sessionJdText || resumeData.lastJdText || '',
      targetCompany: targetCompany || resumeData.targetCompany || '',
    };

    if (setResumeData) {
      setResumeData(updatedResumeData);
    }

    await DatabaseService.updateResume(String(resumeData.id), {
      resume_data: updatedResumeData,
      updated_at: now,
    });
  };

  const restoreInterviewSession = (overrideJdText?: string) => {
    if (!resumeData) return;
    const sessionJdText = (overrideJdText ?? jdText ?? resumeData.lastJdText ?? '').trim();
    if (!jdText && sessionJdText) {
      setJdText(sessionJdText);
    }
    if (!targetCompany && resumeData.targetCompany) {
      setTargetCompany(resumeData.targetCompany);
    }

    if (!sessionJdText) {
      setChatMessages([]);
      setChatInitialized(false);
      return;
    }

    const sessions = resumeData.interviewSessions || {};
    const sessionKey = makeJdKey(sessionJdText);
    const session = sessions[sessionKey];

    if (session && session.messages?.length) {
      setChatMessages(session.messages as ChatMessage[]);
      setChatInitialized(true);
    } else {
      setChatMessages([]);
      setChatInitialized(false);
    }
  };

  const persistInterviewSession = async (messages: ChatMessage[], overrideJdText?: string) => {
    if (!resumeData?.id) return;
    const sessionJdText = (overrideJdText ?? jdText ?? resumeData.lastJdText ?? '').trim();
    const jdKey = makeJdKey(sessionJdText);
    const currentSessions = resumeData.interviewSessions || {};
    const updatedSessions = {
      ...currentSessions,
      [jdKey]: {
        jdText: sessionJdText,
        messages: messages.map((m) => ({ id: m.id, role: m.role, text: m.text })),
        updatedAt: new Date().toISOString(),
      },
    };

    const updatedResumeData = {
      ...resumeData,
      interviewSessions: updatedSessions,
      lastJdText: sessionJdText,
      targetCompany: targetCompany || resumeData.targetCompany || '',
    };

    if (setResumeData) {
      setResumeData(updatedResumeData);
    }

    await DatabaseService.updateResume(String(resumeData.id), {
      resume_data: updatedResumeData,
      updated_at: new Date().toISOString(),
    });
  };

  return {
    saveLastAnalysis,
    loadLastAnalysis,
    clearLastAnalysis,
    makeJdKey,
    getAnalysisSession,
    persistAnalysisSessionState,
    restoreInterviewSession,
    persistInterviewSession,
  };
};
