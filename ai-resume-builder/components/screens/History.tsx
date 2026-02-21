import React, { useEffect, useState } from 'react';
import { ScreenProps } from '../../types';
import { DatabaseService } from '../../src/database-service';
import { supabase } from '../../src/supabase-client';
import { confirmDialog } from '../../src/ui/dialogs';
import { useAppContext } from '../../src/app-context';
import BackButton from '../shared/BackButton';

type ExportItem = {
  id: string;
  resumeId: number;
  filename: string;
  size: number;
  type: string;
  exportedAt: string;
};

const History: React.FC<ScreenProps> = () => {
  const goBack = useAppContext((s) => s.goBack);
  const [items, setItems] = useState<ExportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);

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

      const result = await DatabaseService.getUserResumesExportHistory(user.id);
      if (!result.success) return;

      const exports: ExportItem[] = [];
      result.data.forEach((resume: any) => {
        const history = resume.exportHistory || resume.resume_data?.exportHistory || [];
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
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) return;

      const result = await DatabaseService.getResume(item.resumeId);
      if (!result.success || !result.data?.resume_data) return;

      const currentHistory = result.data.resume_data.exportHistory || [];
      const updatedHistory = currentHistory.filter((h: any) => h.exportedAt !== item.exportedAt);

      await DatabaseService.updateResume(item.resumeId.toString(), {
        resume_data: {
          ...result.data.resume_data,
          exportHistory: updatedHistory
        }
      }, { touchUpdatedAt: false });
      return true;
    } catch (err) {
      console.error('Failed to delete export record:', err);
      return false;
    }
  };

  const handleDeleteSelected = async () => {
    if (!(await confirmDialog(`确定要删除选中的 ${selectedIds.size} 条记录吗？`))) return;

    try {
      setLoading(true);
      // Group selected items by resumeId to minimize DB calls
      const selectedItems = items.filter(i => selectedIds.has(i.id));

      let successCount = 0;
      // We can reuse handleDeleteExport but it fetches resume every time. 
      // For efficiency, we should probably group. But given low volume, simple loop is fine or we can optimize if needed.
      // Let's stick to parallel calls for now or sequential to avoid race conditions on same resume.

      for (const item of selectedItems) {
        await handleDeleteExport(item);
        successCount++;
      }

      await loadHistory();
      setSelectedIds(new Set());
      setIsSelectionMode(false);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map(i => i.id)));
    }
  };

  const toggleSelection = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };


  const handleDeleteAllExports = async () => {
    if (!(await confirmDialog('确定要清空所有导出记录吗？此操作无法撤销。'))) return;

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
          }, { touchUpdatedAt: false });
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
    <div className="flex flex-col min-h-screen bg-background-light dark:bg-background-dark pb-24 pt-14 animate-in slide-in-from-right duration-300">
      <header className="fixed top-0 left-0 right-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-white/5 mx-auto w-full max-w-md">
        <div className="flex items-center px-4 h-14 relative justify-between">
          {isSelectionMode ? (
            <button
              onClick={() => {
                setSelectedIds(new Set());
                setIsSelectionMode(false);
              }}
              className="flex size-10 items-center justify-center rounded-full text-slate-900 dark:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors z-10"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>close</span>
            </button>
          ) : (
            <BackButton onClick={goBack} className="z-10" />
          )}

          <h2 className="absolute inset-0 flex items-center justify-center text-lg font-bold leading-tight tracking-[-0.015em] text-slate-900 dark:text-white pointer-events-none">
            {isSelectionMode ? `已选择 ${selectedIds.size} 项` : '导出历史'}
          </h2>

          <div className="flex items-center gap-2 z-10">
            {isSelectionMode && (
              <>
                <button
                  onClick={handleSelectAll}
                  className={`flex size-10 items-center justify-center rounded-full hover:bg-primary/10 transition-colors ${selectedIds.size === items.length ? 'text-primary' : 'text-slate-400 dark:text-slate-500'}`}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>
                    {selectedIds.size === items.length && items.length > 0 ? 'check_circle' : 'radio_button_unchecked'}
                  </span>
                </button>
                <button
                  onClick={handleDeleteSelected}
                  className="flex size-10 items-center justify-center rounded-full text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>delete</span>
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex flex-col w-full mt-4">
        {loading && (
          <div className="flex flex-col items-center justify-center pt-20 px-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/5 dark:bg-primary/10 flex items-center justify-center text-primary mb-4 animate-pulse">
              <span className="material-symbols-outlined text-4xl">history</span>
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">正在加载导出历史...</p>
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center pt-20 px-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-400 dark:text-slate-500 mb-4">
              <span className="material-symbols-outlined text-4xl">history</span>
            </div>
            <p className="text-slate-900 dark:text-white font-black text-lg mb-1">暂无导出记录</p>
            <p className="text-slate-500 dark:text-slate-400 text-sm">导出简历后会显示在这里</p>
          </div>
        )}

        {!loading && items.length > 0 && Object.entries(grouped).map(([label, group]) => {
          const isCollapsed = !!collapsedSections[label];
          return (
            <div key={label} className="flex flex-col pt-2 mb-4">
              <button
                onClick={() => toggleSection(label)}
                className="w-full flex items-center justify-between px-4 py-2 group"
              >
                <h3 className="ml-4 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">{label}</h3>
                <span className="material-symbols-outlined text-[20px] text-slate-400 dark:text-slate-600 transition-transform duration-300 mr-4" style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'none' }}>
                  expand_more
                </span>
              </button>

              {!isCollapsed && (
                <div className="px-4 mt-1">
                  <div className="bg-white dark:bg-surface-dark rounded-2xl overflow-hidden shadow-md border border-slate-200 dark:border-white/5 divide-y divide-slate-100 dark:divide-white/5">
                    {group.map((item) => (
                      <div
                        key={item.id}
                        className={`relative flex items-center gap-4 px-4 py-3.5 transition-colors select-none
                          ${selectedIds.has(item.id) ? 'bg-primary/5 dark:bg-primary/10' : 'hover:bg-slate-50 dark:hover:bg-white/5'}
                          ${isSelectionMode ? 'cursor-pointer' : 'cursor-default'}
                        `}
                        onClick={() => {
                          if (isSelectionMode) {
                            toggleSelection(item.id);
                          }
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          if (!isSelectionMode) {
                            if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(50);
                            setIsSelectionMode(true);
                            toggleSelection(item.id);
                          }
                        }}
                      >
                        {isSelectionMode ? (
                          <div className={`shrink-0 flex items-center justify-center size-10 rounded-full transition-colors ${selectedIds.has(item.id) ? 'text-primary' : 'text-slate-300 dark:text-slate-600'}`}>
                            <span className="material-symbols-outlined text-[24px]">
                              {selectedIds.has(item.id) ? 'check_circle' : 'radio_button_unchecked'}
                            </span>
                          </div>
                        ) : (
                          (() => {
                            const isImage = item.type === 'IMAGE' || /\.(png|jpg|jpeg|webp)$/i.test(item.filename);
                            if (isImage) {
                              return (
                                <div className="shrink-0 w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center text-blue-500">
                                  <span className="material-symbols-outlined text-[20px]">image</span>
                                </div>
                              );
                            }
                            return (
                              <div className="shrink-0 w-10 h-10 rounded-xl bg-red-50 dark:bg-red-500/10 flex items-center justify-center text-red-500">
                                <span className="material-symbols-outlined text-[20px]">picture_as_pdf</span>
                              </div>
                            );
                          })()
                        )}

                        <div className="flex flex-col flex-1 min-w-0">
                          <p className={`text-sm font-bold truncate leading-tight ${selectedIds.has(item.id) ? 'text-primary' : 'text-slate-900 dark:text-white'}`}>{item.filename}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-slate-500 dark:text-slate-500 text-[12px] font-medium leading-normal mt-0.5">
                              {new Date(item.exportedAt).toLocaleString('zh-CN', { hour12: false })} · {(item.size / 1024 / 1024).toFixed(2)} MB
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
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
