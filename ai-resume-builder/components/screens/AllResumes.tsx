import React, { useState } from 'react';
import { View, ScreenProps } from '../../types';
import { DatabaseService } from '../../src/database-service';
import { supabase } from '../../src/supabase-client';

const AllResumes: React.FC<ScreenProps> = ({ setCurrentView, goBack, allResumes, setAllResumes, currentUser, setResumeData }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMenuId, setActiveMenuId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState<number | null>(null);
  const [isLoadingResume, setIsLoadingResume] = useState<number | null>(null);
  const [isOptimizedOpen, setIsOptimizedOpen] = useState(true);
  const [isUnoptimizedOpen, setIsUnoptimizedOpen] = useState(true);
  const [isRenamingId, setIsRenamingId] = useState<number | null>(null);
  const [renameInputValue, setRenameInputValue] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  const filteredResumes = (allResumes || []).filter(resume =>
    resume.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();

    // 显示确认对话框
    const confirmed = window.confirm('确定要删除这份简历吗？此操作不可恢复。');
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
        // 从本地状态中删除
        if (setAllResumes) {
          setAllResumes((prev: any) => prev.filter(r => r.id !== id));
        }
        console.log('简历删除成功');
      } else {
        console.error('删除失败:', result.error);
        alert(`删除失败: ${result.error?.message || '请重试'}`);
      }
    } catch (error) {
      console.error('删除简历时出错:', error);
      alert('删除失败，请检查网络连接');
    } finally {
      setIsDeleting(null);
      setActiveMenuId(null);
    }
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
            const finalResumeData = {
              id: resume.id,
              ...resume.resume_data
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

          setCurrentView(View.EDITOR);
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
            ...resume.resume_data
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

        setCurrentView(View.PREVIEW);
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
    <div className="flex flex-col">
      {resumes.map((resume) => (
        <div
          key={resume.id}
          onClick={() => handlePreview(resume.id)}
          className={`group relative flex items-center gap-4 px-4 py-4 hover:bg-black/5 dark:hover:bg-[#1c2936] transition-colors cursor-pointer border-b border-slate-200/50 dark:border-white/5 ${isLoadingResume === resume.id ? 'opacity-50 pointer-events-none' : ''}`}
        >
          <div className="shrink-0 relative">
            <div className="bg-white dark:bg-slate-700 aspect-[210/297] w-14 rounded-lg shadow-sm border border-slate-200 dark:border-slate-600 overflow-hidden relative">
              {resume.thumbnail}
            </div>
            {isLoadingResume === resume.id && (
              <div className="absolute inset-0 bg-white/50 dark:bg-black/50 flex items-center justify-center z-10 rounded-lg">
                <span className="size-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin"></span>
              </div>
            )}
            {resume.hasDot && (
              <div className="absolute -top-1 -right-1 size-2.5 bg-primary rounded-full border-2 border-background-light dark:border-background-dark"></div>
            )}
            {typeof resume.score === 'number' && resume.score > 0 && (
              <div className="absolute -top-1.5 -left-1 bg-primary text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-background-light dark:border-background-dark shadow-sm">
                {resume.score}
              </div>
            )}
          </div>
          <div className="flex flex-col flex-1 justify-center min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <p className="text-slate-900 dark:text-white text-base font-medium leading-normal line-clamp-1">{resume.title}</p>
            </div>
            <p className="text-slate-500 dark:text-text-secondary text-sm font-normal leading-normal line-clamp-1 mt-0.5">上次修改: {new Date(resume.date).toLocaleString('zh-CN', { hour12: false })}</p>
          </div>

          <div className="relative">
            <button
              onClick={(e) => toggleMenu(resume.id, e)}
              className="shrink-0 size-10 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>more_vert</span>
            </button>

            {/* Popover Menu */}
            {activeMenuId === resume.id && (
              <div className="absolute right-0 top-10 w-32 bg-white dark:bg-[#1c2936] rounded-xl shadow-xl border border-slate-100 dark:border-white/5 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
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
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div
      onClick={handleContainerClick}
      className="relative flex h-screen w-full flex-col mx-auto max-w-md bg-background-light dark:bg-background-dark shadow-2xl overflow-hidden animate-in slide-in-from-right duration-300"
    >
      <div className="h-10 w-full bg-background-light dark:bg-background-dark shrink-0"></div>
      <div className="flex items-center px-4 pb-2 pt-1 justify-between bg-background-light dark:bg-background-dark shrink-0 z-10">
        <button
          onClick={goBack}
          className="flex size-10 items-center justify-center rounded-full text-slate-900 dark:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>arrow_back</span>
        </button>
        <h2 className="text-lg font-bold leading-tight tracking-[-0.015em] flex-1 text-center text-slate-900 dark:text-white">全部简历</h2>
        <div className="flex w-10 justify-end">
          <button
            onClick={() => setCurrentView(View.TEMPLATES)}
            className="flex size-10 items-center justify-center rounded-full text-primary hover:bg-primary/10 transition-colors"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '28px' }}>add</span>
          </button>
        </div>
      </div>

      <div className="px-4 py-3 bg-background-light dark:bg-background-dark shrink-0">
        <div className="relative group">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400 group-focus-within:text-primary transition-colors" style={{ fontSize: '20px' }}>search</span>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-200 dark:bg-[#1c2936] text-sm text-slate-900 dark:text-white rounded-xl py-2.5 pl-10 pr-4 outline-none border-none focus:ring-2 focus:ring-primary/50 placeholder-slate-500 dark:placeholder-slate-400 transition-all"
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

      <div className="flex-1 overflow-y-auto no-scrollbar pb-6">
        <div className="flex flex-col gap-4">
          {filteredResumes.length === 0 && (
            <div className="flex flex-col items-center justify-center pt-20 px-4 text-center">
              <span className="material-symbols-outlined text-slate-300 dark:text-slate-600 text-6xl mb-4">search_off</span>
              <p className="text-slate-900 dark:text-white font-medium mb-1">未找到相关简历</p>
              <p className="text-slate-500 dark:text-slate-400 text-sm">尝试搜索其他关键词</p>
            </div>
          )}

          {filteredResumes.length > 0 && (
            <>
              <button
                onClick={() => setIsOptimizedOpen(v => !v)}
                className="w-full flex items-center justify-between px-4 pt-2 text-lg font-bold text-white"
              >
                <span>已优化</span>
                <span className="material-symbols-outlined text-[20px] text-slate-500 dark:text-slate-400">
                  {isOptimizedOpen ? 'expand_less' : 'expand_more'}
                </span>
              </button>
              {(() => {
                const optimizedResumes = filteredResumes.filter(r => r.optimizationStatus === 'optimized');
                return isOptimizedOpen ? (
                  optimizedResumes.length > 0 ? (
                    renderResumeList(optimizedResumes)
                  ) : (
                    <div className="mx-4 mb-2 p-3 text-center text-slate-500 text-sm bg-white dark:bg-card-dark rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                      暂无已优化简历
                    </div>
                  )
                ) : null;
              })()}

              <button
                onClick={() => setIsUnoptimizedOpen(v => !v)}
                className="w-full flex items-center justify-between px-4 pt-2 text-lg font-bold text-white"
              >
                <span>未优化</span>
                <span className="material-symbols-outlined text-[20px] text-slate-500 dark:text-slate-400">
                  {isUnoptimizedOpen ? 'expand_less' : 'expand_more'}
                </span>
              </button>
              {(() => {
                const unoptimizedResumes = filteredResumes.filter(r => r.optimizationStatus !== 'optimized');
                return isUnoptimizedOpen ? (
                  unoptimizedResumes.length > 0 ? (
                    renderResumeList(unoptimizedResumes)
                  ) : (
                    <div className="mx-4 mb-2 p-3 text-center text-slate-500 text-sm bg-white dark:bg-card-dark rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                      暂无未优化简历
                    </div>
                  )
                ) : null;
              })()}
            </>
          )}
        </div>

        {filteredResumes.length > 0 && (
          <div className="h-8 flex items-center justify-center mt-2">
            <p className="text-xs text-slate-400 dark:text-slate-600">
              {filteredResumes.length === (allResumes?.length || 0) ? '已加载全部内容' : `显示 ${filteredResumes.length} 条结果`}
            </p>
          </div>
        )}
      </div>

      {/* Rename Modal */}
      {isRenamingId !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setIsRenamingId(null)}>
          <div className="w-full max-w-sm bg-white dark:bg-[#1c2936] rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">重命名简历</h3>
              <input
                autoFocus
                type="text"
                value={renameInputValue}
                onChange={(e) => setRenameInputValue(e.target.value)}
                className="w-full bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary mb-6 border border-transparent focus:border-primary/50"
                placeholder="输入新的简历名称"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRenameConfirm();
                  if (e.key === 'Escape') setIsRenamingId(null);
                }}
              />
              <div className="flex gap-3">
                <button
                  onClick={() => setIsRenamingId(null)}
                  className="flex-1 py-2.5 rounded-xl text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleRenameConfirm}
                  disabled={isUpdating || !renameInputValue.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-white font-bold hover:bg-blue-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-primary/30"
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
