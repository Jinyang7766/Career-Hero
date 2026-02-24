import React from 'react';

type AutoGrowTextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  minRows?: number;
};

const AutoGrowTextarea: React.FC<AutoGrowTextareaProps> = ({
  minRows = 3,
  value,
  style,
  onInput,
  onChange,
  ...rest
}) => {
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  const resize = React.useCallback(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.overflowY = 'hidden';
    node.style.height = `${node.scrollHeight}px`;
  }, []);

  React.useLayoutEffect(() => {
    resize();
  }, [value, resize]);

  return (
    <textarea
      {...rest}
      ref={textareaRef}
      rows={minRows}
      value={value}
      style={{ ...style, overflowY: 'hidden' }}
      onInput={(e) => {
        resize();
        onInput?.(e);
      }}
      onChange={(e) => {
        onChange?.(e);
        // Recalculate after controlled value update.
        requestAnimationFrame(resize);
      }}
    />
  );
};

export default AutoGrowTextarea;
