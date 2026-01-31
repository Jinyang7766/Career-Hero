import React, { useState } from 'react';
import { View, ScreenProps } from '../../types';

declare const html2pdf: any;

const Preview: React.FC<ScreenProps> = ({ setCurrentView, goBack, resumeData }) => {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleExportPDF = () => {
    const element = document.getElementById('resume-content');
    if (!element) return;

    setIsGenerating(true);

    const opt = {
      margin: 0,
      filename: `${resumeData?.personalInfo?.name || '简历'}_Resume.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };

    // Check if html2pdf is available
    if (typeof window !== 'undefined' && (window as any).html2pdf) {
      (window as any).html2pdf().from(element).set(opt).save().then(() => {
        setIsGenerating(false);
      });
    } else {
      // Fallback: use window.print() for basic PDF generation
      window.print();
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
                {/* Visual Resume Representation for PDF Generation */}
                <div id="resume-content" className="w-full h-full rounded-sm overflow-hidden bg-white flex flex-col p-[6%] text-gray-800">
                    <div className="flex gap-4 mb-6 border-b border-gray-200 pb-4">
                        <div className="w-16 h-20 bg-gray-200 rounded-sm shrink-0 overflow-hidden">
                            <img alt="Profile" className="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAuYMk7aveSfPuWe1GfZTQE_YdYsDV16dJ6O18b3T7HwgV_MSmAf-pt4eeLVnVWGixyEdoO0aqTxyKBX5thQRK2utmE15NMP_c3tiCZsk6nYxQi0iKL5uAntK1kabaE3J96E0F_Mpe6cDB3MdZizDLtWVdZNP0LlHCh1FJq-TjyX5DNGJdGaYPyyX-CU0-pWz0g9UrT-tUm5k6hDrZ1qp2ialPaWwa19tmYYtobn_gXJP8bTu-vj9Yj2GoxOxh12KcAFUrmwW_GsOhH"/>
                        </div>
                        <div className="flex-1 flex flex-col justify-center space-y-1.5">
                            <h1 className="text-xl font-bold text-gray-900">{resumeData?.personalInfo?.name || '姓名'}</h1>
                            <p className="text-sm text-gray-600">{resumeData?.personalInfo?.title || '求职意向'}</p>
                            <div className="flex flex-wrap gap-2 mt-1 text-[10px] text-gray-500">
                                <span>{resumeData?.personalInfo?.email || 'email@example.com'}</span>
                                <span>•</span>
                                <span>{resumeData?.personalInfo?.phone || '+86 138 0000 0000'}</span>
                            </div>
                        </div>
                    </div>
                    
                    {resumeData?.workExps && resumeData.workExps.length > 0 && (
                        <div className="mb-5 space-y-2">
                            <h3 className="text-sm font-bold text-blue-600 uppercase border-b border-blue-100 pb-1 mb-2">工作经历</h3>
                            {resumeData.workExps.map((exp, index) => (
                                <div key={exp.id} className="mb-2">
                                    <div className="flex justify-between items-baseline mb-1">
                                        <span className="text-xs font-bold text-gray-800">{exp.title || '公司名称'}</span>
                                        <span className="text-[10px] text-gray-500">{exp.date || '工作时间'}</span>
                                    </div>
                                    <p className="text-[10px] font-medium text-gray-700">{exp.subtitle || '职位'}</p>
                                    <p className="text-[10px] text-gray-600 leading-relaxed mt-1">{exp.description || '工作描述'}</p>
                                </div>
                            ))}
                        </div>
                    )}

                    {resumeData?.educations && resumeData.educations.length > 0 && (
                        <div className="mb-5 space-y-2">
                            <h3 className="text-sm font-bold text-blue-600 uppercase border-b border-blue-100 pb-1 mb-2">教育背景</h3>
                            {resumeData.educations.map((edu, index) => (
                                <div key={edu.id} className="flex justify-between items-baseline mb-1">
                                    <span className="text-xs font-bold text-gray-800">{edu.title || '学校名称'}</span>
                                    <span className="text-[10px] text-gray-500">{edu.date || '教育时间'}</span>
                                </div>
                            ))}
                            {resumeData.educations[0]?.subtitle && (
                                <p className="text-[10px] text-gray-600">{resumeData.educations[0].subtitle}</p>
                            )}
                        </div>
                    )}
                    
                    {resumeData?.projects && resumeData.projects.length > 0 && (
                        <div className="mb-5 space-y-2">
                            <h3 className="text-sm font-bold text-blue-600 uppercase border-b border-blue-100 pb-1 mb-2">项目经历</h3>
                            {resumeData.projects.map((proj, index) => (
                                <div key={proj.id} className="mb-2">
                                    <div className="flex justify-between items-baseline mb-1">
                                        <span className="text-xs font-bold text-gray-800">{proj.title || '项目名称'}</span>
                                        <span className="text-[10px] text-gray-500">{proj.date || '项目时间'}</span>
                                    </div>
                                    <p className="text-[10px] font-medium text-gray-700">{proj.subtitle || '项目角色'}</p>
                                    <p className="text-[10px] text-gray-600 leading-relaxed mt-1">{proj.description || '项目描述'}</p>
                                </div>
                            ))}
                        </div>
                    )}
                    
                     {resumeData?.skills && resumeData.skills.length > 0 && (
                        <div className="mb-5 space-y-2">
                            <h3 className="text-sm font-bold text-blue-600 uppercase border-b border-blue-100 pb-1 mb-2">技能</h3>
                            <div className="flex flex-wrap gap-2">
                                {resumeData.skills.map((skill, index) => (
                                    <span key={index} className="px-2 py-0.5 bg-gray-100 text-gray-700 text-[10px] rounded">{skill}</span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                
                {/* Overlay for aesthetic in preview mode only, hidden in print generally by html2pdf if targeted right, but here we target inner div */}
            </div>
        </div>

        <div className="w-[85%] flex flex-col gap-4">
            <button 
                onClick={handleExportPDF}
                disabled={isGenerating}
                className="w-full flex items-center justify-center gap-2 h-14 bg-primary hover:bg-blue-600 active:bg-blue-700 text-white rounded-xl shadow-[0_0_20px_rgba(19,127,236,0.15)] transition-all transform active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
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