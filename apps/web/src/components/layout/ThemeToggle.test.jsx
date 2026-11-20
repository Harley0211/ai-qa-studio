import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { THEME_STORAGE_KEY } from '../../lib/theme.js';
import { mockApi, project, renderRoute } from '../../test/utils.jsx';

const html = document.documentElement;

function stubPrefersDark(prefersDark) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query) => ({ matches: prefersDark && query.includes('dark'), media: query })),
  );
}

// localStorage is not available in this test environment, so use an in-memory one.
function stubLocalStorage() {
  const store = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  });
}

beforeEach(() => {
  stubLocalStorage();
  html.classList.remove('dark');
  mockApi({ 'GET /api/projects': { items: [project()], total: 1 } });
});

afterEach(() => {
  html.classList.remove('dark');
});

describe('Dark mode toggle', () => {
  it('starts in light mode and switches to dark mode, remembering the choice', async () => {
    const user = userEvent.setup();
    renderRoute('/projects');

    await screen.findByText('Alpha');
    expect(html).not.toHaveClass('dark');

    // Mobile header and sidebar each render a toggle; they share one state.
    const [toggle] = screen.getAllByRole('button', { name: 'Switch to dark mode' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await user.click(toggle);

    expect(html).toHaveClass('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(screen.getAllByRole('button', { name: 'Switch to light mode' })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Switch to dark mode' })).not.toBeInTheDocument();
  });

  it('switches back to light mode', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    renderRoute('/projects');

    await screen.findByText('Alpha');
    expect(html).toHaveClass('dark');

    await user.click(screen.getAllByRole('button', { name: 'Switch to light mode' })[0]);

    expect(html).not.toHaveClass('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('follows the OS preference when nothing is saved', async () => {
    stubPrefersDark(true);
    renderRoute('/projects');

    await screen.findByText('Alpha');
    expect(html).toHaveClass('dark');
  });

  it('prefers the saved choice over the OS preference', async () => {
    stubPrefersDark(true);
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    renderRoute('/projects');

    await screen.findByText('Alpha');
    expect(html).not.toHaveClass('dark');
  });
});
