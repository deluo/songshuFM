import { signal } from '@preact/signals';
import type { Podcast } from '../state';

// Shared subscription sort preference + logic.
//
// The subscription management page lets the user pick a sort key/direction,
// and that choice is also applied to the "Mine" page's subscription preview
// so the two pages never disagree on order. Kept here (rather than inside
// either page) so there's a single source of truth.

export type SortKey = 'subscribedAt' | 'name' | 'episodeCount' | 'updatedAt';
export type SortDir = 'asc' | 'desc';

export const SORT_STORAGE_KEY = 'submgmt_sort';

export const sortKey = signal<SortKey>('subscribedAt');
export const sortDir = signal<SortDir>('desc');

let loaded = false;

export function loadSortPref() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = localStorage.getItem(SORT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.key) sortKey.value = parsed.key;
      if (parsed.dir) sortDir.value = parsed.dir;
    }
  } catch {}
}

export function saveSortPref() {
  try {
    localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify({ key: sortKey.value, dir: sortDir.value }));
  } catch {}
}

// Apply the same sort the management page uses. Pure: returns a new array.
export function sortSubs(subs: Podcast[]): Podcast[] {
  loadSortPref();
  const key = sortKey.value;
  const dir = sortDir.value === 'asc' ? 1 : -1;
  return [...subs].sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case 'subscribedAt':
        cmp = (a.subscribedAt || 0) - (b.subscribedAt || 0);
        break;
      case 'name':
        cmp = (a.title || a.name || '').localeCompare(b.title || b.name || '');
        break;
      case 'episodeCount':
        cmp = (a.episodeCount || 0) - (b.episodeCount || 0);
        break;
      case 'updatedAt': {
        // Prefer latestPubDate when available (newer signal than updatedAt),
        // falling back to updatedAt. Matches old popup/pages/sub-mgmt.js.
        const aTime = a.latestPubDate ? new Date(a.latestPubDate).getTime() : (a.updatedAt || 0);
        const bTime = b.latestPubDate ? new Date(b.latestPubDate).getTime() : (b.updatedAt || 0);
        cmp = aTime - bTime;
        break;
      }
    }
    return cmp * dir;
  });
}
