import React, { useState } from 'react';
import { View, ScreenProps } from '../../types';
import { DatabaseService } from '../../src/database-service';
import { supabase } from '../../src/supabase-client';
import { confirmDialog } from '../../src/ui/dialogs';
import { useAppContext } from '../../src/app-context';
import { createEmptyResumeData, useAppStore } from '../../src/app-store';
import BackButton from '../shared/BackButton';

const AllResumes: React.FC<ScreenProps> = () => {
  const navigateToView = useAppContext((s) => s.navigateToView);
  const goBack = useAppContext((s) => s.goBack);
  const currentUser = useAppContext((s) => s.currentUser);
  const allResumes = useAppStore((state) => state.allResumes);
  const setAllResumes = useAppStore((state) => state.setAllResumes);
  const setResumeData = useAppStore((state) => state.setResumeData);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMenuId, setActiveMenuId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState<number | null>(null);
  const [isLoadingResume, setIsLoadingResume] = useState<number | null>(null);
  const [isRenamingId, setIsRenamingId] = useState<number | null>(null);
  const [renameInputValue, setRenameInputValue] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  const clearLocalAnalysisSnapshotForResume = (resumeId: number) => {
    const scopedSnapshotPrefix = 'ai_last_analysis_snapshot:';
    try {
      const raw = localStorage.getItem('ai_last_analysis_snapshot');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (String(parsed?.resumeId || '') === String(resumeId)) {
          localStorage.removeItem('ai_last_analysis_snapshot');
        }
      }
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(scopedSnapshotPrefix)) continue;
        const scopedRaw = localStorage.getItem(key);
        if (!scopedRaw) continue;
        const parsedScoped = JSON.parse(scopedRaw);
        if (String(parsedScoped?.resumeId || '') === String(resumeId)) {
          localStorage.removeItem(key);
        }
      }
    } catch {
      // ignore malformed local snapshot
    }
    const localResumeId = String(localStorage.getItem('ai_analysis_resume_id') || '');
    if (localResumeId && localResumeId === String(resumeId)) {
      localStorage.removeItem('ai_analysis_resume_id');
      localStorage.removeItem('ai_analysis_step');
      localStorage.removeItem('ai_analysis_in_progress');
      localStorage.removeItem('ai_analysis_has_activity');
      localStorage.removeItem('ai_chat_prev_step');
      localStorage.removeItem('ai_chat_entry_source');
    }

    const interviewResumeId = String(localStorage.getItem('ai_interview_resume_id') || '');
    if (interviewResumeId && interviewResumeId === String(resumeId)) {
      localStorage.removeItem('ai_interview_open');
      localStorage.removeItem('ai_interview_resume_id');
      localStorage.removeItem('ai_interview_entry_mode');
      localStorage.removeItem('ai_nav_owner_user_id');
    }

    const resultResumeId = String(localStorage.getItem('ai_result_resume_id') || '');
    if (resultResumeId && resultResumeId === String(resumeId)) {
      localStorage.removeItem('ai_result_open');
      localStorage.removeItem('ai_result_resume_id');
      localStorage.removeItem('ai_result_step');
      localStorage.removeItem('ai_report_open');
      localStorage.removeItem('ai_report_resume_id');
      localStorage.removeItem('ai_report_step');
      localStorage.removeItem('ai_report_resume_payload');
      localStorage.removeItem('ai_nav_owner_user_id');
    }

    const resumeIdText = String(resumeId);
    const escapedResumeId = resumeIdText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const newOrLegacyPlanKeyPattern = new RegExp(`^ai_interview_plan_(?:[^_]+_)?${escapedResumeId}_`);
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (newOrLegacyPlanKeyPattern.test(key)) {
        localStorage.removeItem(key);
      }
    }
  };

  const filteredResumes = (allResumes || []).filter(resume =>
    resume.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();

    // 显示确认对话框
    const confirmed = await confirmDialog('确定要删除这份简历吗？此操作不可恢复。');
    if (!confirmed) {
      return;
    }

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      alert('请先登录');
      return;
    }

    try {
      setIsDeleting(id);

      console.log('Deleting resume:', id);

      const result = await DatabaseService.deleteResume(String(id));

      if (result.success) {
        console.log('Resume deleted successfully');
        clearLocalAnalysisSnapshotForResume(id);
        setResumeData((prev: any) => (
          String(prev?.id || '') === String(id) ? createEmptyResumeData() : prev
        ));
        // 从本地状态中删除
        if (setAllResumes) {
          setAllResumes((prev: any) => prev.filter(r => r.id !== id));
        }
        console.log('简历删除成功');
      } else {
        console.error('删除失败:', result.error);
        alert(`删除失败: ${result.error?.message || '请重试'}`);
        return false;
      }
      return true;
    } catch (error) {
      console.error('删除简历时出错:', error);
      alert('删除失败，请检查网络连接');
      return false;
    } finally {
      setIsDeleting(null);
      setActiveMenuId(null);
    }
  };

  const handleDeleteSelected = async () => {
    if (!(await confirmDialog(`确定要删除选中的 ${selectedIds.size} 份简历吗？此操作不可恢复。`))) return;

    try {
      const selectedItems = Array.from(selectedIds);
      let successCount = 0;

      // Sequential deletion to report individual failures if needed, or Parallel.
      // Parallel is better for UX.
      await Promise.all(selectedItems.map(id => DatabaseService.deleteResume(String(id))));
      selectedItems.forEach((id) => clearLocalAnalysisSnapshotForResume(id));
      setResumeData((prev: any) => (
        selectedItems.some((id) => String(id) === String(prev?.id || ''))
          ? createEmptyResumeData()
          : prev
      ));

      // Optimistic update or refresh
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const result = await DatabaseService.getUserResumes(user.id);
        if (result.success && setAllResumes) {
          setAllResumes(result.data as any);
        }
      }

      setSelectedIds(new Set());
      setIsSelectionMode(false);
    } catch (error) {
      console.error('批量删除时出错:', error);
      alert('批量删除部分可能失败，请刷新查看');
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredResumes.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredResumes.map(r => r.id)));
    }
  };

  const toggleSelection = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };


  const handleEdit = async (resumeId: number, e: React.MouseEvent) => {
    e.stopPropagation();

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      alert('请先登录');
      return;
    }

    try {
      setIsLoadingResume(resumeId);

      console.log('=== 简历加载调试信息 ===');
      console.log('Loading resume:', resumeId);
      console.log('Current user:', user.id);

      // Get all user resumes and find the specific one
      const result = await DatabaseService.getUserResumes(user.id);

      console.log('Database result:', result);

      if (result.success) {
        console.log('All resumes found:', result.data);
        console.log('Total resumes count:', result.data.length);

        const resume = result.data.find(r => r.id === resumeId);

        console.log('Target resume found:', resume);
        console.log('Resume ID match check:', {
          lookingFor: resumeId,
          foundIds: result.data.map(r => r.id),
          matches: result.data.filter(r => r.id === resumeId)
        });

        if (resume) {
          console.log('Resume data structure:', {
            id: resume.id,
            title: resume.title,
            resumeDataKeys: resume.resume_data ? Object.keys(resume.resume_data) : 'null',
            resumeDataSize: resume.resume_data ? JSON.stringify(resume.resume_data).length : 0
          });

          // 检查resume_data是否为空
          if (!resume.resume_data) {
            console.error('❌ 简历数据为空: resume_data is null/undefined');
            alert('简历数据为空，请重新创建简历');
            return;
          }

          // 检查resume_data是否为空对象
          if (typeof resume.resume_data === 'object' && Object.keys(resume.resume_data).length === 0) {
            console.error('❌ 简历数据为空对象: resume_data is empty object');
            alert('简历数据为空，请重新创建简历');
            return;
          }

          console.log('✅ Resume loaded successfully:', resume);

          // Set the resume data with ID for editing
          if (setResumeData) {
            // Define default structure to ensure all fields exist
            const defaultData = {
              personalInfo: { name: '', title: '', email: '', phone: '', age: '' },
              workExps: [],
              educations: [],
              projects: [],
              skills: [],
              gender: '',
            };

            const finalResumeData = {
              ...defaultData,
              ...resume.resume_data,
              id: resume.id,
              resumeTitle: resume.title,
              personalInfo: {
                ...defaultData.personalInfo,
                ...(resume.resume_data?.personalInfo || {})
              }
            };

            console.log('Setting resume data:', {
              id: finalResumeData.id,
              hasPersonalInfo: !!finalResumeData.personalInfo,
              hasWorkExps: Array.isArray(finalResumeData.workExps) && finalResumeData.workExps.length > 0,
              hasEducations: Array.isArray(finalResumeData.educations) && finalResumeData.educations.length > 0,
              hasSkills: Array.isArray(finalResumeData.skills) && finalResumeData.skills.length > 0,
              dataKeys: Object.keys(finalResumeData)
            });

            setResumeData(finalResumeData);
          }

          navigateToView(View.EDITOR);
        } else {
          console.error('❌ Resume not found');
          console.error('Available resume IDs:', result.data.map(r => r.id));
          alert(`简历不存在 (ID: ${resumeId})`);
        }
      } else {
        console.error('❌ 加载简历失败:', result.error);
        alert(`加载简历失败: ${result.error?.message || '请重试'}`);
      }
    } catch (error) {
      console.error('❌ 加载简历时出错:', error);
      alert('加载简历失败，请检查网络连接');
    } finally {
      setIsLoadingResume(null);
      setActiveMenuId(null);
    }
  };

  const handlePreview = async (resumeId?: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    // 如果没有提供resumeId，使用当前选中的简历
    if (!resumeId) {
      console.error('❌ 预览失败：未提供简历ID');
      alert('预览失败，请通过菜单选择预览');
      return;
    }

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      alert('请先登录');
      return;
    }

    try {
      setIsLoadingResume(resumeId);
      console.log('=== 简历预览调试信息 ===');
      console.log('Previewing resume:', resumeId);
      console.log('Current user:', user.id);

      // Get single resume details
      const result = await DatabaseService.getResume(resumeId);

      console.log('Database result:', result);

      if (result.success && result.data) {
        const resume = result.data;
        console.log('Target resume found:', resume);

        console.log('Resume data structure:', {
          id: resume.id,
          title: resume.title,
          resumeDataKeys: resume.resume_data ? Object.keys(resume.resume_data) : 'null',
          resumeDataSize: resume.resume_data ? JSON.stringify(resume.resume_data).length : 0
        });

        // Check if resume_data is empty
        if (!resume.resume_data) {
          console.error('❌ 简历数据为空: resume_data is null/undefined');
          alert('简历数据为空，请重新创建简历');
          return;
        }

        // Check if resume_data is empty object
        if (typeof resume.resume_data === 'object' && Object.keys(resume.resume_data).length === 0) {
          console.error('❌ 简历数据为空对象: resume_data is empty object');
          alert('简历数据为空，请重新创建简历');
          return;
        }

        console.log('✅ Resume loaded for preview:', resume);

        // Set the resume data with ID for preview
        if (setResumeData) {
          const finalResumeData = {
            id: resume.id,
            ...resume.resume_data,
            resumeTitle: resume.title
          };

          console.log('Setting resume data for preview:', {
            id: finalResumeData.id,
            hasPersonalInfo: !!finalResumeData.personalInfo,
            hasWorkExps: Array.isArray(finalResumeData.workExps) && finalResumeData.workExps.length > 0,
            hasEducations: Array.isArray(finalResumeData.educations) && finalResumeData.educations.length > 0,
            hasSkills: Array.isArray(finalResumeData.skills) && finalResumeData.skills.length > 0,
            dataKeys: Object.keys(finalResumeData)
          });

          setResumeData(finalResumeData);
        }

        navigateToView(View.PREVIEW);
      } else {
        console.error('❌ Resume not found for preview');
        alert(`简历不存在 (ID: ${resumeId})`);
      }
    } catch (error) {
      console.error('Preview error:', error);
      alert('预览失败，请重试');
    } finally {
      setIsLoadingResume(null);
      setActiveMenuId(null);
    }
  };


  const handleRenameClick = (id: number, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setIsRenamingId(id);
    setRenameInputValue(currentTitle);
    setActiveMenuId(null);
  };

  const handleRenameConfirm = async () => {
    if (!isRenamingId) return;
    if (!renameInputValue.trim()) {
      alert('简历名称不能为空');
      return;
    }

    try {
      setIsUpdating(true);
      const result = await DatabaseService.updateResume(String(isRenamingId), {
        title: renameInputValue.trim()
      });

      if (result.success) {
        if (setAllResumes) {
          setAllResumes((prev: any) => prev.map((r: any) =>
            r.id === isRenamingId ? { ...r, title: renameInputValue.trim() } : r
          ));
        }
        setIsRenamingId(null);
        setRenameInputValue('');
      } else {
        alert(`重命名失败: ${result.error?.message || '请重试'}`);
      }
    } catch (error) {
      console.error('Update resume error:', error);
      alert('重命名失败，请检查网络连接');
    } finally {
      setIsUpdating(false);
    }
  };

  const toggleMenu = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveMenuId(activeMenuId === id ? null : id);
  };

  // Close menu when clicking outside
  const handleContainerClick = () => {
    if (activeMenuId !== null) setActiveMenuId(null);
  };

  const renderResumeList = (resumes: typeof filteredResumes) => (
    <div className="px-4 mt-1">
      <div className="bg-white dark:bg-surface-dark rounded-2xl shadow-md border border-slate-200 dark:border-white/5 divide-y divide-slate-100 dark:divide-white/5">
        {resumes.map((resume, index) => {
          const isSelected = selectedIds.has(resume.id);
          return (
            <div
              key={resume.id}
              onClick={(e) => {
                if (isSelectionMode) {
                  e.stopPropagation();
                  toggleSelection(resume.id);
                } else {
                  handlePreview(resume.id, e);
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!isSelectionMode) {
                  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(50);
                  setIsSelectionMode(true);
                  toggleSelection(resume.id);
                }
              }}
              className={`group relative flex items-center gap-4 px-4 py-3.5 transition-colors cursor-pointer select-none ${index === 0 ? 'rounded-t-2xl' : ''} ${index === resumes.length - 1 ? 'rounded-b-2xl' : ''} ${isLoadingResume === resume.id ? 'opacity-50 pointer-events-none' : ''} ${isSelected ? 'bg-primary/5 dark:bg-primary/10' : 'hover:bg-slate-50 dark:hover:bg-white/5'}`}
            >
              {isSelectionMode && (
                <div className={`shrink-0 flex items-center justify-center size-10 rounded-full transition-colors ${isSelected ? 'text-primary' : 'text-slate-300 dark:text-slate-600'}`}>
                  <span className="material-symbols-outlined text-[24px]">
                    {isSelected ? 'check_circle' : 'radio_button_unchecked'}
                  </span>
                </div>
              )}

              <div className="shrink-0 relative">
                <div className="bg-white dark:bg-slate-700 aspect-[210/297] w-10 h-[56px] rounded-lg shadow-sm border border-slate-200 dark:border-slate-600 overflow-hidden relative">
                  {resume.thumbnail}
                </div>
                {isLoadingResume === resume.id && (
                  <div className="absolute inset-0 bg-white/50 dark:bg-black/50 flex items-center justify-center z-10 rounded-lg">
                    <span className="size-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin"></span>
                  </div>
                )}
                {resume.hasDot && !isSelectionMode && (
                  <div className="absolute -top-1 -right-1 size-2.5 bg-primary rounded-full border-2 border-background-light dark:border-background-dark"></div>
                )}
              </div>
              <div className="flex flex-col flex-1 justify-center min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <p className={`text-sm font-bold truncate leading-tight ${isSelected ? 'text-primary' : 'text-slate-900 dark:text-white'}`}>{resume.title}</p>
                </div>
                <p className="text-slate-500 dark:text-slate-500 text-[12px] font-medium leading-normal line-clamp-1 mt-1">
                  上次修改: {new Date(resume.date).toLocaleString('zh-CN', { hour12: false })}
                </p>
              </div>

              {!isSelectionMode && (
                <div className="relative">
                  <button
                    onClick={(e) => toggleMenu(resume.id, e)}
                    className="shrink-0 size-9 flex items-center justify-center rounded-full text-slate-300 hover:text-slate-600 dark:text-slate-600 dark:hover:text-white transition-colors"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>more_vert</span>
                  </button>

                  {/* Popover Menu */}
                  {activeMenuId === resume.id && (
                    <div className="absolute right-0 top-10 w-32 bg-white dark:bg-surface-dark rounded-xl shadow-xl border border-slate-100 dark:border-white/5 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                      <button
                        onClick={(e) => handleEdit(resume.id, e)}
                        disabled={isLoadingResume !== null}
                        className="w-full text-left px-4 py-3 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isLoadingResume === resume.id ? (
                          <>
                            <span className="size-4 border-2 border-slate-600/30 border-t-slate-600 rounded-full animate-spin"></span>
                            加载中...
                          </>
                        ) : (
                          <>
                            <span className="material-symbols-outlined text-[18px]">edit</span>
                            编辑
                          </>
                        )}
                      </button>
                      <button
                        onClick={(e) => handleRenameClick(resume.id, resume.title, e)}
                        className="w-full text-left px-4 py-3 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 flex items-center gap-2"
                      >
                        <span className="material-symbols-outlined text-[18px]">drive_file_rename_outline</span>
                        重命名
                      </button>
                      <div className="h-px bg-slate-100 dark:bg-white/5"></div>
                      <button
                        onClick={(e) => handleDelete(resume.id, e)}
                        disabled={isDeleting === resume.id}
                        className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isDeleting === resume.id ? (
                          <>
                            <span className="size-4 border-2 border-red-600/30 border-t-red-600 rounded-full animate-spin"></span>
                            删除中...
                          </>
                        ) : (
                          <>
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                            删除
                          </>
                        )}
                      </button>
                    </div>
                  )}
                  {activeMenuId === resume.id && (
                    <div
                      className="fixed inset-0 z-[45]"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuId(null);
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div
      onClick={handleContainerClick}
      className="relative flex h-screen w-full flex-col mx-auto max-w-md bg-background-light dark:bg-background-dark shadow-2xl overflow-hidden animate-in slide-in-from-right duration-300"
    >
      <header className="fixed top-0 left-0 right-0 z-40 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md border-b border-slate-200/50 dark:border-white/5 mx-auto w-full max-w-md">
        <div className="flex items-center justify-between h-14 px-4 relative">
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
            {isSelectionMode ? `已选择 ${selectedIds.size} 项` : '全部简历'}
          </h2>

          <div className="flex w-auto gap-2 justify-end z-10 h-full items-center">
            {isSelectionMode ? (
              <>
                <button
                  onClick={handleSelectAll}
                  className={`flex size-10 items-center justify-center rounded-full hover:bg-primary/10 transition-colors ${selectedIds.size === filteredResumes.length && filteredResumes.length > 0 ? 'text-primary' : 'text-slate-400 dark:text-slate-500'
                    }`}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>
                    {selectedIds.size === filteredResumes.length && filteredResumes.length > 0 ? 'check_circle' : 'radio_button_unchecked'}
                  </span>
                </button>
                <button
                  onClick={handleDeleteSelected}
                  className="flex size-10 items-center justify-center rounded-full text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>delete</span>
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  setResumeData(createEmptyResumeData());
                  navigateToView(View.TEMPLATES);
                }}
                className="flex size-10 items-center justify-center rounded-full text-primary hover:bg-primary/10 transition-colors"
              >
                <span className="material-symbols-outlined" style={{ fontSize: '28px' }}>add</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="px-4 py-3 pt-[calc(3.5rem+0.75rem)] bg-background-light dark:bg-background-dark shrink-0">
        <div className="relative group">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400 group-focus-within:text-primary transition-colors" style={{ fontSize: '20px' }}>search</span>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white dark:bg-white/5 text-sm text-slate-900 dark:text-white rounded-xl py-2.5 pl-10 pr-4 outline-none border border-slate-200 dark:border-transparent focus:border-primary focus:ring-4 focus:ring-primary/10 placeholder-slate-400 dark:placeholder-slate-400 transition-all shadow-sm"
            placeholder="搜索简历名称..."
            type="text"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>close</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
        <div className="flex flex-col gap-2">
          {allResumes && allResumes.length === 0 ? (
            <div className="flex flex-col items-center justify-center pt-20 px-4 text-center">
              <span className="material-symbols-outlined text-slate-300 dark:text-slate-600 text-6xl mb-4">description</span>
              <p className="text-slate-900 dark:text-white font-medium mb-1">简历库中还没有简历</p>
              <p className="text-slate-500 dark:text-slate-400 text-sm">点击右上角“+”新建一份简历吧</p>
            </div>
          ) : filteredResumes.length === 0 && (
            <div className="flex flex-col items-center justify-center pt-20 px-4 text-center">
              <span className="material-symbols-outlined text-slate-300 dark:text-slate-600 text-6xl mb-4">search_off</span>
              <p className="text-slate-900 dark:text-white font-medium mb-1">未找到相关简历</p>
              <p className="text-slate-500 dark:text-slate-400 text-sm">尝试搜索其他关键词</p>
            </div>
          )}

          {filteredResumes.length > 0 && renderResumeList(filteredResumes)}
        </div>

        {filteredResumes.length > 0 && (
          <div className="h-12 flex items-center justify-center mt-4">
            <p className="text-xs text-slate-400 dark:text-slate-600">
              {filteredResumes.length === (allResumes?.length || 0) ? '已加载全部内容' : `显示 ${filteredResumes.length} 条结果`}
            </p>
          </div>
        )}
      </div>

      {/* Rename Modal */}
      {isRenamingId !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setIsRenamingId(null)}>
          <div className="w-full max-w-sm bg-white dark:bg-[#1c2936] rounded-[28px] shadow-[0_20px_50px_rgba(0,0,0,0.3)] overflow-hidden border border-slate-100 dark:border-white/5 animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
            <div className="p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-primary text-[20px]">drive_file_rename_outline</span>
                </div>
                <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">重命名简历</h3>
              </div>

              <div className="relative mb-8">
                <input
                  autoFocus
                  type="text"
                  value={renameInputValue}
                  onChange={(e) => setRenameInputValue(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800/50 text-[15px] font-bold text-slate-900 dark:text-white rounded-2xl px-5 py-4 outline-none border-2 border-slate-100 dark:border-white/5 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all placeholder:text-slate-400"
                  placeholder="输入新的简历名称"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRenameConfirm();
                    if (e.key === 'Escape') setIsRenamingId(null);
                  }}
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setIsRenamingId(null)}
                  className="flex-1 h-12 rounded-2xl text-sm font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-all active:scale-95"
                >
                  取消
                </button>
                <button
                  onClick={handleRenameConfirm}
                  disabled={isUpdating || !renameInputValue.trim()}
                  className="flex-1 h-12 rounded-2xl bg-primary text-white text-sm font-bold hover:bg-blue-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-primary/25 active:scale-95"
                >
                  {isUpdating ? (
                    <>
                      <span className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                      保存中
                    </>
                  ) : '保存'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AllResumes;
