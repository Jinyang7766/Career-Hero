import React, { useState, useRef } from 'react';
import { ResumeParser, ParsedResume } from '../src/resume-parser';
import { ResumeData } from '../types';

interface ResumeImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (data: Omit<ResumeData, 'id'>) => void;
}

const ResumeImportDialog: React.FC<ResumeImportDialogProps> = ({ isOpen, onClose, onImport }) => {
  const [activeTab, setActiveTab] = useState<'text' | 'pdf'>('text');
  const [textResume, setTextResume] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [parsedData, setParsedData] = useState<ParsedResume | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleTextImport = async () => {
    if (!textResume.trim()) {
      setError('请输入简历内容');
      return;
    }

    setIsProcessing(true);
    setError('');

    try {
      console.log('开始解析文本简历...');
      const parsed = await ResumeParser.parseTextResume(textResume);
      setParsedData(parsed);
      console.log('文本简历解析成功:', parsed);
    } catch (err) {
      console.error('文本简历解析失败:', err);
      setError(err.message || '简历解析失败，请检查格式');
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
      console.log('开始解析PDF简历...');
      const parsed = await ResumeParser.parsePDFResume(file);
      setParsedData(parsed);
      console.log('PDF简历解析成功:', parsed);
    } catch (err) {
      console.error('PDF简历解析失败:', err);
      setError(err.message || 'PDF解析失败，请检查文件格式');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmImport = () => {
    if (!parsedData) return;

    try {
      const resumeData = ResumeParser.convertToResumeData(parsedData);
      onImport(resumeData);
      handleClose();
    } catch (err) {
      console.error('数据转换失败:', err);
      setError('数据转换失败，请重试');
    }
  };

  const handleClose = () => {
    setTextResume('');
    setParsedData(null);
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
    setParsedData(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-surface-dark rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-white/5">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">智能简历识别</h2>
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
                  placeholder="请粘贴您的简历内容，支持多种格式..."
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
                    <span className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    解析中...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[20px]">auto_fix_high</span>
                    智能识别
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  选择PDF文件
                </label>
                <div className="border-2 border-dashed border-slate-300 dark:border-[#324d67] rounded-lg p-8 text-center">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf"
                    onChange={handlePDFImport}
                    className="hidden"
                    id="pdf-upload"
                  />
                  <label
                    htmlFor="pdf-upload"
                    className="cursor-pointer flex flex-col items-center gap-3"
                  >
                    <span className="material-symbols-outlined text-4xl text-slate-400 dark:text-slate-500">upload_file</span>
                    <div>
                      <p className="text-slate-700 dark:text-slate-300 font-medium">点击上传PDF文件</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">支持最大10MB的PDF文件</p>
                    </div>
                  </label>
                </div>
              </div>

              {isProcessing && (
                <div className="flex items-center justify-center py-8">
                  <div className="flex flex-col items-center gap-3">
                    <span className="size-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></span>
                    <p className="text-sm text-slate-600 dark:text-slate-400">正在解析PDF文件...</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-red-500 text-[20px] mt-0.5">error</span>
                <div>
                  <p className="text-sm font-medium text-red-800 dark:text-red-400">解析失败</p>
                  <p className="text-sm text-red-600 dark:text-red-300 mt-1">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Parsed Data Preview */}
          {parsedData && (
            <div className="mt-6 space-y-4">
              <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <span className="material-symbols-outlined text-green-500 text-[20px]">check_circle</span>
                <p className="text-sm font-medium text-green-800 dark:text-green-400">识别成功！</p>
              </div>

              <div className="bg-slate-50 dark:bg-[#111a22] border border-slate-200 dark:border-[#324d67] rounded-lg p-4">
                <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">识别结果预览</h3>
                
                {/* Personal Info */}
                <div className="space-y-2 mb-4">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-slate-500 dark:text-slate-400">姓名:</span>
                      <span className="ml-2 text-slate-900 dark:text-white">{parsedData.personalInfo.name || '未识别'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400">求职意向:</span>
                      <span className="ml-2 text-slate-900 dark:text-white">{parsedData.personalInfo.title || '未识别'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400">邮箱:</span>
                      <span className="ml-2 text-slate-900 dark:text-white">{parsedData.personalInfo.email || '未识别'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400">电话:</span>
                      <span className="ml-2 text-slate-900 dark:text-white">{parsedData.personalInfo.phone || '未识别'}</span>
                    </div>
                  </div>
                </div>

                {/* Work Experience */}
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    工作经历 ({parsedData.workExps.length})
                  </h4>
                  <div className="space-y-1">
                    {parsedData.workExps.slice(0, 3).map((exp, index) => (
                      <div key={index} className="text-xs text-slate-600 dark:text-slate-400">
                        • {exp.title} @ {exp.subtitle} ({exp.date})
                      </div>
                    ))}
                    {parsedData.workExps.length > 3 && (
                      <div className="text-xs text-slate-500 dark:text-slate-500">
                        ...还有 {parsedData.workExps.length - 3} 项经历
                      </div>
                    )}
                  </div>
                </div>

                {/* Skills */}
                <div>
                  <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    技能 ({parsedData.skills.length})
                  </h4>
                  <div className="flex flex-wrap gap-1">
                    {parsedData.skills.slice(0, 8).map((skill, index) => (
                      <span
                        key={index}
                        className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded-full"
                      >
                        {skill}
                      </span>
                    ))}
                    {parsedData.skills.length > 8 && (
                      <span className="px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs rounded-full">
                        +{parsedData.skills.length - 8}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <button
                onClick={handleConfirmImport}
                className="w-full py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[20px]">import</span>
                导入到简历
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResumeImportDialog;
