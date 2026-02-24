import { useCallback, useState } from 'react';
import type { ResumeData } from '../../../../types';
import { buildApiUrl } from '../../../../src/api-config';
import { recordResumeExportHistory } from '../../../../src/export-history';

const sanitizeData = (data: any): any => {
  const fieldsToRemove = ['suggestions', 'metadata', 'status', 'optimizationStatus', 'interviewSessions', 'lastJdText', 'exportHistory', 'id'];
  if (Array.isArray(data)) return data.map((item) => sanitizeData(item));
  if (typeof data === 'object' && data !== null) {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(data)) {
      if (fieldsToRemove.includes(key)) continue;
      sanitized[key] = sanitizeData(value);
    }
    return sanitized;
  }
  return data;
};

const buildExportFilename = (title?: string) => {
  const rawTitle = (title || '').trim();
  const cleaned = rawTitle.replace(/[\\/:*?"<>|]+/g, '').trim();
  const base = cleaned || '简历';
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
};

type Params = {
  resumeData: ResumeData;
};

export const usePreviewPdfExport = ({ resumeData }: Params) => {
  const [isGenerating, setIsGenerating] = useState(false);

  const recordExportHistory = useCallback(async (filename: string, size: number) => {
    await recordResumeExportHistory(resumeData, {
      filename: filename || buildExportFilename(resumeData?.resumeTitle || resumeData?.personalInfo?.name),
      size,
      type: 'PDF',
    });
  }, [resumeData]);

  const handleExportPDF = useCallback(async () => {
    if (isGenerating || !resumeData) return;
    setIsGenerating(true);

    try {
      const sanitizedResumeData = sanitizeData(resumeData);
      const resumeTitle = resumeData?.resumeTitle || '';
      const payload: Record<string, unknown> = {
        resumeData: sanitizedResumeData,
        jdText: resumeData?.optimizationStatus === 'optimized' ? (resumeData?.lastJdText || '') : '',
        resumeTitle,
        filename: resumeTitle,
      };
      const response = await fetch(buildApiUrl('/api/export-pdf'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || errorData.message || 'PDF 生成失败');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;

      const contentDisposition = response.headers.get('content-disposition');
      let filename = buildExportFilename(resumeData?.resumeTitle);
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
        if (filenameMatch) filename = filenameMatch[1];
      } else {
        filename = buildExportFilename(resumeData?.resumeTitle || resumeData?.personalInfo?.name);
      }

      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      await recordExportHistory(filename, blob.size);
      console.log('✅ PDF 导出成功');
    } catch (error) {
      console.error('❌ PDF 导出失败:', error);
      alert(`PDF 导出失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsGenerating(false);
    }
  }, [isGenerating, recordExportHistory, resumeData]);

  return {
    isGenerating,
    handleExportPDF,
  };
};
