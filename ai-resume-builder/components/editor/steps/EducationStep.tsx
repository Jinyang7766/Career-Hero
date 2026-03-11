import React from 'react';
import { ResumeData, Education } from '../../../types';
import { EDUCATION_FIELD_LIMITS } from '../../../src/editor-field-limits';
import StepShell from '../shared/StepShell';
import EntryShell from '../shared/EntryShell';
import FormField from '../shared/FormField';
import FormInput from '../shared/FormInput';

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
  <StepShell
    title="教育背景 *"
    icon="school"
    isComplete={isComplete}
    isOpen={wizardMode}
  >
    {resumeData.educations.map((edu, index) => {
      const missingSchool = showValidation && !edu.title;
      const missingMajor = showValidation && !edu.subtitle;
      const missingDegree = showValidation && !edu.degree;
      const missingStart = showValidation && !edu.startDate;
      const missingEnd = showValidation && !edu.endDate;

      return (
        <EntryShell
          key={edu.id}
          title={`教育背景 ${index + 1}`}
          onRemove={() => onRemove(edu.id)}
        >
          <div className="grid gap-4">
            <FormField label="学校名称 *" error={missingSchool && "请填写学校名称"}>
              <FormInput
                placeholder="学校名称"
                value={edu.title}
                onChange={(e) => onUpdate(edu.id, 'title', e.target.value)}
                maxLength={EDUCATION_FIELD_LIMITS.title}
                hasError={missingSchool}
              />
            </FormField>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="专业 *" error={missingMajor && "请填写专业"}>
                <FormInput
                  placeholder="专业"
                  value={edu.subtitle}
                  onChange={(e) => onUpdate(edu.id, 'subtitle', e.target.value)}
                  maxLength={EDUCATION_FIELD_LIMITS.subtitle}
                  hasError={missingMajor}
                />
              </FormField>
              <FormField label="学历 *" error={missingDegree && "请填写学历"}>
                <FormInput
                  placeholder="本科 / 硕士"
                  value={edu.degree || ''}
                  onChange={(e) => onUpdate(edu.id, 'degree', e.target.value)}
                  maxLength={EDUCATION_FIELD_LIMITS.degree}
                  hasError={missingDegree}
                />
              </FormField>
            </div>

            <FormField label="就读时间 *">
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <FormInput
                    placeholder="开始时间"
                    value={edu.startDate}
                    onChange={(e) => onUpdate(edu.id, 'startDate', e.target.value)}
                    maxLength={EDUCATION_FIELD_LIMITS.startDate}
                    hasError={missingStart}
                  />
                </div>
                <span className="text-slate-400">至</span>
                <div className="flex-1">
                  <FormInput
                    placeholder="毕业时间"
                    value={edu.endDate}
                    onChange={(e) => onUpdate(edu.id, 'endDate', e.target.value)}
                    maxLength={EDUCATION_FIELD_LIMITS.endDate}
                    hasError={missingEnd}
                  />
                </div>
              </div>
              {(missingStart || missingEnd) && (
                <p className="text-xs text-red-500">请填写完整的就读时间</p>
              )}
            </FormField>
          </div>
        </EntryShell>
      );
    })}

    <button
      onClick={onAdd}
      className="mt-4 w-full py-3 rounded-lg border-2 border-dashed border-slate-300 dark:border-[#324d67] hover:border-primary/50 hover:bg-primary/5 text-slate-500 dark:text-text-secondary hover:text-primary transition-all flex items-center justify-center gap-2 font-medium"
    >
      <span className="material-symbols-outlined text-[20px]">add</span>
      添加教育背景
    </button>
  </StepShell>
);

export default EducationStep;
