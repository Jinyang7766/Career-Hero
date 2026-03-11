import React from 'react';
import { ResumeData, ExperienceItem } from '../../../types';
import { PROJECT_FIELD_LIMITS } from '../../../src/editor-field-limits';
import StepShell from '../shared/StepShell';
import EntryShell from '../shared/EntryShell';
import FormField from '../shared/FormField';
import FormInput from '../shared/FormInput';
import FormTextArea from '../shared/FormTextArea';

type ProjectsStepProps = {
  resumeData: ResumeData;
  isComplete: boolean;
  wizardMode: boolean;
  onAdd: () => void;
  onRemove: (id: number) => void;
  onUpdate: (id: number, field: keyof ExperienceItem, value: string) => void;
};

const ProjectsStep: React.FC<ProjectsStepProps> = ({ resumeData, isComplete, wizardMode, onAdd, onRemove, onUpdate }) => (
  <StepShell
    title="项目经历（可选）"
    icon="rocket_launch"
    isComplete={isComplete}
    isOpen={wizardMode}
  >
    {resumeData.projects.length === 0 && (
      <p className="text-xs text-slate-400 dark:text-slate-500 py-2 italic text-center">暂无项目经历，点击下方按钮添加。</p>
    )}

    {resumeData.projects.map((proj, index) => {
      const descLen = String(proj.description || '').length;

      return (
        <EntryShell
          key={proj.id}
          title={`项目 ${index + 1}`}
          onRemove={() => onRemove(proj.id)}
        >
          <div className="grid gap-4">
            <FormField label="项目名称">
              <FormInput
                placeholder="项目名称"
                value={proj.title}
                onChange={(e) => onUpdate(proj.id, 'title', e.target.value)}
                maxLength={PROJECT_FIELD_LIMITS.title}
              />
            </FormField>

            <FormField label="担任角色">
              <FormInput
                placeholder="例如：核心开发 / 项目负责人"
                value={proj.subtitle}
                onChange={(e) => onUpdate(proj.id, 'subtitle', e.target.value)}
                maxLength={PROJECT_FIELD_LIMITS.subtitle}
              />
            </FormField>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="开始时间">
                <FormInput
                  placeholder="开始时间"
                  value={proj.startDate}
                  onChange={(e) => onUpdate(proj.id, 'startDate', e.target.value)}
                  maxLength={PROJECT_FIELD_LIMITS.startDate}
                />
              </FormField>
              <FormField label="结束时间">
                <FormInput
                  placeholder="结束时间"
                  value={proj.endDate || ''}
                  onChange={(e) => onUpdate(proj.id, 'endDate', e.target.value)}
                  maxLength={PROJECT_FIELD_LIMITS.endDate}
                />
              </FormField>
            </div>

            <div className="relative">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-slate-600 dark:text-text-secondary uppercase tracking-wider">项目描述</label>
                <span className="text-xs text-slate-400">{descLen}/{PROJECT_FIELD_LIMITS.description}</span>
              </div>
              <FormTextArea
                placeholder="描述项目细节及您的贡献..."
                minRows={3}
                value={proj.description}
                onChange={(e) => onUpdate(proj.id, 'description', e.target.value)}
                maxLength={PROJECT_FIELD_LIMITS.description}
              />
            </div>
          </div>
        </EntryShell>
      );
    })}

    <button
      onClick={onAdd}
      className="mt-4 w-full py-3 rounded-lg border-2 border-dashed border-slate-300 dark:border-[#324d67] hover:border-primary/50 hover:bg-primary/5 text-slate-500 dark:text-text-secondary hover:text-primary transition-all flex items-center justify-center gap-2 font-medium"
    >
      <span className="material-symbols-outlined text-[20px]">add</span>
      添加项目经历
    </button>
  </StepShell>
);

export default ProjectsStep;
