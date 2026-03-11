import React from 'react';
import { ResumeData } from '../../../types';
import { PERSONAL_FIELD_LIMITS } from '../../../src/editor-field-limits';
import StepShell from '../shared/StepShell';
import FormField from '../shared/FormField';
import FormInput from '../shared/FormInput';
import FormSelect from '../shared/FormSelect';

type PersonalStepProps = {
  resumeData: ResumeData;
  isComplete: boolean;
  onInfoChange: (field: keyof ResumeData['personalInfo'] | 'gender', value: string) => void;
  showValidation?: boolean;
  formatErrors?: Record<string, string>;
};

const PersonalStep: React.FC<PersonalStepProps> = ({ resumeData, isComplete, onInfoChange, showValidation, formatErrors = {} }) => (
  <StepShell
    title="个人信息"
    icon="person"
    isComplete={isComplete}
    isOpen={true}
  >
    <div className="grid gap-4 pt-4">
      <div className="flex flex-col gap-2">
        <label className="text-xs font-bold text-slate-600 dark:text-text-secondary uppercase tracking-wider">上传证件照（可选）</label>
        <div className="flex items-center gap-4">
          <div className="relative size-20 rounded-full border border-slate-300 dark:border-white/10 bg-white dark:bg-white/5 flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
            {resumeData.personalInfo.avatar ? (
              <img
                src={resumeData.personalInfo.avatar}
                alt="Avatar"
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="material-symbols-outlined text-3xl text-slate-300 dark:text-white/20">person</span>
            )}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onloadend = () => {
                    onInfoChange('avatar', reader.result as string);
                  };
                  reader.readAsDataURL(file);
                }
              }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              title="Upload Photo"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700 dark:text-white">点击头像上传</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">支持 JPG, PNG</span>
          </div>
        </div>
      </div>

      <FormField
        label="姓名 *"
        error={(showValidation && !resumeData.personalInfo.name ? "请填写姓名" : "") || formatErrors.name}
      >
        <FormInput
          type="text"
          value={resumeData.personalInfo.name}
          onChange={(e) => onInfoChange('name', e.target.value)}
          maxLength={PERSONAL_FIELD_LIMITS.name}
          hasError={(showValidation && !resumeData.personalInfo.name) || !!formatErrors.name}
        />
      </FormField>

      <FormField
        label="求职意向 *"
        error={(showValidation && !resumeData.personalInfo.title ? "请填写求职意向" : "") || formatErrors.title}
      >
        <FormInput
          type="text"
          value={resumeData.personalInfo.title}
          onChange={(e) => onInfoChange('title', e.target.value)}
          maxLength={PERSONAL_FIELD_LIMITS.title}
          hasError={(showValidation && !resumeData.personalInfo.title) || !!formatErrors.title}
        />
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <FormField
          label="性别 *"
          error={showValidation && !resumeData.gender && "请选择性别"}
        >
          <FormSelect
            value={resumeData.gender || ''}
            onChange={(e) => onInfoChange('gender', e.target.value)}
            hasError={showValidation && !resumeData.gender}
            required
          >
            <option value="">请选择</option>
            <option value="male">男</option>
            <option value="female">女</option>
          </FormSelect>
        </FormField>

        <FormField label="年龄">
          <FormInput
            type="text"
            value={resumeData.personalInfo.age || ''}
            onChange={(e) => onInfoChange('age', e.target.value)}
            maxLength={PERSONAL_FIELD_LIMITS.age}
          />
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField
          label="电子邮箱 *"
          error={(showValidation && !resumeData.personalInfo.email ? "请填写电子邮箱" : "") || formatErrors.email}
        >
          <FormInput
            type="email"
            value={resumeData.personalInfo.email}
            onChange={(e) => onInfoChange('email', e.target.value)}
            maxLength={PERSONAL_FIELD_LIMITS.email}
            hasError={(showValidation && !resumeData.personalInfo.email) || !!formatErrors.email}
          />
        </FormField>
        <FormField
          label="电话号码 *"
          error={(showValidation && !resumeData.personalInfo.phone ? "请填写电话号码" : "") || formatErrors.phone}
        >
          <FormInput
            type="tel"
            value={resumeData.personalInfo.phone}
            onChange={(e) => onInfoChange('phone', e.target.value)}
            maxLength={PERSONAL_FIELD_LIMITS.phone}
            hasError={(showValidation && !resumeData.personalInfo.phone) || !!formatErrors.phone}
          />
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="所在城市">
          <FormInput
            type="text"
            value={resumeData.personalInfo.location || ''}
            onChange={(e) => onInfoChange('location', e.target.value)}
            maxLength={PERSONAL_FIELD_LIMITS.location}
            placeholder="如：上海"
          />
        </FormField>
        <FormField label="LinkedIn">
          <FormInput
            type="text"
            value={resumeData.personalInfo.linkedin || ''}
            onChange={(e) => onInfoChange('linkedin', e.target.value)}
            maxLength={PERSONAL_FIELD_LIMITS.linkedin}
            placeholder="linkedin.com/in/..."
          />
        </FormField>
      </div>

      <FormField label="个人网址">
        <FormInput
          type="text"
          value={resumeData.personalInfo.website || ''}
          onChange={(e) => onInfoChange('website', e.target.value)}
          maxLength={PERSONAL_FIELD_LIMITS.website}
          placeholder="https://your-portfolio.com"
        />
      </FormField>
    </div>
  </StepShell>
);

export default PersonalStep;
