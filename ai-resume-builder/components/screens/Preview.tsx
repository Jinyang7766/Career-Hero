import React, { useState } from 'react';
import { View, ScreenProps, ResumeData } from '../../types';
import { supabase } from '../../src/supabase-client';
import { DatabaseService } from '../../src/database-service';

const sanitizeData = (data: any): any => {
  // 定义要删除的字段
  const fieldsToRemove = ['suggestions', 'metadata', 'status', 'optimizationStatus', 'interviewSessions', 'lastJdText', 'exportHistory', 'id'];
  
  // 如果是数组，递归处理每个元素
  if (Array.isArray(data)) {
    return data.map(item => sanitizeData(item));
  }
  
  // 如果是对象，递归处理每个属性
  if (typeof data === 'object' && data !== null) {
    const sanitized: any = {};
    
    for (const [key, value] of Object.entries(data)) {
      // 跳过要删除的字段
      if (fieldsToRemove.includes(key)) {
        continue;
      }
      
      // 递归处理嵌套对象或数组
      sanitized[key] = sanitizeData(value);
    }
    
    return sanitized;
  }
  
  // 非对象和非数组类型直接返回
  return data;
};

const Preview: React.FC<ScreenProps> = ({ setCurrentView, goBack, resumeData }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const isOptimized = resumeData?.optimizationStatus === 'optimized';

  const recordExportHistory = async (filename: string, size: number) => {
    if (!resumeData?.id) return;

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) return;

      const currentHistory = resumeData.exportHistory || [];
      const entry = {
        filename,
        size,
        type: 'PDF' as const,
        exportedAt: new Date().toISOString()
      };
      const updatedResumeData: ResumeData = {
        ...resumeData,
        exportHistory: [entry, ...currentHistory].slice(0, 200)
      };

      await DatabaseService.updateResume(String(resumeData.id), {
        resume_data: updatedResumeData,
        updated_at: new Date().toISOString()
      });
    } catch (err) {
      console.error('Failed to record export history:', err);
    }
  };

  const handleExportPDF = async () => {
    if (isGenerating || !resumeData) return;

    setIsGenerating(true);
    
    try {
      // 清理简历数据，删除不需要的字段
      const sanitizedResumeData = sanitizeData(resumeData);
      
      // 调用后端 PDF 导出接口
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'}/api/export-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          resumeData: sanitizedResumeData,
          jdText: resumeData?.optimizationStatus === 'optimized' ? (resumeData?.lastJdText || '') : ''
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || errorData.message || 'PDF 生成失败');
      }

      // 获取 PDF 文件流并下载
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      
      // 从响应头获取文件名，如果没有则使用默认名称
      const contentDisposition = response.headers.get('content-disposition');
      let filename = '简历.pdf';
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      } else {
        // 使用用户姓名生成文件名
        const name = resumeData?.personalInfo?.name || '简历';
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        filename = `${name}_简历_${date}.pdf`;
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
      alert(`PDF 导出失败: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background-dark animate-in slide-in-from-right duration-300">
      <header className="absolute top-0 left-0 w-full z-30 flex items-center justify-between p-4 bg-gradient-to-b from-background-dark/90 to-transparent backdrop-blur-[2px]">
        <button 
          onClick={goBack}
          className="flex size-10 items-center justify-center rounded-full bg-white/5 hover:bg-white/10 active:scale-95 transition-all text-white"
        >
          <span className="material-symbols-outlined text-[24px]">arrow_back</span>
        </button>
        <h2 className="text-white text-lg font-bold tracking-tight opacity-90">简历预览</h2>
        <button 
          onClick={() => setCurrentView(View.EDITOR)}
          className="flex size-10 items-center justify-center rounded-full bg-white/5 hover:bg-white/10 active:scale-95 transition-all text-white"
        >
          <span className="material-symbols-outlined text-[20px]">edit</span>
        </button>
      </header>

      <main className="flex-1 w-full relative overflow-y-auto no-scrollbar bg-background-dark pt-24 pb-32 flex flex-col items-center gap-8" id="preview-area">
        <div className="relative w-[85%] flex flex-col items-center group/doc-wrapper">
            <div className="relative w-full aspect-[1/1.414] bg-white rounded-sm shadow-2xl transition-transform duration-300 ease-out origin-center group/doc">
                {/* 🔴 关键：移除PDF中的黑边和阴影 - 简化简历容器样式 */}
                <div 
                    id="resume-content" 
                    className="bg-white p-8 w-full text-slate-900" // 🔴 确保背景纯白，文字足够深
                    style={{ 
                        fontFamily: "'PingFang SC', 'Microsoft YaHei', sans-serif",
                        // 避免在 PDF 里出现多余的圆角和阴影
                        borderRadius: '0',
                        boxShadow: 'none',
                        overflow: 'visible'
                    }}
                >
                    <style dangerouslySetInnerHTML={{
                        __html: `
                            @media print {
                                #resume-content {
                                    width: 794px !important; /* A4标准像素宽度 */
                                    min-width: 794px !important;
                                    max-width: 794px !important;
                                    margin: 0 !important;
                                    padding: 32px !important; /* p-8 = 32px */
                                    box-shadow: none !important; /* 移除阴影 */
                                    border-radius: 0 !important; /* 移除圆角 */
                                    background-color: #ffffff !important; /* 纯白背景 */
                                    font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif !important;
                                    color: #0f172a !important; /* text-slate-900 */
                                    overflow: visible !important;
                                    font-size: 14px !important;
                                    line-height: 1.5 !important;
                                }
                                .no-print {
                                    display: none !important;
                                }
                                @page {
                                    margin: 10mm;
                                    size: A4 portrait;
                                }
                                body {
                                    margin: 0;
                                    padding: 0;
                                    background: #ffffff !important;
                                    font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif !important;
                                }
                                * {
                                    -webkit-print-color-adjust: exact !important;
                                    color-adjust: exact !important;
                                }
                                /* 🔴 关键：确保中文字体在PDF中正确显示 */
                                h1, h2, h3, h4, h5, h6 {
                                    font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif !important;
                                    font-weight: bold !important;
                                    color: #0f172a !important;
                                }
                                p, span, div {
                                    font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif !important;
                                    color: #0f172a !important;
                                }
                                
                                /* 确保内容不被截断 */
                                .mb-5, .mb-6 {
                                    break-inside: avoid;
                                    page-break-inside: avoid;
                                }
                                
                                /* 标题不与内容分离 */
                                h3, h4, h5, h6 {
                                    break-after: avoid;
                                    page-break-after: avoid;
                                }
                                
                                /* 列表项不被截断 */
                                li, .flex {
                                    break-inside: avoid;
                                    page-break-inside: avoid;
                                }
                            }
                        `
                    }} />
                    
                    <div className="flex gap-4 mb-6 border-b border-gray-200 pb-4 no-break">
                        <div className="w-16 h-20 bg-gray-200 rounded-sm shrink-0 overflow-hidden">
                            <img alt="Profile" className="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAuYMk7aveSfPuWe1GfZTQE_YdYsDV16dJ6O18b3T7HwgV_MSmAf-pt4eeLVnVWGixyEdoO0aqTxyKBX5thQRK2utmE15NMP_c3tiCZsk6nYxQi0iKL5uAntK1kabaE3J96E0F_Mpe6cDB3MdZizDLtWVdZNP0LlHCh1FJq-TjyX5DNGJdGaYPyyX-CU0-pWz0g9UrT-tUm5k6hDrZ1qp2ialPaWwa19tmYYtobn_gXJP8bTu-vj9Yj2GoxOxh12KcAFUrmwW_GsOhH"/>
                        </div>
                        <div className="flex-1 flex flex-col justify-center space-y-1.5">
                            <h1 className="text-xl font-bold text-gray-900" style={{ fontSize: '18px', fontWeight: 'bold' }}>{resumeData?.personalInfo?.name || '姓名'}</h1>
                            <p className="text-sm text-gray-600" style={{ fontSize: '14px', color: '#666' }}>{resumeData?.personalInfo?.title || '求职意向'}</p>
                            <div className="flex flex-wrap gap-2 mt-1 text-[10px] text-gray-500" style={{ fontSize: '10px', color: '#999' }}>
                                <span>{resumeData?.personalInfo?.email || 'email@example.com'}</span>
                                <span>•</span>
                                <span>{resumeData?.personalInfo?.phone || '+86 138 0000 0000'}</span>
                            </div>
                        </div>
                    </div>
                    
                    {resumeData?.workExps && resumeData.workExps.length > 0 && (
                        <div className="mb-5 space-y-2 no-break">
                            <h3 className="text-sm font-bold text-blue-600 uppercase border-b border-blue-100 pb-1 mb-2" style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e40af' }}>工作经历</h3>
                            {resumeData.workExps.map((exp, index) => (
                                <div key={exp.id} className="mb-2 no-break">
                                    <div className="flex justify-between items-baseline mb-1">
                                        <span className="text-xs font-bold text-gray-800" style={{ fontSize: '12px', fontWeight: 'bold', color: '#1f2937' }}>{exp.title || '公司名称'}</span>
                                        <span className="text-[10px] text-gray-500" style={{ fontSize: '10px', color: '#6b7280' }}>{exp.date || '工作时间'}</span>
                                    </div>
                                    <p className="text-[10px] font-medium text-gray-700" style={{ fontSize: '10px', fontWeight: '500', color: '#374151' }}>{exp.subtitle || '职位'}</p>
                                    <p className="text-[10px] text-gray-600 leading-relaxed mt-1" style={{ fontSize: '10px', color: '#4b5563', lineHeight: '1.4' }}>{exp.description || '工作描述'}</p>
                                </div>
                            ))}
                        </div>
                    )}

                    {resumeData?.educations && resumeData.educations.length > 0 && (
                        <div className="mb-5 space-y-2 no-break">
                            <h3 className="text-sm font-bold text-blue-600 uppercase border-b border-blue-100 pb-1 mb-2" style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e40af' }}>教育背景</h3>
                            {resumeData.educations.map((edu, index) => (
                                <div key={edu.id} className="flex justify-between items-baseline mb-1 no-break">
                                    <span className="text-xs font-bold text-gray-800" style={{ fontSize: '12px', fontWeight: 'bold', color: '#1f2937' }}>{edu.title || '学校名称'}</span>
                                    <span className="text-[10px] text-gray-500" style={{ fontSize: '10px', color: '#6b7280' }}>{edu.date || '教育时间'}</span>
                                </div>
                            ))}
                            {resumeData.educations[0]?.subtitle && (
                                <p className="text-[10px] text-gray-600" style={{ fontSize: '10px', color: '#4b5563' }}>{resumeData.educations[0].subtitle}</p>
                            )}
                        </div>
                    )}
                    
                    {resumeData?.projects && resumeData.projects.length > 0 && (
                        <div className="mb-5 space-y-2 no-break">
                            <h3 className="text-sm font-bold text-blue-600 uppercase border-b border-blue-100 pb-1 mb-2" style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e40af' }}>项目经历</h3>
                            {resumeData.projects.map((proj, index) => (
                                <div key={proj.id} className="mb-2 no-break">
                                    <div className="flex justify-between items-baseline mb-1">
                                        <span className="text-xs font-bold text-gray-800" style={{ fontSize: '12px', fontWeight: 'bold', color: '#1f2937' }}>{proj.title || '项目名称'}</span>
                                        <span className="text-[10px] text-gray-500" style={{ fontSize: '10px', color: '#6b7280' }}>{proj.date || '项目时间'}</span>
                                    </div>
                                    <p className="text-[10px] font-medium text-gray-700" style={{ fontSize: '10px', fontWeight: '500', color: '#374151' }}>{proj.subtitle || '项目角色'}</p>
                                    <p className="text-[10px] text-gray-600 leading-relaxed mt-1" style={{ fontSize: '10px', color: '#4b5563', lineHeight: '1.4' }}>{proj.description || '项目描述'}</p>
                                </div>
                            ))}
                        </div>
                    )}
                    
                     {resumeData?.skills && resumeData.skills.length > 0 && (
                        <div className="mb-5 space-y-2 no-break">
                            <h3 className="text-sm font-bold text-blue-600 uppercase border-b border-blue-100 pb-1 mb-2" style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e40af' }}>技能</h3>
                            <div className="flex flex-wrap gap-2">
                                {resumeData.skills.map((skill, index) => (
                                    <span key={index} className="px-2 py-0.5 bg-gray-100 text-gray-700 text-[10px] rounded" style={{ fontSize: '10px', backgroundColor: '#f3f4f6', color: '#374151' }}>{skill}</span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                
                {/* Overlay for aesthetic in preview mode only, hidden in print generally by html2pdf if targeted right, but here we target inner div */}
            </div>
        </div>

        <div className="w-[85%] flex flex-col gap-4">
            {isOptimized && (
                <button
                    onClick={() => {
                        if (resumeData?.id) {
                            localStorage.setItem('ai_interview_open', '1');
                            localStorage.setItem('ai_interview_resume_id', String(resumeData.id));
                        }
                        setCurrentView(View.AI_ANALYSIS);
                    }}
                    className="w-full flex items-center justify-between px-5 py-3 bg-gradient-to-r from-primary to-blue-600 text-white rounded-xl shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-all group"
                >
                    <div className="flex items-center gap-3">
                        <div className="relative size-10 rounded-full overflow-hidden border-2 border-white/30 bg-white">
                            <img src="https://api.dicebear.com/9.x/avataaars/svg?seed=Felix" alt="AI Interviewer" className="w-full h-full object-cover" />
                            <span className="absolute bottom-0 right-0 size-2.5 bg-green-500 rounded-full border-2 border-white"></span>
                        </div>
                        <div className="text-left">
                            <p className="text-sm font-bold">AI 模拟面试官</p>
                            <p className="text-xs text-blue-100">继续上次面试对话</p>
                        </div>
                    </div>
                    <div className="size-9 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition-colors">
                        <span className="material-symbols-outlined text-xl">arrow_forward</span>
                    </div>
                </button>
            )}
            <button 
                onClick={handleExportPDF}
                disabled={isGenerating}
                className="w-full flex items-center justify-center gap-2 h-14 bg-primary hover:bg-blue-600 active:bg-blue-700 text-white rounded-xl shadow-[0_0_20px_rgba(19,127,236,0.15)] transition-all transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isGenerating ? (
                    <>
                        <span className="size-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                        <span className="text-base font-bold tracking-wide">生成中...</span>
                    </>
                ) : (
                    <>
                        <span className="material-symbols-outlined text-[24px]">download</span>
                        <span className="text-base font-bold tracking-wide">导出 PDF</span>
                    </>
                )}
            </button>
        </div>
      </main>
    </div>
  );
};

export default Preview;
