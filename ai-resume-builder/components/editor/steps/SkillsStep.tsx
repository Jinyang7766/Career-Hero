import React from 'react';
import { ResumeData } from '../../../types';
import { SKILL_MAX_CHARS } from '../../../src/editor-field-limits';
import StepShell from '../shared/StepShell';
import FormInput from '../shared/FormInput';

type SkillsStepProps = {
  resumeData: ResumeData;
  isComplete: boolean;
  wizardMode: boolean;
  newSkill: string;
  onNewSkillChange: (value: string) => void;
  onAddSkill: () => void;
  onRemoveSkill: (index: number) => void;
  showValidation?: boolean;
};

const SkillsStep: React.FC<SkillsStepProps> = ({
  resumeData,
  isComplete,
  wizardMode,
  newSkill,
  onNewSkillChange,
  onAddSkill,
  onRemoveSkill,
  showValidation,
}) => (
  <StepShell
    title="专业技能 *"
    icon="extension"
    isComplete={isComplete}
    isOpen={wizardMode}
    shadow="sm"
  >
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
    <div>
      <div className="flex flex-col gap-2">
        <label className="text-xs font-bold text-slate-600 dark:text-text-secondary uppercase tracking-wider">添加技能</label>
        <div className="flex gap-2">
          <FormInput
            className="flex-1"
            placeholder="例如：React, TypeScript, Node.js"
            type="text"
            value={newSkill}
            onChange={(e) => onNewSkillChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onAddSkill();
              }
            }}
            maxLength={SKILL_MAX_CHARS}
            hasError={showValidation && resumeData.skills.length === 0}
          />
          <button
            onClick={onAddSkill}
            className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-all font-medium flex items-center gap-2 shadow-md shadow-primary/20"
          >
            <span className="material-symbols-outlined text-[20px]">add</span>
            <span>添加</span>
          </button>
        </div>
        {showValidation && resumeData.skills.length === 0 && (
          <p className="text-xs text-red-500">请至少添加一项专业技能</p>
        )}
      </div>
    </div>
  </StepShell>
);

export default SkillsStep;
