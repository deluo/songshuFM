// Unified theme application. Replaces the two divergent implementations that were
// in mine.tsx (dataset.theme) and app.tsx (setAttribute/removeAttribute). Callers
// should go through this single function so dark/light/system semantics stay in sync.

export function applyTheme(theme: string | undefined): void {
  const root = document.documentElement;
  const isDark = theme === 'dark' ||
    (theme !== 'light' && typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
  root.removeAttribute('data-theme');
  if (isDark) root.setAttribute('data-theme', 'dark');
}
