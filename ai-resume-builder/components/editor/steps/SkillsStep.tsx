import React from 'react';
import { ResumeData } from '../../../types';

type SkillsStepProps = {
  resumeData: ResumeData;
  isComplete: boolean;
  wizardMode: boolean;
  newSkill: string;
  onNewSkillChange: (value: string) => void;
  onAddSkill: () => void;
  onRemoveSkill: (index: number) => void;
};

const SkillsStep: React.FC<SkillsStepProps> = ({
  resumeData,
  isComplete,
  wizardMode,
  newSkill,
  onNewSkillChange,
  onAddSkill,
  onRemoveSkill,
}) => (
  <details className="group bg-white dark:bg-surface-dark rounded-xl shadow-sm border border-slate-200 dark:border-[#324d67] overflow-hidden transition-all duration-300" open={wizardMode}>
    <summary className="flex cursor-pointer items-center justify-between p-4 bg-white dark:bg-surface-dark hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
      <div className="flex items-center gap-3">
        <div className={`flex items-center justify-center size-8 rounded-full ${isComplete ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'}`}>
          <span className="material-symbols-outlined text-[18px]">{isComplete ? 'check' : 'extension'}</span>
        </div>
        <span className="font-semibold text-slate-900 dark:text-white">专业技能</span>
      </div>
      <span className="material-symbols-outlined text-slate-400 group-open:rotate-180 transition-transform duration-300">expand_more</span>
    </summary>
    <div className="p-4 pt-0 border-t border-slate-100 dark:border-white/5 mt-2">
      <div className="mt-4 flex flex-wrap gap-2 mb-4">
        {resumeData.skills.map((skill, index) => (
          <span key={index} className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-primary/10 text-primary border border-primary/20 animate-in zoom-in duration-200">
            {skill}
            <button
              onClick={() => onRemoveSkill(index)}
              className="ml-1.5 hover:text-blue-700 flex items-center justify-center"
            >
              <span className="material-symbols-outlined text-[14px]">close</span>
            </button>
          </span>
        ))}
      </div>
      <div className="relative">
        <input
          value={newSkill}
          onChange={(e) => onNewSkillChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onAddSkill();
            }
          }}
          className="w-full rounded-lg bg-slate-50 dark:bg-[#111a22] border border-slate-200 dark:border-[#324d67] text-slate-900 dark:text-white px-4 py-3 pr-10 placeholder:text-slate-400 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all"
          placeholder="添加技能 (例如: 领导力)"
          type="text"
        />
        <button
          onClick={onAddSkill}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-primary hover:bg-primary/10 p-1 rounded-md transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">add_circle</span>
        </button>
      </div>
    </div>
  </details>
);

export default SkillsStep;
