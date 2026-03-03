import { useEffect } from 'react';
import { DatabaseService } from '../../../../src/database-service';
import { getActiveInterviewFocus, getActiveInterviewType } from '../interview-plan-utils';
import type { AiExternalEntriesParams } from './useAiExternalEntries.types';

const normalizeSceneText = (value: any) =>
  String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

export const shouldRestoreInterviewJdOnExternalEntry = (_entryMode: string) => true;

const pickLatestSessionByUpdatedAt = (sessions: any[]) =>
  sessions.reduce((acc: any, curr: any) => {
    const accAt = Date.parse(String(acc?.updatedAt || ''));
    const currAt = Date.parse(String(curr?.updatedAt || ''));
    if (!Number.isFinite(accAt)) return curr;
    if (!Number.isFinite(currAt)) return acc;
    return currAt > accAt ? curr : acc;
  }, null);

export const useAiInterviewExternalEntry = ({
  currentUserId,
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
  setCurrentStep,
}: AiExternalEntriesParams) => {
  const expectedChatMode = 'interview';
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

    (async () => {
      const result = await DatabaseService.getResume(targetId);
      if (!result.success || !result.data) return;
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
      const effectiveTarget = String(finalResumeData.targetCompany || finalResumeData.targetRole || '').trim();
      setTargetCompany(effectiveTarget);
      const savedJdText = (finalResumeData.lastJdText || '').trim();
      const shouldRestoreJdOnEntry = shouldRestoreInterviewJdOnExternalEntry(interviewEntryMode);
      if (savedJdText && shouldRestoreJdOnEntry) {
        setJdText(savedJdText);
      } else {
        setJdText('');
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
          if (chatMode !== expectedChatMode) return false;
          const sessionType = String(session?.interviewType || '').trim().toLowerCase();
          const sessionFocus = normalizeSceneText(session?.interviewFocus);
          const sessionCompany = normalizeSceneText(session?.targetCompany);
          const sessionResumeId = String(session?.resumeId || '').trim();
          return (
            sessionType === String(getActiveInterviewType() || 'general').trim().toLowerCase() &&
            sessionFocus === normalizeSceneText(getActiveInterviewFocus()) &&
            sessionCompany === normalizeSceneText(effectiveTarget) &&
            (!sessionResumeId || sessionResumeId === String(finalResumeData?.id || '').trim())
          );
        });
        const session = pickLatestSessionByUpdatedAt(strictModeMatched);
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
      if (interviewEntryMode === 'scene_select') {
        setStepHistory([]);
        setCurrentStep('interview_scene');
        return;
      }
      openChat('preview');
    })();
  }, [currentUserId, isInterviewMode]);
};

