import { useEffect } from 'react';

type Params = {
  theme: 'light' | 'dark' | 'system';
  setResolvedTheme: (next: 'light' | 'dark') => void;
};

export const useThemeSync = ({ theme, setResolvedTheme }: Params) => {
  useEffect(() => {
    const updateTheme = () => {
      let activeTheme: 'light' | 'dark' = 'dark';

      if (theme === 'system') {
        activeTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      } else {
        activeTheme = theme;
      }

      setResolvedTheme(activeTheme);

      if (activeTheme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      localStorage.setItem('theme', theme);
    };

    updateTheme();

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => updateTheme();
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    }
  }, [setResolvedTheme, theme]);
};

