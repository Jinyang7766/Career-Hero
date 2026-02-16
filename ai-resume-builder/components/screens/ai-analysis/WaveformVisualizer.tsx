import React from 'react';

type Props = {
  active: boolean;
  cancel: boolean;
  visualizerData: number[];
};

const WaveformVisualizer: React.FC<Props> = ({ active, cancel, visualizerData }) => {
  return (
    <div className="flex items-center justify-center gap-[3px] h-8 overflow-hidden">
      {visualizerData.map((val, i) => {
        const height = cancel ? 4 : (active ? Math.max(4, val / 1.5) : 4);
        return (
          <div
            key={i}
            className="w-1 rounded-full transition-all duration-75 bg-white"
            style={{
              height: `${height}px`,
              opacity: cancel ? 0.3 : (active ? 1 : 0.3),
            }}
          />
        );
      })}
    </div>
  );
};

export default WaveformVisualizer;
