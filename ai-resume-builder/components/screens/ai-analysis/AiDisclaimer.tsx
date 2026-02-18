import React from 'react';

type Props = {
  className?: string;
};

const AiDisclaimer: React.FC<Props> = ({ className = '' }) => (
  <div className={`text-center ${className}`.trim()}>
    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium opacity-80">
      内容由AI生成，请注意核实
    </p>
  </div>
);

export default AiDisclaimer;
