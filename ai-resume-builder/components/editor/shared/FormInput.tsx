import React from 'react';

interface FormInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
}

const FormInput: React.FC<FormInputProps> = ({ hasError, className = '', ...props }) => {
  const baseClass = "w-full rounded-lg bg-white dark:bg-[#111a22] border px-4 py-3 placeholder:text-slate-400 outline-none transition-all focus:ring-2 shadow-sm";
  const errorClass = "border-red-400 focus:ring-red-400/50 focus:border-red-400";
  const normalClass = "border-slate-300 dark:border-[#324d67] focus:ring-primary/50 focus:border-primary";
  
  return (
    <input
      className={`${baseClass} ${hasError ? errorClass : normalClass} text-slate-900 dark:text-white ${className}`}
      {...props}
    />
  );
};

export default FormInput;
