import React from 'react';
import { SUMMARY_MAX_CHARS } from '../../../src/editor-field-limits';

type SummaryStepProps = {
  summary: string;
  onSummaryChange: (value: string) => void;
  showValidation?: boolean;
};

const SummaryStep: React.FC<SummaryStepProps> = ({ summary, onSummaryChange, showValidation }) => (
  <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
    <div className="bg-white dark:bg-surface-dark rounded-xl shadow-sm border border-slate-200 dark:border-[#324d67] p-4 space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-slate-900 dark:text-white">个人总结 *</h3>
        <span className="text-xs text-slate-400">{summary.length}/{SUMMARY_MAX_CHARS}</span>
      </div>
      <textarea
        value={summary}
        onChange={(e) => onSummaryChange(e.target.value)}
        placeholder="例如：拥有7年前端开发经验的高级工程师，专注于React生态..."
        className={`w-full px-4 py-3 rounded-lg border bg-slate-50 dark:bg-[#111a22] text-slate-900 dark:text-white outline-none transition-all min-h-[150px] focus:ring-2 ${
          showValidation && !summary.trim()
            ? 'border-red-400 focus:ring-red-400/50 focus:border-red-400'
            : 'border-slate-300 dark:border-[#334155] focus:ring-primary focus:border-transparent'
        }`}
        maxLength={SUMMARY_MAX_CHARS}
      />
      {showValidation && !summary.trim() && (
        <p className="text-xs text-red-500">请填写个人总结</p>
      )}
    </div>
    <div className="bg-green-50 dark:bg-green-900/10 p-4 rounded-lg flex items-start space-x-3 text-sm text-green-600 dark:text-green-400">
      <span className="material-symbols-outlined text-lg">check_circle</span>
      <p>这是最后一步了！完成后，我们将保存简历并跳转到预览页面。</p>
    </div>
  </div>
);

export default SummaryStep;
