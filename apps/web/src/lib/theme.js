import { useCallback, useEffect, useState } from 'react';

// Keep in sync with the inline script in index.html (prevents a light flash on load).
export const THEME_STORAGE_KEY = 'aqs-theme';

function readStoredTheme() {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'dark' || value === 'light' ? value : null;
  } catch {
    return null;
  }
}

export function getInitialTheme() {
  const stored = readStoredTheme();
  if (stored) return stored;

  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

export function useTheme() {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        /* Storage unavailable (private mode); the choice lasts for this session. */
      }
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
