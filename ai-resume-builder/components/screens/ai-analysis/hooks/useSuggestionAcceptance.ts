import { useRef } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { DatabaseService } from '../../../../src/database-service';
import { supabase } from '../../../../src/supabase-client';
import { buildResumeTitle } from '../../../../src/resume-utils';
import { applySuggestionToResume } from '../suggestion-applier';
import type { ResumeData } from '../../../../types';
import type { Suggestion } from '../types';

type Params = {
  resumeData: ResumeData;
  setResumeData?: (v: ResumeData) => void;
  suggestions: Suggestion[];
  setSuggestions: Dispatch<SetStateAction<Suggestion[]>>;
  setChatMessages: Dispatch<SetStateAction<any[]>>;
  allResumes: any[] | undefined;
  isSameResumeId: (a: any, b: any) => boolean;
  resolveOriginalResumeIdForOptimization: () => any;
  ensureSingleOptimizedResume: (userId: string, originalResumeId: string | number, originalResumeData: ResumeData) => Promise<string | number>;
  normalizeTargetSection: (section: any) => Suggestion['targetSection'] | '';
  inferTargetSection: (raw: any) => Suggestion['targetSection'];
  sanitizeSuggestedValue: (value: any, targetSection?: string) => any;
  toSkillList: (value: any) => string[];
  jdText: string;
  targetCompany: string;
  report: any;
  score: number;
  saveLastAnalysis: (payload: {
    resumeId: string | number;
    jdText: string;
    targetCompany?: string;
    snapshot: any;
    updatedAt: string;
  }) => void;
  setAnalysisResumeId: (id: string | number | null) => void;
  optimizedResumeIdRef: MutableRefObject<string | number | null>;
  setOptimizedResumeId: (id: string | number | null) => void;
  loadUserResumes?: () => Promise<void>;
  showToast: (msg: string, type?: 'info' | 'success' | 'error') => void;
  updateScore: (points: number) => void;
};

export const useSuggestionAcceptance = ({
  resumeData,
  setResumeData,
  suggestions,
  setSuggestions,
  setChatMessages,
  allResumes,
  isSameResumeId,
  resolveOriginalResumeIdForOptimization,
  ensureSingleOptimizedResume,
  normalizeTargetSection,
  inferTargetSection,
  sanitizeSuggestedValue,
  toSkillList,
  jdText,
  targetCompany,
  report,
  score,
  saveLastAnalysis,
  setAnalysisResumeId,
  optimizedResumeIdRef,
  setOptimizedResumeId,
  loadUserResumes,
  showToast,
  updateScore,
}: Params) => {
  const acceptSuggestionQueueRef = useRef<Promise<void>>(Promise.resolve());
  const acceptingSuggestionIdsRef = useRef<Set<string>>(new Set());

  const handleAcceptSuggestionInChat = async (suggestion: Suggestion) => {
    acceptSuggestionQueueRef.current = acceptSuggestionQueueRef.current.then(async () => {
      try {
        if (!setResumeData || !resumeData) return;
        const suggestionId = String((suggestion as any)?.id || '').trim();
        if (!suggestionId) return;
        if ((suggestion as any).status && (suggestion as any).status !== 'pending') return;
        if (acceptingSuggestionIdsRef.current.has(suggestionId)) return;
        acceptingSuggestionIdsRef.current.add(suggestionId);

        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
          throw new Error('登录已过期，请重新登录后再采纳建议');
        }
        const originalResumeId = resolveOriginalResumeIdForOptimization();
        if (!originalResumeId) {
          throw new Error('未找到原始简历ID，无法创建优化简历');
        }

        const originResult = await DatabaseService.getResume(originalResumeId);
        if (!originResult.success || !originResult.data?.resume_data) {
          throw new Error('未找到原始简历，无法执行优化');
        }
        const originalResume = {
          id: originResult.data.id,
          ...originResult.data.resume_data,
          resumeTitle: originResult.data.title
        } as ResumeData;

        const targetOptimizedId =
          (resumeData.optimizationStatus === 'optimized' &&
            resumeData.id &&
            isSameResumeId(resumeData.optimizedFromId, originalResumeId))
            ? resumeData.id
            : await ensureSingleOptimizedResume(user.id, originalResumeId, originalResume);

        const optimizedResult = await DatabaseService.getResume(targetOptimizedId);
        if (!optimizedResult.success || !optimizedResult.data?.resume_data) {
          throw new Error('未找到优化简历，无法采纳建议');
        }

        const optimizedRowData = optimizedResult.data.resume_data || {};
        const validTarget =
          optimizedRowData.optimizationStatus === 'optimized' &&
          isSameResumeId(optimizedRowData.optimizedFromId, originalResumeId);
        if (!validTarget) {
          throw new Error('检测到优化简历关联异常，已阻止覆盖原简历');
        }

        const baseResume = {
          id: optimizedResult.data.id,
          ...optimizedRowData,
          resumeTitle: optimizedResult.data.title
        } as ResumeData;

        const nextResumeData = applySuggestionToResume({
          base: baseResume,
          suggestion: suggestion as any,
          normalizeTargetSection,
          inferTargetSection,
          sanitizeSuggestedValue,
          toSkillList
        });
        const updatedSuggestions = suggestions.map(s =>
          s.id === suggestion.id ? { ...s, status: 'accepted' as const } : s
        );

        const baseTitle = allResumes?.find(r => isSameResumeId(r.id, originalResumeId))?.title || '简历';
        const newTitle = buildResumeTitle(baseTitle, nextResumeData, jdText, true, targetCompany);
        let updatedOptimized: ResumeData = {
          ...nextResumeData,
          interviewSessions: nextResumeData.interviewSessions || baseResume.interviewSessions || originalResume.interviewSessions,
          aiSuggestionFeedback: nextResumeData.aiSuggestionFeedback || baseResume.aiSuggestionFeedback || originalResume.aiSuggestionFeedback,
          optimizationStatus: 'optimized' as const,
          optimizedFromId: originalResumeId as any,
          lastJdText: jdText || baseResume.lastJdText || originalResume.lastJdText || '',
          targetCompany: targetCompany || baseResume.targetCompany || originalResume.targetCompany || ''
        };

        let snapshotForPersist: any = null;
        if (report && score > 0) {
          snapshotForPersist = {
            score,
            summary: report.summary || '',
            strengths: report.strengths || [],
            weaknesses: report.weaknesses || [],
            missingKeywords: report.missingKeywords || [],
            scoreBreakdown: report.scoreBreakdown || { experience: 0, skills: 0, format: 0 },
            suggestions: updatedSuggestions,
            updatedAt: new Date().toISOString(),
            jdText: jdText || updatedOptimized.lastJdText || '',
            targetCompany: targetCompany || updatedOptimized.targetCompany || ''
          };
          updatedOptimized = {
            ...updatedOptimized,
            analysisSnapshot: snapshotForPersist
          };
        }

        const updateResult = await DatabaseService.updateResume(String(targetOptimizedId), {
          resume_data: updatedOptimized,
          title: newTitle,
          updated_at: new Date().toISOString()
        });
        if (!updateResult.success) {
          throw new Error(updateResult.error?.message || '更新优化简历失败');
        }

        optimizedResumeIdRef.current = targetOptimizedId;
        setOptimizedResumeId(targetOptimizedId);
        setAnalysisResumeId(targetOptimizedId);
        setResumeData({
          ...updatedOptimized,
          id: targetOptimizedId as any,
          resumeTitle: newTitle
        });
        setSuggestions(updatedSuggestions);
        setChatMessages(prev => prev.map((msg: any) =>
          msg.suggestion?.id === suggestion.id
            ? { ...msg, suggestion: { ...msg.suggestion!, status: 'accepted' as const } }
            : msg
        ));

        if (snapshotForPersist) {
          saveLastAnalysis({
            resumeId: targetOptimizedId,
            jdText: snapshotForPersist.jdText || '',
            targetCompany: snapshotForPersist.targetCompany || '',
            snapshot: snapshotForPersist,
            updatedAt: snapshotForPersist.updatedAt || new Date().toISOString()
          });
        }

        if (loadUserResumes) {
          await loadUserResumes();
        }

        updateScore(5);
      } catch (error) {
        console.error('Error in handleAcceptSuggestionInChat:', error);
        showToast(`采纳失败：${(error as any)?.message || '请稍后重试'}`, 'error');
      } finally {
        const suggestionId = String((suggestion as any)?.id || '').trim();
        if (suggestionId) acceptingSuggestionIdsRef.current.delete(suggestionId);
      }
    }).catch((error) => {
      console.error('Error in accept suggestion queue:', error);
    });

    await acceptSuggestionQueueRef.current;
  };

  return { handleAcceptSuggestionInChat };
};
