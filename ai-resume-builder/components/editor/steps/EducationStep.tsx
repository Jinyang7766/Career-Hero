import React from 'react';
import { ResumeData, Education } from '../../../types';

type EducationStepProps = {
  resumeData: ResumeData;
  isComplete: boolean;
  wizardMode: boolean;
  onAdd: () => void;
  onRemove: (id: number) => void;
  onUpdate: (id: number, field: keyof Education, value: string) => void;
  showValidation?: boolean;
};

const EducationStep: React.FC<EducationStepProps> = ({ resumeData, isComplete, wizardMode, onAdd, onRemove, onUpdate, showValidation }) => (
  <details className="group bg-white dark:bg-surface-dark rounded-xl shadow-sm border border-slate-200 dark:border-[#324d67] overflow-hidden transition-all duration-300" open={wizardMode}>
    <summary className="flex cursor-pointer items-center justify-between p-4 bg-white dark:bg-surface-dark hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
      <div className="flex items-center gap-3">
        <div className={`flex items-center justify-center size-8 rounded-full ${isComplete ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'}`}>
          <span className="material-symbols-outlined text-[18px]">{isComplete ? 'check' : 'school'}</span>
        </div>
        <span className="font-semibold text-slate-900 dark:text-white">教育背景 *</span>
      </div>
      <span className="material-symbols-outlined text-slate-400 group-open:rotate-180 transition-transform duration-300">expand_more</span>
    </summary>
    <div className="p-4 pt-0 border-t border-slate-100 dark:border-white/5 mt-2">
      {resumeData.educations.map((edu, index) => {
        const missingSchool = showValidation && !edu.title;
        const missingMajor = showValidation && !edu.subtitle;
        const missingDegree = showValidation && !edu.degree;
        const missingStart = showValidation && !edu.startDate;
        const missingEnd = showValidation && !edu.endDate;
        return (
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
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-slate-500 dark:text-text-secondary uppercase tracking-wider">学校名称 *</label>
              <input
                className={`w-full rounded-lg bg-slate-50 dark:bg-[#111a22] border px-4 py-3 placeholder:text-slate-400 outline-none transition-all focus:ring-2 ${
                  missingSchool
                    ? 'border-red-400 focus:ring-red-400/50 focus:border-red-400'
                    : 'border-slate-200 dark:border-[#324d67] focus:ring-primary/50 focus:border-primary'
                } text-slate-900 dark:text-white`}
                placeholder="学校名称"
                type="text"
                value={edu.title}
                onChange={(e) => onUpdate(edu.id, 'title', e.target.value)}
              />
              {missingSchool && <p className="text-xs text-red-500">请填写学校名称</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-slate-500 dark:text-text-secondary uppercase tracking-wider">专业 *</label>
                <input
                  className={`w-full rounded-lg bg-slate-50 dark:bg-[#111a22] border px-4 py-3 placeholder:text-slate-400 outline-none transition-all focus:ring-2 ${
                    missingMajor
                      ? 'border-red-400 focus:ring-red-400/50 focus:border-red-400'
                      : 'border-slate-200 dark:border-[#324d67] focus:ring-primary/50 focus:border-primary'
                  } text-slate-900 dark:text-white`}
                  placeholder="专业"
                  type="text"
                  value={edu.subtitle}
                  onChange={(e) => onUpdate(edu.id, 'subtitle', e.target.value)}
                />
                {missingMajor && <p className="text-xs text-red-500">请填写专业</p>}
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-slate-500 dark:text-text-secondary uppercase tracking-wider">学历 *</label>
                <input
                  className={`w-full rounded-lg bg-slate-50 dark:bg-[#111a22] border px-4 py-3 placeholder:text-slate-400 outline-none transition-all focus:ring-2 ${
                    missingDegree
                      ? 'border-red-400 focus:ring-red-400/50 focus:border-red-400'
                      : 'border-slate-200 dark:border-[#324d67] focus:ring-primary/50 focus:border-primary'
                  } text-slate-900 dark:text-white`}
                  placeholder="本科 / 硕士"
                  type="text"
                  value={edu.degree || ''}
                  onChange={(e) => onUpdate(edu.id, 'degree', e.target.value)}
                />
                {missingDegree && <p className="text-xs text-red-500">请填写学历</p>}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-slate-500 dark:text-text-secondary uppercase tracking-wider">就读时间 *</label>
              <div className="flex items-center gap-2">
                <input
                  className={`w-full rounded-lg bg-slate-50 dark:bg-[#111a22] border px-4 py-3 placeholder:text-slate-400 outline-none transition-all focus:ring-2 ${
                    missingStart
                      ? 'border-red-400 focus:ring-red-400/50 focus:border-red-400'
                      : 'border-slate-200 dark:border-[#324d67] focus:ring-primary/50 focus:border-primary'
                  } text-slate-900 dark:text-white`}
                  placeholder="开始时间"
                  type="text"
                  value={edu.startDate || ''}
                  onChange={(e) => onUpdate(edu.id, 'startDate', e.target.value)}
                />
                <span className="text-slate-400">-</span>
                <input
                  className={`w-full rounded-lg bg-slate-50 dark:bg-[#111a22] border px-4 py-3 placeholder:text-slate-400 outline-none transition-all focus:ring-2 ${
                    missingEnd
                      ? 'border-red-400 focus:ring-red-400/50 focus:border-red-400'
                      : 'border-slate-200 dark:border-[#324d67] focus:ring-primary/50 focus:border-primary'
                  } text-slate-900 dark:text-white`}
                  placeholder="结束时间"
                  type="text"
                  value={edu.endDate || ''}
                  onChange={(e) => onUpdate(edu.id, 'endDate', e.target.value)}
                />
              </div>
              {(missingStart || missingEnd) && (
                <p className="text-xs text-red-500">请填写开始/结束时间</p>
              )}
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
        添加教育背景
      </button>
      {showValidation && resumeData.educations.length === 0 && (
        <p className="text-xs text-red-500 mt-2">请至少添加一条教育背景</p>
      )}
    </div>
  </details>
);

export default EducationStep;
