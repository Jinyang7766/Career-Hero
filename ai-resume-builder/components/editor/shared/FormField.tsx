import React from 'react';

interface FormFieldProps {
  label: string;
  error?: string | boolean;
  children: React.ReactNode;
  className?: string;
}

const FormField: React.FC<FormFieldProps> = ({ label, error, children, className = '' }) => {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <label className="text-xs font-bold text-slate-600 dark:text-text-secondary uppercase tracking-wider">
        {label}
      </label>
      {children}
      {error && typeof error === 'string' && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
};

export default FormField;
