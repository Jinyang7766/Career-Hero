import React from 'react';
import { ResumeData, ExperienceItem } from '../../../types';
import { WORK_FIELD_LIMITS } from '../../../src/editor-field-limits';
import StepShell from '../shared/StepShell';
import EntryShell from '../shared/EntryShell';
import FormField from '../shared/FormField';
import FormInput from '../shared/FormInput';
import FormTextArea from '../shared/FormTextArea';

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
  <StepShell
    title="工作经历 *"
    icon="work"
    isComplete={isComplete}
    isOpen={wizardMode}
  >
    {resumeData.workExps.map((exp, index) => {
      const missingTitle = showValidation && !exp.title;
      const missingSubtitle = showValidation && !exp.subtitle;
      const missingStart = showValidation && !exp.startDate;
      const missingEnd = showValidation && !exp.endDate;
      const descLen = String(exp.description || '').length;

      return (
        <EntryShell
          key={exp.id}
          title={`工作经历 ${index + 1}`}
          onRemove={() => onRemove(exp.id)}
        >
          <div className="grid gap-4">
            <FormField label="公司名称 *" error={missingTitle && "请填写公司名称"}>
              <FormInput
                placeholder="公司名称"
                value={exp.title}
                onChange={(e) => onUpdate(exp.id, 'title', e.target.value)}
                maxLength={WORK_FIELD_LIMITS.title}
                hasError={missingTitle}
              />
            </FormField>

            <FormField label="职位名称 *" error={missingSubtitle && "请填写职位名称"}>
              <FormInput
                placeholder="例如：高级前端开发工程师"
                value={exp.subtitle}
                onChange={(e) => onUpdate(exp.id, 'subtitle', e.target.value)}
                maxLength={WORK_FIELD_LIMITS.subtitle}
                hasError={missingSubtitle}
              />
            </FormField>

            <FormField label="在职时间 *">
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <FormInput
                    placeholder="开始时间"
                    value={exp.startDate}
                    onChange={(e) => onUpdate(exp.id, 'startDate', e.target.value)}
                    maxLength={WORK_FIELD_LIMITS.startDate}
                    hasError={missingStart}
                  />
                </div>
                <span className="text-slate-400">至</span>
                <div className="flex-1">
                  <FormInput
                    placeholder="结束时间"
                    value={exp.endDate}
                    onChange={(e) => onUpdate(exp.id, 'endDate', e.target.value)}
                    maxLength={WORK_FIELD_LIMITS.endDate}
                    hasError={missingEnd}
                  />
                </div>
              </div>
              {(missingStart || missingEnd) && (
                <p className="text-xs text-red-500">请填写完整的在职时间</p>
              )}
            </FormField>

            <div className="relative">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-slate-600 dark:text-text-secondary uppercase tracking-wider">工作描述</label>
                <span className="text-xs text-slate-400">{descLen}/{WORK_FIELD_LIMITS.description}</span>
              </div>
              <FormTextArea
                placeholder="描述您的职责及主要成就..."
                minRows={3}
                value={exp.description}
                onChange={(e) => onUpdate(exp.id, 'description', e.target.value)}
                maxLength={WORK_FIELD_LIMITS.description}
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
      添加工作经历
    </button>
  </StepShell>
);

export default WorkStep;
