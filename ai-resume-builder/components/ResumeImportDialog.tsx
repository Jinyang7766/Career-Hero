import React, { useEffect, useRef, useState } from 'react';
import { ResumeData } from '../types';

interface ResumeImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (data: Omit<ResumeData, 'id'>) => void;
  defaultTab?: 'text' | 'pdf';
  autoPickPdf?: boolean;
}

const ResumeImportDialog: React.FC<ResumeImportDialogProps> = ({ isOpen, onClose, onImport, defaultTab = 'text', autoPickPdf = false }) => {
  const [activeTab, setActiveTab] = useState<'text' | 'pdf'>('text');
  const [textResume, setTextResume] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleTextImport = async () => {
    if (!textResume.trim()) {
      setError('请输入简历内容');
      return;
    }

    setIsProcessing(true);
    setError('');

    try {
      console.log('开始智能解析简历...');
      
      // 调用 AI 解析接口
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/ai/parse-resume`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          resumeText: textResume
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '简历解析失败');
      }

      const result = await response.json();
      
      if (result.success && result.data) {
        console.log('简历解析成功:', result.data);
        onImport(result.data);
        handleClose();
      } else {
        throw new Error('解析结果为空');
      }
    } catch (err: any) {
      console.error('简历解析失败:', err);
      setError(err.message || '简历解析失败，请检查文本格式或稍后重试');
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePDFImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setError('');

    try {
      console.log('PDF导入功能暂未实现...');
      setError('PDF导入功能暂未实现，请使用文本导入');
    } catch (err) {
      console.error('PDF导入失败:', err);
      setError(err.message || 'PDF导入失败');
    } finally {
      setIsProcessing(false);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-surface-dark rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-white/5">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">简历导入</h2>
          <button
            onClick={handleClose}
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
          >
            <span className="material-symbols-outlined text-slate-500 dark:text-slate-400">close</span>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 dark:border-white/5">
          <button
            onClick={() => handleTabChange('text')}
            className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === 'text'
                ? 'text-primary border-b-2 border-primary bg-blue-50 dark:bg-blue-900/20'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <span className="material-symbols-outlined text-[18px] mr-2">description</span>
            粘贴文本
          </button>
          <button
            onClick={() => handleTabChange('pdf')}
            className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === 'pdf'
                ? 'text-primary border-b-2 border-primary bg-blue-50 dark:bg-blue-900/20'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <span className="material-symbols-outlined text-[18px] mr-2">picture_as_pdf</span>
            上传PDF
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'text' ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  简历文本内容
                </label>
                <textarea
                  value={textResume}
                  onChange={(e) => setTextResume(e.target.value)}
                  placeholder="请粘贴您的简历内容..."
                  className="w-full h-64 px-4 py-3 border border-slate-300 dark:border-[#324d67] rounded-lg bg-white dark:bg-[#111a22] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none resize-none"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                  支持从Word文档、网页、邮件等地方复制粘贴简历内容
                </p>
              </div>

              <button
                onClick={handleTextImport}
                disabled={isProcessing || !textResume.trim()}
                className="w-full py-3 bg-primary text-white rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <span className="size-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    处理中...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined">auto_fix_high</span>
                    智能识别
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  上传PDF文件
                </label>
                <div className="border-2 border-dashed border-slate-300 dark:border-[#324d67] rounded-lg p-8 text-center">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf"
                    onChange={handlePDFImport}
                    className="hidden"
                  />
                  <span className="material-symbols-outlined text-4xl text-slate-400 mb-4">picture_as_pdf</span>
                  <p className="text-slate-600 dark:text-slate-300 mb-2">点击或拖拽PDF文件到此处</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">支持PDF格式，最大10MB</p>
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
