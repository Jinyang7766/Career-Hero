import React from 'react';
import { View } from '../../../../types';
import { DatabaseService } from '../../../../src/database-service';
import {
  readPreviewBackTarget,
  readPreviewResumeId,
  readPreviewSnapshot,
  writePreviewResumeId,
  writePreviewSnapshot,
} from '../preview-storage';

type NavigateToView = (view: View, opts?: { replace?: boolean; root?: boolean }) => void;

type Params = {
  resumeData: any;
  setResumeData: (next: any) => void;
  navigateToView: NavigateToView;
  goBack: () => void;
};

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, timeoutCode: string) => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(timeoutCode)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export const hasMeaningfulResumeData = (data: any) => {
  if (!data || typeof data !== 'object') return false;
  const personal = data.personalInfo || {};
  const hasPersonalText = [
    personal.name,
    personal.title,
    personal.email,
    personal.phone,
    personal.location,
    personal.linkedin,
    personal.website,
    personal.summary,
    data.summary,
  ].some((v) => String(v || '').trim().length > 0);
  const hasListContent =
    (Array.isArray(data.workExps) && data.workExps.length > 0) ||
    (Array.isArray(data.educations) && data.educations.length > 0) ||
    (Array.isArray(data.projects) && data.projects.length > 0) ||
    (Array.isArray(data.skills) && data.skills.length > 0);
  return hasPersonalText || hasListContent;
};

export const usePreviewRestore = ({
  resumeData,
  setResumeData,
  navigateToView,
  goBack,
}: Params) => {
  const [isRestoringPreview, setIsRestoringPreview] = React.useState(false);
  const [restoreError, setRestoreError] = React.useState('');
  const restoreAttemptedRef = React.useRef(false);
  const previewResumeId = String((resumeData as any)?.id || '').trim();
  const hasResumeContent = hasMeaningfulResumeData(resumeData);

  React.useEffect(() => {
    if (!previewResumeId) return;
    writePreviewResumeId(previewResumeId);
  }, [previewResumeId]);

  React.useEffect(() => {
    if (hasResumeContent) setRestoreError('');
  }, [hasResumeContent]);

  React.useEffect(() => {
    if (!hasResumeContent) return;
    const snapshotId = previewResumeId || String((resumeData as any)?.id || '').trim();
    if (!snapshotId) return;
    writePreviewSnapshot({
      id: snapshotId,
      data: resumeData,
    });
  }, [hasResumeContent, previewResumeId, resumeData]);

  React.useEffect(() => {
    if (restoreAttemptedRef.current) return;
    if (hasResumeContent) return;

    const savedResumeId = readPreviewResumeId();
    const snapshot = readPreviewSnapshot();
    const targetResumeId = previewResumeId || savedResumeId || String(snapshot?.id || '').trim();
    if (!targetResumeId) return;

    if (snapshot && snapshot.id === targetResumeId && hasMeaningfulResumeData(snapshot.data)) {
      restoreAttemptedRef.current = true;
      setResumeData({
        id: targetResumeId,
        ...snapshot.data,
      });
      setRestoreError('');
      return;
    }

    restoreAttemptedRef.current = true;
    let cancelled = false;
    setIsRestoringPreview(true);

    (async () => {
      try {
        let result: Awaited<ReturnType<typeof DatabaseService.getResume>> | null = null;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          result = await withTimeout(
            DatabaseService.getResume(targetResumeId),
            10000,
            'preview_restore_resume_timeout'
          );
          if (result.success && result.data?.resume_data) break;
          if (attempt === 0) {
            await new Promise((resolve) => setTimeout(resolve, 350));
          }
        }

        if (cancelled || !result) return;

        if (!result.success || !result.data?.resume_data) {
          setRestoreError('预览恢复失败，请返回全部简历后重试');
          return;
        }

        const recovered = {
          id: result.data.id,
          ...result.data.resume_data,
          resumeTitle: result.data.title,
        };
        if (!cancelled) {
          setResumeData(recovered as any);
          writePreviewResumeId(String(result.data.id || targetResumeId));
          writePreviewSnapshot({
            id: String(result.data.id || targetResumeId),
            data: recovered,
          });
          setRestoreError('');
        }
      } catch (error: any) {
        if (!cancelled) {
          const code = String(error?.message || '').toLowerCase();
          const isTimeout = code.includes('timeout');
          setRestoreError(
            isTimeout
              ? '预览恢复超时，请返回全部简历后重试'
              : '预览恢复失败，请返回全部简历后重试'
          );
        }
      } finally {
        if (!cancelled) setIsRestoringPreview(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasResumeContent, previewResumeId, setResumeData]);

  const handlePreviewBack = React.useCallback(() => {
    const target = readPreviewBackTarget();
    const navType = (() => {
      try {
        const navEntry = (performance.getEntriesByType('navigation') || [])[0] as any;
        return String(navEntry?.type || '').toLowerCase();
      } catch {
        return '';
      }
    })();

    if (navType === 'reload' || restoreError) {
      if (target === 'editor') {
        navigateToView(View.EDITOR, { replace: true });
        return;
      }
      if (target === 'dashboard') {
        navigateToView(View.DASHBOARD, { replace: true });
        return;
      }
      navigateToView(View.ALL_RESUMES, { replace: true });
      return;
    }

    goBack();
  }, [goBack, navigateToView, restoreError]);

  return {
    hasResumeContent,
    isRestoringPreview,
    restoreError,
    handlePreviewBack,
  };
};
