import React, { useState } from 'react';
import { View, ScreenProps } from '../../types';

const AllResumes: React.FC<ScreenProps> = ({ setCurrentView, goBack, allResumes, setAllResumes, currentUser, setResumeData }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMenuId, setActiveMenuId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState<number | null>(null);
  const [isLoadingResume, setIsLoadingResume] = useState(false);

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
    
    if (!currentUser) {
      alert('请先登录');
      return;
    }

    const token = localStorage.getItem('authToken');
    if (!token) {
      alert('请先登录');
      return;
    }

    try {
      setIsDeleting(id);
      
      const response = await fetch(`http://127.0.0.1:5000/api/resumes/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        // 从本地状态中删除
        if (setAllResumes) {
          setAllResumes(prev => prev.filter(r => r.id !== id));
        }
        console.log('简历删除成功');
      } else {
        const errorData = await response.json();
        console.error('删除失败:', errorData);
        alert('删除失败，请重试');
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
    
    if (!currentUser) {
      alert('请先登录');
      return;
    }

    const token = localStorage.getItem('authToken');
    if (!token) {
      alert('请先登录');
      return;
    }

    try {
      setIsLoadingResume(true);
      
      const response = await fetch(`http://127.0.0.1:5000/api/resumes/${resumeId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        const resume = data.resume;
        
        // Set the resume data with ID for editing
        if (setResumeData) {
          setResumeData({
            id: resume.id,
            ...resume.resume_data
          });
        }
        
        setCurrentView(View.EDITOR);
      } else {
        const errorData = await response.json();
        console.error('加载简历失败:', errorData);
        alert('加载简历失败，请重试');
      }
    } catch (error) {
      console.error('加载简历时出错:', error);
      alert('加载简历失败，请检查网络连接');
    } finally {
      setIsLoadingResume(false);
      setActiveMenuId(null);
    }
  };

  const handlePreview = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentView(View.PREVIEW);
    setActiveMenuId(null);
  };

  const toggleMenu = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveMenuId(activeMenuId === id ? null : id);
  };

  // Close menu when clicking outside
  const handleContainerClick = () => {
    if (activeMenuId !== null) setActiveMenuId(null);
  };

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
        <div className="flex flex-col">
          {filteredResumes.length > 0 ? (
            filteredResumes.map((resume) => (
              <div 
                key={resume.id}
                onClick={() => setCurrentView(View.PREVIEW)} 
                className="group relative flex items-center gap-4 px-4 py-4 hover:bg-black/5 dark:hover:bg-[#1c2936] transition-colors cursor-pointer border-b border-slate-200/50 dark:border-white/5"
              >
                <div className="shrink-0 relative">
                  <div className="bg-white dark:bg-slate-700 aspect-[210/297] w-14 rounded-lg shadow-sm border border-slate-200 dark:border-slate-600 overflow-hidden relative">
                    {resume.thumbnail}
                  </div>
                  {resume.hasDot && (
                    <div className="absolute -top-1 -right-1 size-2.5 bg-primary rounded-full border-2 border-background-light dark:border-background-dark"></div>
                  )}
                  {resume.score && (
                    <div className="absolute -top-1.5 -left-1 bg-primary text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-background-light dark:border-background-dark shadow-sm">
                      {resume.score}
                    </div>
                  )}
                </div>
                <div className="flex flex-col flex-1 justify-center min-w-0">
                  <p className="text-slate-900 dark:text-white text-base font-medium leading-normal line-clamp-1">{resume.title}</p>
                  <p className="text-slate-500 dark:text-text-secondary text-sm font-normal leading-normal line-clamp-1 mt-0.5">上次修改: {resume.date}</p>
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
                                onClick={handlePreview}
                                className="w-full text-left px-4 py-3 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 flex items-center gap-2"
                             >
                                <span className="material-symbols-outlined text-[18px]">visibility</span>
                                预览
                             </button>
                             <button 
                                onClick={(e) => handleEdit(resume.id, e)}
                                disabled={isLoadingResume}
                                className="w-full text-left px-4 py-3 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                             >
                                {isLoadingResume ? (
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
            ))
          ) : (
            <div className="flex flex-col items-center justify-center pt-20 px-4 text-center">
              <span className="material-symbols-outlined text-slate-300 dark:text-slate-600 text-6xl mb-4">search_off</span>
              <p className="text-slate-900 dark:text-white font-medium mb-1">未找到相关简历</p>
              <p className="text-slate-500 dark:text-slate-400 text-sm">尝试搜索其他关键词</p>
            </div>
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
    </div>
  );
};

export default AllResumes;