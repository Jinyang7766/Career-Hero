import React, { useState } from 'react';
import AutoGrowTextarea from '../AutoGrowTextarea';

type ImportStepProps = {
  textResume: string;
  onTextResumeChange: (value: string) => void;
  onTextImport: () => void;
  isProcessing: boolean;
  isPdfProcessing?: boolean;
  textError: string;
  pdfError: string;
  onPdfImport: (event: React.ChangeEvent<HTMLInputElement>) => void;
  pdfInputRef: React.RefObject<HTMLInputElement>;
  onClearAll: () => void;
};

const ImportStep: React.FC<ImportStepProps> = ({
  textResume,
  onTextResumeChange,
  onTextImport,
  isProcessing,
  isPdfProcessing = false,
  textError,
  pdfError,
  onPdfImport,
  pdfInputRef,
  onClearAll,
}) => {
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleClear = () => {
    setShowClearConfirm(false);
    onClearAll();
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="bg-white dark:bg-surface-dark rounded-xl shadow-sm border border-slate-200 dark:border-[#324d67] p-6 text-center">
        <div className="w-16 h-16 mx-auto mb-4 bg-primary/10 rounded-full flex items-center justify-center">
          <span className="material-symbols-outlined text-3xl text-primary">upload_file</span>
        </div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">导入已有简历</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
          上传您的简历文件或粘贴文本，AI 将自动解析并填充信息
        </p>

        <div className="space-y-3">
          <button
            onClick={() => pdfInputRef.current?.click()}
            disabled={isPdfProcessing}
            className="w-full py-3 px-4 bg-primary text-white font-semibold rounded-xl flex items-center justify-center gap-2 hover:bg-blue-600 active:scale-[0.98] transition-all shadow-lg shadow-blue-500/20 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isPdfProcessing ? (
              <>
                <span className="size-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                正在读取您的简历...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined">description</span>
                上传 PDF / Word 文件
              </>
            )}
          </button>
          <input
            ref={pdfInputRef}
            type="file"
            accept=".pdf,.doc,.docx"
            onChange={onPdfImport}
            className="hidden"
          />

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-slate-200 dark:bg-white/10"></div>
            <span className="text-xs text-slate-400">或</span>
            <div className="flex-1 h-px bg-slate-200 dark:bg-white/10"></div>
          </div>

          <AutoGrowTextarea
            value={textResume}
            onChange={(e) => onTextResumeChange(e.target.value)}
            placeholder="请粘贴您的简历内容..."
            className="w-full px-4 py-3 border border-slate-300 dark:border-[#324d67] rounded-lg bg-white dark:bg-[#111a22] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none resize-none"
            minRows={6}
          />
          <button
            onClick={onTextImport}
            disabled={isProcessing || !textResume.trim()}
            className="w-full py-3 bg-primary text-white rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {isProcessing ? (
              <>
                <span className="size-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                正在读取您的简历...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined">auto_fix_high</span>
                智能识别
              </>
            )}
          </button>
          {pdfError && (
            <div className="mt-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400">{pdfError}</p>
            </div>
          )}
          {textError && (
            <div className="mt-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400">{textError}</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 text-center">

        <button
          onClick={() => setShowClearConfirm(true)}
          className="mt-4 text-xs text-slate-400 dark:text-slate-500 hover:text-red-500 transition-colors flex items-center justify-center gap-1 py-3 hover:bg-slate-50 dark:hover:bg-white/5 rounded-lg min-h-[44px]"
        >
          <span className="material-symbols-outlined text-[16px]">delete</span>
          清空所有数据
        </button>
      </div>

      {/* Clear All Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-6">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-[#324d67] shadow-xl p-6 text-center animate-in zoom-in-95 duration-200">
            <div className="mx-auto mb-3 size-12 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 flex items-center justify-center">
              <span className="material-symbols-outlined text-[24px]">delete_forever</span>
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">确认清空所有数据？</h3>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              这将清除您的所有简历内容，操作无法撤销。
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 font-semibold hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleClear}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-semibold hover:bg-red-600 active:scale-[0.98] transition-all shadow-lg shadow-red-500/20"
              >
                确认清空
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImportStep;
