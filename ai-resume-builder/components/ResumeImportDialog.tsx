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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4">
      <div className="bg-white dark:bg-surface-dark w-full max-w-md sm:max-w-2xl h-[100dvh] sm:h-auto max-h-[100dvh] sm:max-h-[90vh] rounded-none sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 pt-[calc(env(safe-area-inset-top)+0.75rem)] sm:pt-6 pb-4 border-b border-slate-200 dark:border-white/5 shrink-0">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">简历导入</h2>
          <button
            onClick={handleClose}
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
          >
            <span className="material-symbols-outlined text-slate-500 dark:text-slate-400">close</span>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 dark:border-white/5 shrink-0">
          <button
            onClick={() => handleTabChange('text')}
            className={`flex-1 px-4 sm:px-6 py-3 text-sm font-medium transition-colors ${activeTab === 'text'
              ? 'text-primary border-b-2 border-primary bg-blue-50 dark:bg-blue-900/20'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
          >
            <span className="material-symbols-outlined text-[18px] mr-2">description</span>
            粘贴文本
          </button>
          <button
            onClick={() => handleTabChange('pdf')}
            className={`flex-1 px-4 sm:px-6 py-3 text-sm font-medium transition-colors ${activeTab === 'pdf'
              ? 'text-primary border-b-2 border-primary bg-blue-50 dark:bg-blue-900/20'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
          >
            <span className="material-symbols-outlined text-[18px] mr-2">picture_as_pdf</span>
            上传PDF
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-6 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:pb-6">
          {activeTab === 'text' ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  简历文本内容
                </label>
                <AutoGrowTextarea
                  value={textResume}
                  onChange={(e) => setTextResume(e.target.value)}
                  placeholder="请粘贴您的简历内容..."
                  className="w-full px-4 py-3 border border-slate-300 dark:border-[#324d67] rounded-lg bg-white dark:bg-[#111a22] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none resize-none"
                  minRows={12}
                />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                  支持从Word文档、网页、邮件等地方复制粘贴简历内容
                </p>
              </div>

              <button
                onClick={handleTextImport}
                disabled={!textResume.trim()}
                className="w-full py-3 bg-primary text-white rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                <>
                  <span className="material-symbols-outlined">upload_file</span>
                  保存输入
                </>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  上传 PDF / DOCX 文件
                </label>
                <div className="border-2 border-dashed border-slate-300 dark:border-[#324d67] rounded-lg p-5 sm:p-8 text-center">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx"
                    onChange={handlePDFImport}
                    className="hidden"
                  />
                  <span className="material-symbols-outlined text-4xl text-slate-400 mb-4">picture_as_pdf</span>
                  <p className="text-slate-600 dark:text-slate-300 mb-2">点击选择简历文件（PDF 或 DOCX）</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">支持 PDF/DOCX，建议文件小于 10MB</p>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-4 px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                  >
                    选择文件
                  </button>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResumeImportDialog;
