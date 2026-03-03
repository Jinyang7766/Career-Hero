import React from 'react';
import { SUMMARY_MAX_CHARS } from '../../../src/editor-field-limits';
import AutoGrowTextarea from '../AutoGrowTextarea';

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
      <AutoGrowTextarea
        value={summary}
        onChange={(e) => onSummaryChange(e.target.value)}
        placeholder="例如：拥有7年前端开发经验的高级工程师，专注于React生态..."
        className={`w-full px-4 py-3 rounded-lg border bg-slate-50 dark:bg-[#111a22] text-slate-900 dark:text-white outline-none transition-all focus:ring-2 resize-none ${showValidation && !summary.trim()
          ? 'border-red-400 focus:ring-red-400/50 focus:border-red-400'
          : 'border-slate-300 dark:border-[#334155] focus:ring-primary focus:border-transparent'
          }`}
        maxLength={SUMMARY_MAX_CHARS}
        minRows={5}
      />
      {showValidation && !summary.trim() && (
        <p className="text-xs text-red-500">请填写个人总结</p>
      )}
    </div>

  </div>
);

export default SummaryStep;
