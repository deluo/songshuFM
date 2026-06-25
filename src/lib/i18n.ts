import { signal } from '@preact/signals';

let currentLocale = 'zh';
let translations: Record<string, string> = {};

// Reactive signal bumped whenever translations are (re)loaded. Components that
// display localized text read this in their render body so Preact re-renders
// them once the locale file finishes loading. t() itself can't reliably track
// it — a bare `localeVersion.value` read inside t() gets stripped by the
// bundler as dead code — so the dependency is wired up at the component level
// (see App in popup/app.tsx).
export const localeLoaded = signal(0);

// In-flight locale loads keyed by locale code. main.tsx preloads 'zh' before
// first render, then app.tsx calls initLocale(settings.locale) — without
// dedup that's two identical fetches back-to-back. A shared promise lets both
// callers await a single network round-trip.
const inflight = new Map<string, Promise<void>>();

export function initLocale(locale?: string): Promise<void> {
  const target = locale || 'zh';
  currentLocale = target;
  let p = inflight.get(target);
  if (!p) {
    p = (async () => {
      try {
        const url = chrome.runtime.getURL(`lib/locales/${target}.json`);
        const resp = await fetch(url);
        translations = await resp.json();
      } catch {
        translations = {};
      }
      // Only bump the version if this load is still the active locale — a
      // later initLocale(otherLocale) could have superseded us while fetching.
      if (currentLocale === target) localeLoaded.value++;
    })().finally(() => {
      inflight.delete(target);
    });
    inflight.set(target, p);
  }
  return p;
}

export function t(key: string, params: Record<string, string | number> = {}): string {
  let text = translations[key] || key;
  for (const [k, v] of Object.entries(params)) {
    text = text.replace(`{${k}}`, String(v));
  }
  return text;
}

export function getLocale(): string {
  return currentLocale;
}

export async function setLocale(locale: string): Promise<void> {
  currentLocale = locale;
  await initLocale(locale);
}
