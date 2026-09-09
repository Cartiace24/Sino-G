/** Device theme preference. Stored locally; defaults to the OS setting. */

export type Theme = 'light' | 'dark';

const KEY = 'sinog:theme';

export function getTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    /* private mode: fall through to OS preference */
  }
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* private mode: theme still applies for this session */
  }
  document.documentElement.dataset.theme = theme;
}

/** Apply the stored/OS theme. Called on boot (see index.html) and import. */
export function initTheme(): void {
  document.documentElement.dataset.theme = getTheme();
}
