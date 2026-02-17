import React from 'react';
import { ResumeData, ExperienceItem } from '../../../types';
import { PROJECT_FIELD_LIMITS } from '../../../src/editor-field-limits';

type ProjectsStepProps = {
  resumeData: ResumeData;
  isComplete: boolean;
  wizardMode: boolean;
  onAdd: () => void;
  onRemove: (id: number) => void;
  onUpdate: (id: number, field: keyof ExperienceItem, value: string) => void;
};

const ProjectsStep: React.FC<ProjectsStepProps> = ({ resumeData, isComplete, wizardMode, onAdd, onRemove, onUpdate }) => (
  <details className="group bg-white dark:bg-surface-dark rounded-xl shadow-md border border-slate-200 dark:border-[#324d67] overflow-hidden transition-all duration-300" open={wizardMode}>
    <summary className="flex cursor-pointer items-center justify-between p-4 bg-white dark:bg-surface-dark hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
      <div className="flex items-center gap-3">
        <div className={`flex items-center justify-center size-8 rounded-full ${isComplete ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'}`}>
          <span className="material-symbols-outlined text-[18px]">{isComplete ? 'check' : 'rocket_launch'}</span>
        </div>
        <span className="font-semibold text-slate-900 dark:text-white">项目经历（可选）</span>
      </div>
      <span className="material-symbols-outlined text-slate-400 group-open:rotate-180 transition-transform duration-300">expand_more</span>
    </summary>
    <div className="p-4 pt-0 border-t border-slate-200 dark:border-white/5 mt-2">
      {resumeData.projects.length === 0 && (
        <p className="text-xs text-slate-400 dark:text-slate-500 py-2 italic text-center">暂无项目经历，点击下方按钮添加。</p>
      )}

      {resumeData.projects.map((proj, index) => {
        const descLen = String(proj.description || '').length;
        return (
          <div key={proj.id} className="mt-4 flex flex-col gap-4 pb-6 border-b border-slate-200 dark:border-white/5 last:border-0 relative">
            <div className="flex justify-between items-center">
              <h4 className="text-sm font-semibold text-primary uppercase tracking-wide">项目 {index + 1}</h4>
              <button
                onClick={() => onRemove(proj.id)}
                className="text-slate-400 hover:text-red-400 p-1"
              >
                <span className="material-symbols-outlined text-[18px]">delete</span>
              </button>
            </div>
            <div className="grid gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-600 dark:text-text-secondary uppercase tracking-wider">项目名称</label>
                <input
                  className="w-full rounded-lg bg-white dark:bg-[#111a22] border border-slate-300 dark:border-[#324d67] text-slate-900 dark:text-white px-4 py-3 placeholder:text-slate-400 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all shadow-sm"
                  placeholder="项目名称"
                  type="text"
                  value={proj.title}
                  onChange={(e) => onUpdate(proj.id, 'title', e.target.value)}
                  maxLength={PROJECT_FIELD_LIMITS.title}
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-600 dark:text-text-secondary uppercase tracking-wider">担任角色</label>
                <input
                  className="w-full rounded-lg bg-white dark:bg-[#111a22] border border-slate-300 dark:border-[#324d67] text-slate-900 dark:text-white px-4 py-3 placeholder:text-slate-400 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all shadow-sm"
                  placeholder="担任角色"
                  type="text"
                  value={proj.subtitle}
                  onChange={(e) => onUpdate(proj.id, 'subtitle', e.target.value)}
                  maxLength={PROJECT_FIELD_LIMITS.subtitle}
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-600 dark:text-text-secondary uppercase tracking-wider">项目时间</label>
                <div className="flex items-center gap-2">
                  <input
                    className="w-full rounded-lg bg-white dark:bg-[#111a22] border border-slate-300 dark:border-[#324d67] text-slate-900 dark:text-white px-4 py-3 placeholder:text-slate-400 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all shadow-sm"
                    placeholder="开始时间"
                    type="text"
                    value={proj.startDate || ''}
                    onChange={(e) => onUpdate(proj.id, 'startDate', e.target.value)}
                    maxLength={PROJECT_FIELD_LIMITS.startDate}
                  />
                  <span className="text-slate-400">-</span>
                  <input
                    className="w-full rounded-lg bg-white dark:bg-[#111a22] border border-slate-300 dark:border-[#324d67] text-slate-900 dark:text-white px-4 py-3 placeholder:text-slate-400 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all shadow-sm"
                    placeholder="结束时间"
                    type="text"
                    value={proj.endDate || ''}
                    onChange={(e) => onUpdate(proj.id, 'endDate', e.target.value)}
                    maxLength={PROJECT_FIELD_LIMITS.endDate}
                  />
                </div>
              </div>
              <div className="relative">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-600 dark:text-text-secondary uppercase tracking-wider">项目描述</label>
                  <span className="text-xs text-slate-400">{descLen}/{PROJECT_FIELD_LIMITS.description}</span>
                </div>
                <textarea
                  className="w-full rounded-lg bg-white dark:bg-[#111a22] border border-slate-300 dark:border-[#324d67] text-slate-900 dark:text-white px-4 py-3 placeholder:text-slate-400 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none resize-none transition-all leading-relaxed shadow-sm"
                  placeholder="描述项目细节及您的贡献..."
                  rows={3}
                  value={proj.description}
                  onChange={(e) => onUpdate(proj.id, 'description', e.target.value)}
                  maxLength={PROJECT_FIELD_LIMITS.description}
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
        添加项目经历
      </button>
    </div>
  </details>
);

export default ProjectsStep;
