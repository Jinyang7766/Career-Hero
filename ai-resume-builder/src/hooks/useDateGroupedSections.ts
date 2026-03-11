import { useState } from 'react';

const isSameDay = (left: Date, right: Date) => (
  left.getFullYear() === right.getFullYear()
  && left.getMonth() === right.getMonth()
  && left.getDate() === right.getDate()
);

export const formatRelativeDateLabel = (iso: string, invalidDateLabel = '较早之前') => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return invalidDateLabel;

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (isSameDay(d, today)) return '今天';
  if (isSameDay(d, yesterday)) return '昨天';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

type UseDateGroupedSectionsOptions<T> = {
  getDate: (item: T) => string;
  invalidDateLabel?: string;
};

export const useDateGroupedSections = <T>(
  items: T[],
  options: UseDateGroupedSectionsOptions<T>
) => {
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const { getDate, invalidDateLabel = '较早之前' } = options;

  const grouped = items.reduce<Record<string, T[]>>((acc, item) => {
    const label = formatRelativeDateLabel(getDate(item), invalidDateLabel);
    acc[label] = acc[label] || [];
    acc[label].push(item);
    return acc;
  }, {});

  const toggleSection = (label: string) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [label]: !prev[label],
    }));
  };

  return {
    groupedEntries: Object.entries(grouped),
    collapsedSections,
    toggleSection,
  };
};
