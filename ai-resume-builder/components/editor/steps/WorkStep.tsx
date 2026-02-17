import React from 'react';
import { ResumeData, ExperienceItem } from '../../../types';
import { WORK_FIELD_LIMITS } from '../../../src/editor-field-limits';

type WorkStepProps = {
  resumeData: ResumeData;
  isComplete: boolean;
  wizardMode: boolean;
  onAdd: () => void;
  onRemove: (id: number) => void;
  onUpdate: (id: number, field: keyof ExperienceItem, value: string) => void;
  showValidation?: boolean;
};

const WorkStep: React.FC<WorkStepProps> = ({ resumeData, isComplete, wizardMode, onAdd, onRemove, onUpdate, showValidation }) => (
  <details className="group bg-white dark:bg-surface-dark rounded-xl shadow-md border border-slate-200 dark:border-[#324d67] overflow-hidden transition-all duration-300" open={wizardMode}>
    <summary className="flex cursor-pointer items-center justify-between p-4 bg-white dark:bg-surface-dark hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
      <div className="flex items-center gap-3">
        <div className={`flex items-center justify-center size-8 rounded-full ${isComplete ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'}`}>
          <span className="material-symbols-outlined text-[18px]">{isComplete ? 'check' : 'work'}</span>
        </div>
        <span className="font-semibold text-slate-900 dark:text-white">工作经历 *</span>
      </div>
      <span className="material-symbols-outlined text-slate-400 group-open:rotate-180 transition-transform duration-300">expand_more</span>
    </summary>
    <div className="p-4 pt-0 border-t border-slate-200 dark:border-white/5 mt-2">
      {resumeData.workExps.map((exp, index) => {
        const missingTitle = showValidation && !exp.title;
        const missingSubtitle = showValidation && !exp.subtitle;
        const missingStart = showValidation && !exp.startDate;
        const missingEnd = showValidation && !exp.endDate;
        const descLen = String(exp.description || '').length;
        return (
          <div key={exp.id} className="mt-4 flex flex-col gap-4 pb-6 border-b border-slate-200 dark:border-white/5 last:border-0 relative">
            <div className="flex justify-between items-center">
              <h4 className="text-sm font-semibold text-primary uppercase tracking-wide">工作经历 {index + 1}</h4>
              <button
                onClick={() => onRemove(exp.id)}
                className="text-slate-400 hover:text-red-400 p-1"
              >
                <span className="material-symbols-outlined text-[18px]">delete</span>
              </button>
            </div>
            <div className="grid gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-600 dark:text-text-secondary uppercase tracking-wider">公司名称 *</label>
                <input
                  className={`w-full rounded-lg bg-white dark:bg-[#111a22] border px-4 py-3 placeholder:text-slate-400 outline-none transition-all focus:ring-2 shadow-sm ${missingTitle
                    ? 'border-red-400 focus:ring-red-400/50 focus:border-red-400'
                    : 'border-slate-300 dark:border-[#324d67] focus:ring-primary/50 focus:border-primary'
                    } text-slate-900 dark:text-white`}
                  placeholder="公司名称"
                  type="text"
                  value={exp.title}
                  onChange={(e) => onUpdate(exp.id, 'title', e.target.value)}
                  maxLength={WORK_FIELD_LIMITS.title}
                />
                {missingTitle && <p className="text-xs text-red-500">请填写公司名称</p>}
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-600 dark:text-text-secondary uppercase tracking-wider">职位名称 *</label>
                <input
                  className={`w-full rounded-lg bg-white dark:bg-[#111a22] border px-4 py-3 placeholder:text-slate-400 outline-none transition-all focus:ring-2 shadow-sm ${missingSubtitle
                    ? 'border-red-400 focus:ring-red-400/50 focus:border-red-400'
                    : 'border-slate-200 dark:border-[#324d67] focus:ring-primary/50 focus:border-primary'
                    } text-slate-900 dark:text-white`}
                  placeholder="职位名称"
                  type="text"
                  value={exp.subtitle}
                  onChange={(e) => onUpdate(exp.id, 'subtitle', e.target.value)}
                  maxLength={WORK_FIELD_LIMITS.subtitle}
                />
                {missingSubtitle && <p className="text-xs text-red-500">请填写职位名称</p>}
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-600 dark:text-text-secondary uppercase tracking-wider">任职时间 *</label>
                <div className="flex items-center gap-2">
                  <input
                    className={`w-full rounded-lg bg-white dark:bg-[#111a22] border px-4 py-3 placeholder:text-slate-400 outline-none transition-all focus:ring-2 shadow-sm ${missingStart
                      ? 'border-red-400 focus:ring-red-400/50 focus:border-red-400'
                      : 'border-slate-300 dark:border-[#324d67] focus:ring-primary/50 focus:border-primary'
                      } text-slate-900 dark:text-white`}
                    placeholder="开始时间"
                    type="text"
                    value={exp.startDate || ''}
                    onChange={(e) => onUpdate(exp.id, 'startDate', e.target.value)}
                    maxLength={WORK_FIELD_LIMITS.startDate}
                  />
                  <span className="text-slate-400">-</span>
                  <input
                    className={`w-full rounded-lg bg-white dark:bg-[#111a22] border px-4 py-3 placeholder:text-slate-400 outline-none transition-all focus:ring-2 shadow-sm ${missingEnd
                      ? 'border-red-400 focus:ring-red-400/50 focus:border-red-400'
                      : 'border-slate-300 dark:border-[#324d67] focus:ring-primary/50 focus:border-primary'
                      } text-slate-900 dark:text-white`}
                    placeholder="结束时间"
                    type="text"
                    value={exp.endDate || ''}
                    onChange={(e) => onUpdate(exp.id, 'endDate', e.target.value)}
                    maxLength={WORK_FIELD_LIMITS.endDate}
                  />
                </div>
                {(missingStart || missingEnd) && (
                  <p className="text-xs text-red-500">请填写开始/结束时间（结束可填“至今”）</p>
                )}
              </div>
              <div className="relative">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-600 dark:text-text-secondary uppercase tracking-wider">工作内容（可选）</label>
                  <span className="text-xs text-slate-400">{descLen}/{WORK_FIELD_LIMITS.description}</span>
                </div>
                <textarea
                  className="w-full rounded-lg bg-white dark:bg-[#111a22] border border-slate-300 dark:border-[#324d67] text-slate-900 dark:text-white px-4 py-3 placeholder:text-slate-400 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none resize-none transition-all leading-relaxed shadow-sm"
                  placeholder="描述您的主要职责和业绩成就..."
                  rows={4}
                  value={exp.description}
                  onChange={(e) => onUpdate(exp.id, 'description', e.target.value)}
                  maxLength={WORK_FIELD_LIMITS.description}
                ></textarea>
              </div>
            </div>
          </div>
        );
      })}

      <button
        onClick={onAdd}
        className="mt-4 w-full py-3 rounded-lg border-2 border-dashed border-slate-300 dark:border-[#324d67] hover:border-primary/50 hover:bg-primary/5 text-slate-500 dark:text-text-secondary hover:text-primary transition-all flex items-center justify-center gap-2 font-medium"
      >
        <span className="material-symbols-outlined text-[20px]">add</span>
        添加工作经历
      </button>
      {showValidation && resumeData.workExps.length === 0 && (
        <p className="text-xs text-red-500 mt-2">请至少添加一条工作经历</p>
      )}
    </div>
  </details>
);

export default WorkStep;
