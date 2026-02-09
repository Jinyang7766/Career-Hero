import React from 'react';
import { ResumeData, ExperienceItem } from '../../../types';

type EducationStepProps = {
  resumeData: ResumeData;
  isComplete: boolean;
  wizardMode: boolean;
  onAdd: () => void;
  onRemove: (id: number) => void;
  onUpdate: (id: number, field: keyof ExperienceItem, value: string) => void;
};

const EducationStep: React.FC<EducationStepProps> = ({ resumeData, isComplete, wizardMode, onAdd, onRemove, onUpdate }) => (
  <details className="group bg-white dark:bg-surface-dark rounded-xl shadow-sm border border-slate-200 dark:border-[#324d67] overflow-hidden transition-all duration-300" open={wizardMode}>
    <summary className="flex cursor-pointer items-center justify-between p-4 bg-white dark:bg-surface-dark hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
      <div className="flex items-center gap-3">
        <div className={`flex items-center justify-center size-8 rounded-full ${isComplete ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'}`}>
          <span className="material-symbols-outlined text-[18px]">{isComplete ? 'check' : 'school'}</span>
        </div>
        <span className="font-semibold text-slate-900 dark:text-white">教育背景</span>
      </div>
      <span className="material-symbols-outlined text-slate-400 group-open:rotate-180 transition-transform duration-300">expand_more</span>
    </summary>
    <div className="p-4 pt-0 border-t border-slate-100 dark:border-white/5 mt-2">
      {resumeData.educations.map((edu, index) => (
        <div key={edu.id} className="mt-4 flex flex-col gap-4 pb-6 border-b border-slate-100 dark:border-white/5 last:border-0 relative">
          <div className="flex justify-between items-center">
            <h4 className="text-sm font-semibold text-primary uppercase tracking-wide">教育背景 {index + 1}</h4>
            <button
              onClick={() => onRemove(edu.id)}
              className="text-slate-400 hover:text-red-400 p-1"
            >
              <span className="material-symbols-outlined text-[18px]">delete</span>
            </button>
          </div>
          <div className="grid gap-4">
            <input
              className="w-full rounded-lg bg-slate-50 dark:bg-[#111a22] border border-slate-200 dark:border-[#324d67] text-slate-900 dark:text-white px-4 py-3 placeholder:text-slate-400 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all"
              placeholder="学校名称"
              type="text"
              value={edu.title}
              onChange={(e) => onUpdate(edu.id, 'title', e.target.value)}
            />
            <div className="grid grid-cols-2 gap-4">
              <input
                className="w-full rounded-lg bg-slate-50 dark:bg-[#111a22] border border-slate-200 dark:border-[#324d67] text-slate-900 dark:text-white px-4 py-3 placeholder:text-slate-400 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all"
                placeholder="专业/学位"
                type="text"
                value={edu.subtitle}
                onChange={(e) => onUpdate(edu.id, 'subtitle', e.target.value)}
              />
              <input
                className="w-full rounded-lg bg-slate-50 dark:bg-[#111a22] border border-slate-200 dark:border-[#324d67] text-slate-900 dark:text-white px-4 py-3 placeholder:text-slate-400 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all"
                placeholder="就读时间"
                type="text"
                value={edu.date}
                onChange={(e) => onUpdate(edu.id, 'date', e.target.value)}
              />
            </div>
          </div>
        </div>
      ))}

      <button
        onClick={onAdd}
        className="mt-4 w-full py-3 rounded-lg border-2 border-dashed border-slate-300 dark:border-[#324d67] hover:border-primary/50 hover:bg-primary/5 text-slate-500 dark:text-text-secondary hover:text-primary transition-all flex items-center justify-center gap-2 font-medium"
      >
        <span className="material-symbols-outlined text-[20px]">add</span>
        添加教育背景
      </button>
    </div>
  </details>
);

export default EducationStep;
