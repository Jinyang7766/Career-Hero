import React, { useEffect, useState } from 'react';
import { View, ScreenProps } from '../../types';
import { DatabaseService } from '../../src/database-service';
import { supabase } from '../../src/supabase-client';

type ExportItem = {
  id: string;
  resumeId: number;
  filename: string;
  size: number;
  type: string;
  exportedAt: string;
};

const History: React.FC<ScreenProps> = ({ setCurrentView, goBack, setResumeData }) => {
  const [items, setItems] = useState<ExportItem[]>([]);
  const [loading, setLoading] = useState(true);

  const formatSize = (bytes: number) => {
    if (!bytes) return '0 KB';
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(2)} MB`;
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  };

  const formatDateLabel = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const sameDay = (a: Date, b: Date) =>
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();

    if (sameDay(d, today)) return '今天';
    if (sameDay(d, yesterday)) return '昨天';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const loadHistory = async () => {
    try {
      setLoading(true);
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) return;

      const result = await DatabaseService.getUserResumes(user.id);
      if (!result.success) return;

      const exports: ExportItem[] = [];
      result.data.forEach((resume: any) => {
        const history = resume.resume_data?.exportHistory || [];
        history.forEach((h: any, index: number) => {
          exports.push({
            id: `${resume.id}-${h.exportedAt || index}`,
            resumeId: resume.id,
            filename: h.filename || resume.title || '简历.pdf',
            size: h.size || 0,
            type: h.type || 'PDF',
            exportedAt: h.exportedAt || resume.updated_at || resume.created_at
          });
        });
      });

      exports.sort((a, b) => (a.exportedAt > b.exportedAt ? -1 : 1));
      setItems(exports);
    } finally {
      setLoading(false);
    }
  };

  const handleReExport = async (resumeId: number) => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) return;

      const result = await DatabaseService.getUserResumes(user.id);
      if (!result.success) return;
      const resume = result.data.find((r: any) => r.id === resumeId);
      if (!resume?.resume_data) return;
      if (setResumeData) {
        setResumeData({ id: resume.id, ...resume.resume_data, resumeTitle: resume.title });
      }
      setCurrentView(View.PREVIEW);
    } catch (err) {
      console.error('Failed to open resume for export:', err);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const toggleSection = (label: string) => {
    setCollapsedSections(prev => ({
      ...prev,
      [label]: !prev[label]
    }));
  };

  const handleDeleteExport = async (item: ExportItem) => {
    if (!window.confirm('确定要删除这条导出记录吗？')) return;

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) return;

      const result = await DatabaseService.getResume(item.resumeId);
      if (!result.success || !result.data?.resume_data) return;

      const currentHistory = result.data.resume_data.exportHistory || [];
      // Use exportedAt as a unique identifier for the specific entry
      const updatedHistory = currentHistory.filter((h: any) => h.exportedAt !== item.exportedAt);

      const updateResult = await DatabaseService.updateResume(item.resumeId.toString(), {
        resume_data: {
          ...result.data.resume_data,
          exportHistory: updatedHistory
        }
      });

      if (updateResult.success) {
        loadHistory();
      }
    } catch (err) {
      console.error('Failed to delete export record:', err);
    }
  };

  const handleDeleteAllExports = async () => {
    if (!window.confirm('确定要清空所有导出记录吗？此操作无法撤销。')) return;

    try {
      setLoading(true);
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) return;

      const result = await DatabaseService.getUserResumes(user.id);
      if (!result.success) return;

      const updatePromises = result.data.map((resume: any) => {
        if (resume.resume_data?.exportHistory && resume.resume_data.exportHistory.length > 0) {
          return DatabaseService.updateResume(resume.id.toString(), {
            resume_data: {
              ...resume.resume_data,
              exportHistory: []
            }
          });
        }
        return Promise.resolve({ success: true });
      });

      await Promise.all(updatePromises);
      loadHistory();
    } catch (err) {
      console.error('Failed to clear export history:', err);
    } finally {
      setLoading(false);
    }
  };

  const grouped = items.reduce<Record<string, ExportItem[]>>((acc, item) => {
    const label = formatDateLabel(item.exportedAt);
    acc[label] = acc[label] || [];
    acc[label].push(item);
    return acc;
  }, {});

  return (
    <div className="flex flex-col min-h-screen bg-background-light dark:bg-background-dark pb-24 animate-in slide-in-from-right duration-300">
      <header className="sticky top-0 z-50 bg-background-light dark:bg-background-dark/95 backdrop-blur-md border-b border-gray-200 dark:border-white/5">
        <div className="flex items-center px-4 h-14 relative">
          <button
            onClick={goBack}
            className="flex items-center justify-center size-10 -ml-2 rounded-full hover:bg-gray-200 dark:hover:bg-white/10 transition-colors text-slate-900 dark:text-white z-10"
          >
            <span className="material-symbols-outlined text-2xl">arrow_back_ios_new</span>
          </button>
          <h1 className="absolute inset-0 flex items-center justify-center text-lg font-bold leading-tight tracking-tight text-slate-900 dark:text-white pointer-events-none">
            导出历史
          </h1>
          <button
            onClick={handleDeleteAllExports}
            disabled={items.length === 0}
            className="ml-auto text-base font-bold text-rose-500 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-300 disabled:opacity-30 z-10"
          >
            全部清空
          </button>
        </div>
      </header>

      {/* Search Bar Removed */}

      <main className="flex flex-col w-full mt-4">
        {loading && (
          <div className="flex flex-col items-center justify-center pt-20 px-4 text-center">
            <span className="material-symbols-outlined text-slate-300 dark:text-slate-600 text-6xl mb-4">history</span>
            <p className="text-slate-500 dark:text-slate-400 text-sm">正在加载导出历史...</p>
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center pt-20 px-4 text-center">
            <span className="material-symbols-outlined text-slate-300 dark:text-slate-600 text-6xl mb-4">history</span>
            <p className="text-slate-900 dark:text-white font-medium mb-1">暂无导出记录</p>
            <p className="text-slate-500 dark:text-slate-400 text-sm">导出简历后会显示在这里</p>
          </div>
        )}

        {!loading && items.length > 0 && Object.entries(grouped).map(([label, group]) => {
          const isCollapsed = !!collapsedSections[label];
          return (
            <div key={label} className="flex flex-col pt-2">
              <button
                onClick={() => toggleSection(label)}
                className="w-full flex items-center justify-between px-4 pt-2 text-lg font-bold text-slate-900 dark:text-white"
              >
                <span>{label}</span>
                <span className="material-symbols-outlined text-[20px] text-slate-500 dark:text-slate-400">
                  {isCollapsed ? 'expand_more' : 'expand_less'}
                </span>
              </button>

              {!isCollapsed && (
                <div className="animate-in fade-in slide-in-from-top-1 duration-200 mt-2">
                  {group.map((item) => (
                    <div key={item.id} className="group relative flex items-center gap-4 px-4 py-3 hover:bg-white dark:hover:bg-surface-dark/50 transition-colors cursor-pointer border-b border-gray-100 dark:border-white/5 last:border-0">
                      <div className="relative flex items-center justify-center shrink-0 size-12 rounded-xl bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400">
                        <span className="material-symbols-outlined">picture_as_pdf</span>
                      </div>
                      <div className="flex flex-col flex-1 min-w-0" onClick={() => handleReExport(item.resumeId)}>
                        <p className="text-slate-900 dark:text-white text-base font-medium truncate">{item.filename}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-slate-500 dark:text-text-secondary text-sm">
                            {formatTime(item.exportedAt)} • {formatSize(item.size)}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteExport(item);
                        }}
                        className="p-2 text-slate-300 hover:text-rose-500 dark:text-slate-600 dark:hover:text-rose-400 transition-colors"
                      >
                        <span className="material-symbols-outlined text-[22px]">delete</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </main>
    </div>
  );
};

export default History;
