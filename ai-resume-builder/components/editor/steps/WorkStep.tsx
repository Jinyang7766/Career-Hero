import React from 'react';
import { ResumeData, ExperienceItem } from '../../../types';

type WorkStepProps = {
  resumeData: ResumeData;
  isComplete: boolean;
  wizardMode: boolean;
  onAdd: () => void;
  onRemove: (id: number) => void;
  onUpdate: (id: number, field: keyof ExperienceItem, value: string) => void;
};

const WorkStep: React.FC<WorkStepProps> = ({ resumeData, isComplete, wizardMode, onAdd, onRemove, onUpdate }) => (
  <details className="group bg-white dark:bg-surface-dark rounded-xl shadow-sm border border-slate-200 dark:border-[#324d67] overflow-hidden transition-all duration-300" open={wizardMode}>
    <summary className="flex cursor-pointer items-center justify-between p-4 bg-white dark:bg-surface-dark hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
      <div className="flex items-center gap-3">
        <div className={`flex items-center justify-center size-8 rounded-full ${isComplete ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'}`}>
          <span className="material-symbols-outlined text-[18px]">{isComplete ? 'check' : 'work'}</span>
        </div>
        <span className="font-semibold text-slate-900 dark:text-white">工作经历</span>
      </div>
      <span className="material-symbols-outlined text-slate-400 group-open:rotate-180 transition-transform duration-300">expand_more</span>
    </summary>
    <div className="p-4 pt-0 border-t border-slate-100 dark:border-white/5 mt-2">
      {resumeData.workExps.map((exp, index) => (
        <div key={exp.id} className="mt-4 flex flex-col gap-4 pb-6 border-b border-slate-100 dark:border-white/5 last:border-0 relative">
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
            <input
              className="w-full rounded-lg bg-slate-50 dark:bg-[#111a22] border border-slate-200 dark:border-[#324d67] text-slate-900 dark:text-white px-4 py-3 placeholder:text-slate-400 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all"
              placeholder="公司名称"
              type="text"
              value={exp.title}
              onChange={(e) => onUpdate(exp.id, 'title', e.target.value)}
            />
            <div className="grid grid-cols-2 gap-4">
              <input
                className="w-full rounded-lg bg-slate-50 dark:bg-[#111a22] border border-slate-200 dark:border-[#324d67] text-slate-900 dark:text-white px-4 py-3 placeholder:text-slate-400 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all"
                placeholder="职位名称"
                type="text"
                value={exp.subtitle}
                onChange={(e) => onUpdate(exp.id, 'subtitle', e.target.value)}
              />
              <input
                className="w-full rounded-lg bg-slate-50 dark:bg-[#111a22] border border-slate-200 dark:border-[#324d67] text-slate-900 dark:text-white px-4 py-3 placeholder:text-slate-400 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all"
                placeholder="任职时间"
                type="text"
                value={exp.date}
                onChange={(e) => onUpdate(exp.id, 'date', e.target.value)}
              />
            </div>
            <div className="relative">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-slate-500 dark:text-text-secondary uppercase tracking-wider">工作内容</label>
              </div>
              <textarea
                className="w-full rounded-lg bg-slate-50 dark:bg-[#111a22] border border-slate-200 dark:border-[#324d67] text-slate-900 dark:text-white px-4 py-3 placeholder:text-slate-400 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none resize-none transition-all leading-relaxed"
                placeholder="描述您的主要职责和业绩成就..."
                rows={4}
                value={exp.description}
                onChange={(e) => onUpdate(exp.id, 'description', e.target.value)}
              ></textarea>
            </div>
          </div>
        </div>
      ))}

      <button
        onClick={onAdd}
        className="mt-4 w-full py-3 rounded-lg border-2 border-dashed border-slate-300 dark:border-[#324d67] hover:border-primary/50 hover:bg-primary/5 text-slate-500 dark:text-text-secondary hover:text-primary transition-all flex items-center justify-center gap-2 font-medium"
      >
        <span className="material-symbols-outlined text-[20px]">add</span>
        添加工作经历
      </button>
    </div>
  </details>
);

export default WorkStep;
