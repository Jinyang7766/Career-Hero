import React, { useEffect, useRef, useState } from 'react';
import AutoGrowTextarea from './editor/AutoGrowTextarea';

export type ResumeImportInput =
  | {
    type: 'text';
    rawText: string;
    title: string;
  }
  | {
    type: 'file';
    file: File;
    title: string;
  };

interface ResumeImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (input: ResumeImportInput) => void;
  defaultTab?: 'text' | 'pdf';
  autoPickPdf?: boolean;
}

const ResumeImportDialog: React.FC<ResumeImportDialogProps> = ({ isOpen, onClose, onImport, defaultTab = 'text', autoPickPdf = false }) => {
  const [activeTab, setActiveTab] = useState<'text' | 'pdf'>('text');
  const [textResume, setTextResume] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleTextImport = () => {
    if (!textResume.trim()) {
      setError('请输入简历内容');
      return;
    }
    setError('');
    onImport({
      type: 'text',
      rawText: textResume.trim(),
      title: '文本简历',
    });
    handleClose();
  };

  const handlePDFImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    onImport({
      type: 'file',
      file,
      title: String(file.name || '已上传文件'),
    });
    handleClose();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    setTextResume('');
    setError('');
    setActiveTab('text');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClose();
  };

  const handleTabChange = (tab: 'text' | 'pdf') => {
    setActiveTab(tab);
    setError('');
  };

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(defaultTab);
    if (defaultTab === 'pdf' && autoPickPdf) {
      setTimeout(() => fileInputRef.current?.click(), 0);
    }
  }, [isOpen, defaultTab, autoPickPdf]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-[2px] sm:items-center sm:p-4 transition-all">
      <div className="bg-white dark:bg-surface-dark w-full max-w-lg sm:max-w-xl h-[92dvh] sm:h-auto max-h-[92dvh] sm:max-h-[85vh] rounded-t-[2.5rem] sm:rounded-[2rem] shadow-2xl overflow-hidden flex flex-col border border-white/10">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-6 border-b border-slate-100 dark:border-white/5 shrink-0">
          <div className="flex flex-col">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">导入简历内容</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">选择您最方便的方式导入，开始智能编辑</p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-white/10 transition-all"
          >
            <span className="material-symbols-outlined text-[24px]">close</span>
          </button>
        </div>

        {/* Tabs - Modern Segmented Control */}
        <div className="px-6 py-4 bg-slate-50/30 dark:bg-black/20 shrink-0">
          <div className="flex p-1 bg-slate-200/50 dark:bg-white/5 rounded-2xl border border-slate-200/50 dark:border-white/5">
            <button
              onClick={() => handleTabChange('text')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold rounded-xl transition-all ${
                activeTab === 'text'
                  ? 'bg-white dark:bg-white/10 text-primary shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">description</span>
              粘贴文本
            </button>
            <button
              onClick={() => handleTabChange('pdf')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold rounded-xl transition-all ${
                activeTab === 'pdf'
                  ? 'bg-white dark:bg-white/10 text-primary shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">picture_as_pdf</span>
              上传文件
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto px-6 py-2 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] sm:pb-8 no-scrollbar">
          {activeTab === 'text' ? (
            <div className="space-y-6 pt-2">
              <div className="flex flex-col">
                <div className="flex items-center justify-between mb-2 px-1">
                  <label className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500">
                    简历文本内容
                  </label>
                  <span className="text-[11px] text-slate-400 font-medium">智能识别格式</span>
                </div>
                <AutoGrowTextarea
                  value={textResume}
                  onChange={(e) => setTextResume(e.target.value)}
                  placeholder="在这里粘贴您的简历全文，包括联系方式、教育背景和工作经验..."
                  className="w-full px-5 py-5 border-2 border-slate-100 dark:border-white/5 rounded-2xl bg-white dark:bg-black/10 text-slate-900 dark:text-white placeholder-slate-300 dark:placeholder-slate-600 focus:border-primary/40 focus:ring-4 focus:ring-primary/5 outline-none resize-none transition-all min-h-[220px]"
                  minRows={8}
                />
              </div>

              <div className="flex flex-col gap-4">
                <div className="flex items-start gap-3 p-4 bg-primary/5 dark:bg-primary/10 rounded-2xl border border-primary/10 dark:border-primary/20">
                  <span className="material-symbols-outlined text-primary text-[20px] mt-0.5">lightbulb</span>
                  <p className="text-[12px] text-primary/80 dark:text-primary/70 leading-relaxed font-medium">
                    提示：我们的 AI 将为您自动识别文本中的结构化信息。内容越详实，生成的简历质量越高。
                  </p>
                </div>
                
                <button
                  onClick={handleTextImport}
                  disabled={!textResume.trim()}
                  className="w-full py-4 bg-primary text-white rounded-2xl font-bold shadow-lg shadow-primary/25 hover:bg-blue-600 active:scale-[0.99] disabled:opacity-30 disabled:grayscale transition-all flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[20px]">magic_button</span>
                  开始智能解析
                </button>
                
                <button
                  onClick={handleClose}
                  className="w-full py-2 text-sm text-slate-400 dark:text-slate-500 font-bold hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                  暂不导入，直接编辑
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6 pt-2">
              <div className="flex flex-col">
                <label className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500 mb-2 px-1">
                  选择文件
                </label>
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="group border-2 border-dashed border-slate-200 dark:border-white/10 rounded-[2rem] p-10 sm:p-14 text-center cursor-pointer hover:border-primary/40 hover:bg-primary/[0.02] dark:hover:bg-primary/[0.05] transition-all relative overflow-hidden"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx"
                    onChange={handlePDFImport}
                    className="hidden"
                  />
                  
                  <div className="relative z-10">
                    <div className="w-16 h-16 bg-slate-100 dark:bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-5 group-hover:scale-110 group-hover:bg-primary/10 transition-all duration-300">
                      <span className="material-symbols-outlined text-3xl text-slate-400 group-hover:text-primary transition-colors">cloud_upload</span>
                    </div>
                    <p className="text-slate-900 dark:text-white font-bold text-lg mb-1">点击或拖拽简历文件</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mb-6">支持 PDF 或 Word (DOCX) 格式</p>
                    <div className="inline-flex px-6 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl text-sm font-bold group-hover:bg-primary group-hover:text-white transition-all shadow-md">
                      选取本地文件
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5">
                <span className="material-symbols-outlined text-slate-400 text-[20px] mt-0.5">verified_user</span>
                <p className="text-[12px] text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
                  隐私保护：您的文件仅用于内容提取，不会被公开或留存。建议文件大小在 10MB 以内以获得最佳体验。
                </p>
              </div>

              <button
                onClick={handleClose}
                className="w-full py-2 text-sm text-slate-400 dark:text-slate-500 font-bold hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              >
                取消导入
              </button>
            </div>
          )}

          {error && (
            <div className="mt-6 p-4 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 rounded-2xl flex items-center gap-3">
              <span className="material-symbols-outlined text-red-500">error</span>
              <p className="text-sm text-red-600 dark:text-red-400 font-bold">{error}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResumeImportDialog;
