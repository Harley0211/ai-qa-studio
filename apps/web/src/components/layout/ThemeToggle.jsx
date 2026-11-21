import { Moon, Sun } from 'lucide-react';
import { IconButton } from '../ui/Button.jsx';

export function ThemeToggle({ theme, onToggle, className = '' }) {
  const isDark = theme === 'dark';

  return (
    <IconButton
      icon={isDark ? Sun : Moon}
      label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={isDark}
      onClick={onToggle}
      className={className}
    />
  );
}
