import React from 'react';

interface FormSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  hasError?: boolean;
}

const FormSelect: React.FC<FormSelectProps> = ({ hasError, className = '', children, ...props }) => {
  const baseClass = "w-full rounded-lg bg-white dark:bg-[#111a22] border px-4 py-3 outline-none transition-all focus:ring-2 appearance-none shadow-sm";
  const errorClass = "border-red-400 focus:ring-red-400/50 focus:border-red-400";
  const normalClass = "border-slate-300 dark:border-[#324d67] focus:ring-primary/50 focus:border-primary";
  
  return (
    <div className="relative">
      <select
        className={`${baseClass} ${hasError ? errorClass : normalClass} text-slate-900 dark:text-white pr-10 ${className}`}
        {...props}
      >
        {children}
      </select>
      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
        <span className="material-symbols-outlined text-[20px]">expand_more</span>
      </div>
    </div>
  );
};

export default FormSelect;
