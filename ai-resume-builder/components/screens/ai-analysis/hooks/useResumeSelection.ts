import { useEffect, useState } from 'react';
import { DatabaseService } from '../../../../src/database-service';
import { supabase } from '../../../../src/supabase-client';
import type { ResumeData, ResumeSummary } from '../../../../types';

export type ResumeReadState = {
  status: 'idle' | 'loading' | 'success' | 'error';
  message: string;
};

type Params = {
  allResumes: ResumeSummary[] | undefined;
  resumeData: ResumeData;
  setResumeData?: (v: ResumeData) => void;
  currentStep: string;
  setSelectedResumeId: (v: string | number | null) => void;
  sourceResumeIdRef: React.MutableRefObject<string | number | null>;
  setAnalysisResumeId: (v: string | number | null) => void;
  setJdText: (v: string) => void;
  setTargetCompany: (v: string) => void;
  navigateToStep: (v: any, replaceHistory?: boolean) => void;
  setOptimizedResumeId: (v: string | number | null) => void;
  applyAnalysisSnapshot: (snapshot: any) => boolean;
  saveLastAnalysis: (payload: {
    resumeId: string | number;
    jdText: string;
    targetCompany?: string;
    snapshot: any;
    updatedAt: string;
    analysisReportId?: string;
    optimizedResumeId?: string | number;
  }) => void;
  showToast: (msg: string, type?: 'info' | 'success' | 'error') => void;
  isSameResumeId: (a: any, b: any) => boolean;
  isInterviewMode?: boolean;
};

export const useResumeSelection = ({
  allResumes,
  resumeData,
  setResumeData,
  currentStep,
  setSelectedResumeId,
  sourceResumeIdRef,
  setAnalysisResumeId,
  setJdText,
  setTargetCompany,
  navigateToStep,
  setOptimizedResumeId,
  applyAnalysisSnapshot,
  saveLastAnalysis,
  showToast,
  isSameResumeId,
  isInterviewMode,
}: Params) => {
  const [resumeReadState, setResumeReadState] = useState<ResumeReadState>({
    status: 'idle',
    message: '尚未读取简历，请先选择简历',
  });

  const handleResumeSelect = async (id: string | number, preferReport: boolean = false) => {
    setSelectedResumeId(id);
    sourceResumeIdRef.current = id;
    setAnalysisResumeId(id);
    setJdText('');
    setTargetCompany('');
    const selectedTitle = (allResumes || []).find((item) => isSameResumeId(item.id, id))?.title || '当前简历';
    setResumeReadState({
      status: 'loading',
      message: `正在读取《${selectedTitle}》...`,
    });

    if (!preferReport || isInterviewMode) {
      navigateToStep('jd_input');
    }

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        setResumeReadState({ status: 'error', message: '读取失败：用户未登录或登录已过期' });
        showToast('请先登录', 'error');
        return;
      }

      let resume: any = null;
      const single = await DatabaseService.getResume(id);
      if (single.success && single.data) {
        resume = single.data;
      } else {
        const result = await DatabaseService.getUserResumes(user.id);
        if (!result.success) {
          setResumeReadState({
            status: 'error',
            message: `读取失败：${result.error?.message || '加载简历失败'}`,
          });
          showToast(`加载简历失败: ${result.error?.message || '请重试'}`, 'error');
          return;
        }
        resume = result.data.find((r: any) => String(r.id) === String(id));
      }

      if (!resume && resumeData?.id && String(resumeData.id) === String(id)) {
        resume = {
          id: resumeData.id,
          title: allResumes?.find((r) => String(r.id) === String(id))?.title || '简历',
          resume_data: resumeData,
        };
      }

      if (!resume) {
        setResumeReadState({ status: 'error', message: `读取失败：未找到该简历（ID: ${id}）` });
        showToast(`简历不存在 (ID: ${id})`, 'error');
        return;
      }

      if (!resume.resume_data) {
        setResumeReadState({ status: 'error', message: '读取失败：简历内容为空' });
        showToast('简历数据为空，请重新创建简历', 'error');
        return;
      }

      if (typeof resume.resume_data === 'object' && Object.keys(resume.resume_data).length === 0) {
        setResumeReadState({ status: 'error', message: '读取失败：简历内容为空对象' });
        showToast('简历数据为空，请重新创建简历', 'error');
        return;
      }

      if (setResumeData) {
        const finalResumeData = {
          id: resume.id,
          ...resume.resume_data,
          resumeTitle: resume.title,
        };
        sourceResumeIdRef.current = finalResumeData.optimizedFromId || finalResumeData.id;
        setResumeData(finalResumeData as any);
        setResumeReadState({
          status: 'success',
          message: `已成功读取《${resume.title || selectedTitle}》`,
        });
        setOptimizedResumeId(
          (finalResumeData as any).optimizedResumeId ||
          ((finalResumeData as any).optimizationStatus === 'optimized' ? resume.id : null)
        );
        const restoredJdText = ((finalResumeData as any).lastJdText || '').trim();
        if (restoredJdText) {
          setJdText(restoredJdText);
        }
        if ((finalResumeData as any).targetCompany) {
          setTargetCompany((finalResumeData as any).targetCompany);
        }

        if (preferReport || isInterviewMode) {
          applyAnalysisSnapshot((finalResumeData as any).analysisSnapshot);
          if ((finalResumeData as any).analysisSnapshot) {
            saveLastAnalysis({
              resumeId: resume.id,
              jdText: restoredJdText,
              targetCompany: (finalResumeData as any).targetCompany || '',
              snapshot: (finalResumeData as any).analysisSnapshot,
              updatedAt: (finalResumeData as any).analysisSnapshot.updatedAt || new Date().toISOString(),
            });
            setAnalysisResumeId(resume.id);
          }
        }

        if (preferReport && !isInterviewMode) {
          navigateToStep('report');
        }
      }
    } catch (error) {
      console.error('Error loading resume:', error);
      setResumeReadState({
        status: 'error',
        message: '读取失败：网络异常或服务不可用',
      });
      showToast('加载简历失败，请检查网络连接', 'error');
    }
  };

  useEffect(() => {
    if (currentStep !== 'jd_input') return;
    if (resumeReadState.status !== 'idle') return;
    if (!resumeData?.id) return;
    const fallbackLabel =
      (resumeData.resumeTitle || '').trim() ||
      ((resumeData.personalInfo?.name || '').trim() ? `${resumeData.personalInfo.name.trim()}的简历` : '当前简历');
    setResumeReadState({
      status: 'success',
      message: `已成功读取《${fallbackLabel}》`,
    });
  }, [currentStep, resumeData?.id, resumeData?.resumeTitle, resumeData?.personalInfo?.name, resumeReadState.status]);

  return {
    resumeReadState,
    setResumeReadState,
    handleResumeSelect,
  };
};
