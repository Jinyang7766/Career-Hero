import React from 'react';

type BackButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: string;
  iconClassName?: string;
  ariaLabel?: string;
};

const BackButton: React.FC<BackButtonProps> = ({
  icon = 'arrow_back',
  className = '',
  iconClassName = '',
  ariaLabel = '返回',
  type = 'button',
  ...props
}) => {
  return (
    <button
      type={type}
      aria-label={ariaLabel}
      className={`flex size-10 items-center justify-center rounded-full text-slate-900 dark:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors ${className}`}
      {...props}
    >
      <span className={`material-symbols-outlined text-[24px] ${iconClassName}`}>{icon}</span>
    </button>
  );
};

export default BackButton;
