import type { ResumeData } from '../types';
import { supabase } from './supabase-client';
import { DatabaseService } from './database-service';

export type ExportHistoryType = 'PDF' | 'IMAGE';

export const recordResumeExportHistory = async (
  resumeData: ResumeData | null | undefined,
  entry: {
    filename: string;
    size: number;
    type: ExportHistoryType;
    exportedAt?: string;
  }
) => {
  const resumeId = String((resumeData as any)?.id || '').trim();
  if (!resumeId) return false;

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return false;

    const latest = await DatabaseService.getResume(resumeId);
    if (!latest.success || !latest.data?.resume_data) return false;

    const currentHistory = latest.data.resume_data.exportHistory || [];
    const historyEntry = {
      filename: String(entry.filename || '').trim() || '导出文件',
      size: Math.max(0, Number(entry.size) || 0),
      type: entry.type,
      exportedAt: String(entry.exportedAt || '').trim() || new Date().toISOString(),
    };

    await DatabaseService.updateResume(resumeId, {
      resume_data: {
        ...latest.data.resume_data,
        exportHistory: [historyEntry, ...currentHistory].slice(0, 200),
      },
    }, { touchUpdatedAt: false });
    return true;
  } catch (err) {
    console.error('Failed to record export history:', err);
    return false;
  }
};
