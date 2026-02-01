import React, { useState, useEffect } from 'react';
import { View, ScreenProps } from '../../types';

const Preview: React.FC<ScreenProps> = ({ setCurrentView, goBack, resumeData }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [html2pdfLoaded, setHtml2pdfLoaded] = useState(false);

  // 动态加载html2pdf库
  useEffect(() => {
    const loadHtml2pdf = async () => {
      try {
        if (typeof window !== 'undefined' && !(window as any).html2pdf) {
          // 动态加载html2pdf库
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
          script.integrity = 'sha512-GsLlZN/3F2ErC5ifS5QtgpiJtWd43JWSuIgh7mbzZ8zBps+dvLusV+eNQATqgA/HdeKFVgA5v3S/cIrLF7QnIg==';
          script.crossOrigin = 'anonymous';
          script.referrerPolicy = 'no-referrer';
          
          script.onload = () => {
            console.log('html2pdf库加载成功');
            setHtml2pdfLoaded(true);
          };
          
          script.onerror = () => {
            console.error('html2pdf库加载失败');
            setHtml2pdfLoaded(false);
          };
          
          document.head.appendChild(script);
        } else if ((window as any).html2pdf) {
          setHtml2pdfLoaded(true);
        }
      } catch (error) {
        console.error('加载html2pdf库时出错:', error);
        setHtml2pdfLoaded(false);
      }
    };

    loadHtml2pdf();
  }, []);

  const handleExportPDF = async () => {
    const element = document.getElementById('resume-content');
    if (!element) {
      console.error('未找到简历内容元素');
      alert('未找到简历内容，请刷新页面后重试');
      return;
    }

    setIsGenerating(true);

    try {
      console.log('开始生成PDF...');

      // 检查html2pdf是否可用
      if (typeof window !== 'undefined' && (window as any).html2pdf && html2pdfLoaded) {
        console.log('使用html2pdf生成PDF');
        
        const opt = {
          margin: [0, 0, 0, 0],
          filename: `${resumeData?.personalInfo?.name || '简历'}_Resume.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { 
            scale: 2, 
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff',
            logging: false,
            windowWidth: 1200, // 锁定导出宽度
            height: element.scrollHeight,
            width: element.scrollWidth
          },
          jsPDF: { 
            unit: 'mm', 
            format: 'a4', 
            orientation: 'portrait',
            compress: true
          },
          pagebreak: { 
            mode: 'avoid-all', // 防止内容在页面边缘被切断
            before: '.page-break-before',
            after: '.page-break-after',
            avoid: '.no-break'
          }
        };

        console.log('PDF配置:', opt);
        console.log('目标元素:', element);

        // 生成PDF
        await (window as any).html2pdf()
          .from(element)
          .set(opt)
          .save()
          .then(() => {
            console.log('PDF生成成功');
            setIsGenerating(false);
          })
          .catch((error: any) => {
            console.error('PDF生成失败:', error);
            setIsGenerating(false);
            alert('PDF生成失败，请重试或使用浏览器打印功能');
          });

      } else {
        console.log('html2pdf不可用，使用浏览器打印功能');
        // Fallback: 使用浏览器打印功能
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          const printContent = element.innerHTML;
          const printStyles = `
            <style>
              body { margin: 0; padding: 20px; font-family: 'Noto Sans SC', 'Inter', sans-serif; }
              .no-print { display: none !important; }
              @media print {
                body { margin: 0; padding: 10px; }
                @page { margin: 10mm; }
              }
            </style>
          `;
          
          printWindow.document.write(`
            <!DOCTYPE html>
            <html>
              <head>
                <title>${resumeData?.personalInfo?.name || '简历'}_Resume</title>
                ${printStyles}
              </head>
              <body>
                ${printContent}
              </body>
            </html>
          `);
          
          printWindow.document.close();
          printWindow.focus();
          
          setTimeout(() => {
            printWindow.print();
            printWindow.close();
            setIsGenerating(false);
          }, 500);
        } else {
          setIsGenerating(false);
          alert('无法打开打印窗口，请检查浏览器设置');
        }
      }
    } catch (error) {
      console.error('PDF导出过程中出错:', error);
      setIsGenerating(false);
      alert('PDF导出失败，请重试');
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
                <div 
                    id="resume-content" 
                    className="w-full h-full rounded-sm overflow-hidden flex flex-col p-[6%]" 
                    style={{ 
                        backgroundColor: '#ffffff', // 显式白色背景
                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"', // 标准中文系统字体序列
                        color: '#1a1a1a', // 确保文字颜色
                        fontSize: '12px', // 基础字体大小
                        lineHeight: '1.4' // 行高
                    }}
                >
                    <style dangerouslySetInnerHTML={{
                        __html: `
                            @media print {
                                #resume-content {
                                    width: 210mm !important;
                                    height: 297mm !important;
                                    margin: 0 !important;
                                    padding: 15mm !important;
                                    box-shadow: none !important;
                                    border-radius: 0 !important;
                                    background-color: #ffffff !important;
                                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif !important;
                                    color: #1a1a1a !important;
                                    overflow: visible !important;
                                }
                                .no-print {
                                    display: none !important;
                                }
                                .page-break-before {
                                    page-break-before: always !important;
                                }
                                .page-break-after {
                                    page-break-after: always !important;
                                }
                                .no-break {
                                    page-break-inside: avoid !important;
                                }
                                @page {
                                    margin: 10mm;
                                    size: A4 portrait;
                                }
                                body {
                                    margin: 0;
                                    padding: 0;
                                    background: #ffffff !important;
                                }
                                * {
                                    -webkit-print-color-adjust: exact !important;
                                    color-adjust: exact !important;
                                }
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
            <button 
                onClick={handleExportPDF}
                disabled={isGenerating || !html2pdfLoaded}
                className="w-full flex items-center justify-center gap-2 h-14 bg-primary hover:bg-blue-600 active:bg-blue-700 text-white rounded-xl shadow-[0_0_20px_rgba(19,127,236,0.15)] transition-all transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isGenerating ? (
                    <>
                        <span className="size-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                        <span className="text-base font-bold tracking-wide">生成中...</span>
                    </>
                ) : !html2pdfLoaded ? (
                    <>
                        <span className="material-symbols-outlined text-[24px]">hourglass_empty</span>
                        <span className="text-base font-bold tracking-wide">加载PDF库...</span>
                    </>
                ) : (
                    <>
                        <span className="material-symbols-outlined text-[24px]">download</span>
                        <span className="text-base font-bold tracking-wide">导出 PDF</span>
                    </>
                )}
            </button>
            {!html2pdfLoaded && (
                <p className="text-xs text-slate-400 dark:text-slate-500 text-center">
                    正在加载PDF生成库，请稍候...
                </p>
            )}
        </div>
      </main>
    </div>
  );
};

export default Preview;