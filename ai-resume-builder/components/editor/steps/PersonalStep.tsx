import React from 'react';
import { ResumeData } from '../../../types';

type PersonalStepProps = {
  resumeData: ResumeData;
  isComplete: boolean;
  onInfoChange: (field: keyof ResumeData['personalInfo'] | 'gender', value: string) => void;
  showValidation?: boolean;
  formatErrors?: Record<string, string>;
};

const PersonalStep: React.FC<PersonalStepProps> = ({ resumeData, isComplete, onInfoChange, showValidation, formatErrors = {} }) => (
  <details className="group bg-white dark:bg-surface-dark rounded-xl shadow-sm border border-slate-200 dark:border-[#324d67] overflow-hidden transition-all duration-300" open>
    <summary className="flex cursor-pointer items-center justify-between p-4 bg-white dark:bg-surface-dark hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
      <div className="flex items-center gap-3">
        <div className={`flex items-center justify-center size-8 rounded-full ${isComplete ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'}`}>
          <span className="material-symbols-outlined text-[18px]">{isComplete ? 'check' : 'person'}</span>
        </div>
        <span className="font-semibold text-slate-900 dark:text-white">个人信息</span>
      </div>
      <span className="material-symbols-outlined text-slate-400 group-open:rotate-180 transition-transform duration-300">expand_more</span>
    </summary>
    <div className="p-4 pt-0 border-t border-slate-100 dark:border-white/5 mt-2">
      <div className="grid gap-4 pt-4">
        {/* Avatar Upload */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-slate-500 dark:text-text-secondary uppercase tracking-wider">上传证件照（可选）</label>
          <div className="flex items-center gap-4">
            <div className="relative size-20 rounded-full border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 flex items-center justify-center overflow-hidden shrink-0">
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

        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-slate-500 dark:text-text-secondary uppercase tracking-wider">姓名 *</label>
          <input
            className={`w-full rounded-lg bg-slate-50 dark:bg-[#111a22] border px-4 py-3 outline-none transition-all focus:ring-2 ${showValidation && !resumeData.personalInfo.name
                ? 'border-red-400 focus:ring-red-400/50 focus:border-red-400'
                : formatErrors.name
                  ? 'border-red-400 focus:ring-red-400/50 focus:border-red-400'
                  : 'border-slate-200 dark:border-[#324d67] focus:ring-primary/50 focus:border-primary'
              } text-slate-900 dark:text-white`}
            type="text"
            value={resumeData.personalInfo.name}
            onChange={(e) => onInfoChange('name', e.target.value)}
          />
          {showValidation && !resumeData.personalInfo.name && (
            <p className="text-xs text-red-500">请填写姓名</p>
          )}
          {formatErrors.name && (
            <p className="text-xs text-red-500">{formatErrors.name}</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-slate-500 dark:text-text-secondary uppercase tracking-wider">求职意向 *</label>
          <input
            className={`w-full rounded-lg bg-slate-50 dark:bg-[#111a22] border px-4 py-3 outline-none transition-all focus:ring-2 ${showValidation && !resumeData.personalInfo.title
                ? 'border-red-400 focus:ring-red-400/50 focus:border-red-400'
                : formatErrors.title
                  ? 'border-red-400 focus:ring-red-400/50 focus:border-red-400'
                  : 'border-slate-200 dark:border-[#324d67] focus:ring-primary/50 focus:border-primary'
              } text-slate-900 dark:text-white`}
            type="text"
            value={resumeData.personalInfo.title}
            onChange={(e) => onInfoChange('title', e.target.value)}
          />
          {showValidation && !resumeData.personalInfo.title && (
            <p className="text-xs text-red-500">请填写求职意向</p>
          )}
          {formatErrors.title && (
            <p className="text-xs text-red-500">{formatErrors.title}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-slate-500 dark:text-text-secondary uppercase tracking-wider">电子邮箱 *</label>
            <input
              className={`w-full rounded-lg bg-slate-50 dark:bg-[#111a22] border px-4 py-3 outline-none transition-all focus:ring-2 ${showValidation && !resumeData.personalInfo.email
                  ? 'border-red-400 focus:ring-red-400/50 focus:border-red-400'
                  : formatErrors.email
                    ? 'border-red-400 focus:ring-red-400/50 focus:border-red-400'
                    : 'border-slate-200 dark:border-[#324d67] focus:ring-primary/50 focus:border-primary'
                } text-slate-900 dark:text-white`}
              type="email"
              value={resumeData.personalInfo.email}
              onChange={(e) => onInfoChange('email', e.target.value)}
            />
            {showValidation && !resumeData.personalInfo.email && (
              <p className="text-xs text-red-500">请填写电子邮箱</p>
            )}
            {formatErrors.email && (
              <p className="text-xs text-red-500">{formatErrors.email}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-slate-500 dark:text-text-secondary uppercase tracking-wider">电话号码 *</label>
            <input
              className={`w-full rounded-lg bg-slate-50 dark:bg-[#111a22] border px-4 py-3 outline-none transition-all focus:ring-2 ${showValidation && !resumeData.personalInfo.phone
                  ? 'border-red-400 focus:ring-red-400/50 focus:border-red-400'
                  : formatErrors.phone
                    ? 'border-red-400 focus:ring-red-400/50 focus:border-red-400'
                    : 'border-slate-200 dark:border-[#324d67] focus:ring-primary/50 focus:border-primary'
                } text-slate-900 dark:text-white`}
              type="tel"
              value={resumeData.personalInfo.phone}
              onChange={(e) => onInfoChange('phone', e.target.value)}
            />
            {showValidation && !resumeData.personalInfo.phone && (
              <p className="text-xs text-red-500">请填写电话号码</p>
            )}
            {formatErrors.phone && (
              <p className="text-xs text-red-500">{formatErrors.phone}</p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-slate-500 dark:text-text-secondary uppercase tracking-wider">性别 *</label>
          <div className="relative">
            <select
              value={resumeData.gender || ''}
              onChange={(e) => onInfoChange('gender', e.target.value)}
              className={`w-full rounded-lg bg-slate-50 dark:bg-[#111a22] border px-4 py-3 outline-none transition-all focus:ring-2 appearance-none ${showValidation && !resumeData.gender
                  ? 'border-red-400 focus:ring-red-400/50 focus:border-red-400'
                  : 'border-slate-200 dark:border-[#324d67] focus:ring-primary/50 focus:border-primary'
                } text-slate-900 dark:text-white pr-10`}
              required
            >
              <option value="">请选择</option>
              <option value="male">男</option>
              <option value="female">女</option>
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
              <span className="material-symbols-outlined text-[20px]">expand_more</span>
            </div>
          </div>
          {showValidation && !resumeData.gender && (
            <p className="text-xs text-red-500">请选择性别</p>
          )}
        </div>
      </div>
    </div>
  </details>
);

export default PersonalStep;
