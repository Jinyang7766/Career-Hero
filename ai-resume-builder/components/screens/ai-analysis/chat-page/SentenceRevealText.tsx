import React from 'react';

const splitSentences = (input: string) => {
  const source = String(input || '').trim();
  if (!source) return [];
  const matches = source.match(/[^。！？!?；;]+[。！？!?；;]?/g);
  if (!matches) return [source];
  return matches.map((segment) => segment.trim()).filter(Boolean);
};

type Props = {
  text: string;
  enabled?: boolean;
  stepDelayMs?: number;
};

export const SentenceRevealText: React.FC<Props> = ({
  text,
  enabled = false,
  stepDelayMs = 420,
}) => {
  const segments = React.useMemo(() => splitSentences(text), [text]);
  const [visibleCount, setVisibleCount] = React.useState(() => (enabled ? Math.min(1, segments.length) : segments.length));

  React.useEffect(() => {
    if (!enabled) {
      setVisibleCount(segments.length);
      return;
    }
    setVisibleCount(Math.min(1, segments.length));
    if (segments.length <= 1) return;
    const timers: number[] = [];
    for (let i = 1; i < segments.length; i += 1) {
      const timer = window.setTimeout(() => {
        setVisibleCount((prev) => Math.max(prev, i + 1));
      }, i * stepDelayMs);
      timers.push(timer);
    }
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [enabled, segments, stepDelayMs]);

  const visibleText = segments.slice(0, visibleCount).join('');
  const showCursor = enabled && visibleCount < segments.length;

  return (
    <div className="whitespace-pre-wrap">
      {visibleText}
      {showCursor && <span className="ml-0.5 inline-block animate-pulse opacity-70">|</span>}
    </div>
  );
};

