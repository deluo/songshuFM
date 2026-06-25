// Pure filtering/sorting for the podcast-detail episode list. Kept side-effect
// free so it is trivially testable (see filter-episodes.test.ts) and reusable
// from both the popup and the future side-panel view (independent signals).

export type SortMode = 'new-old' | 'old-new';
export type StatusFilter = 'all' | 'unplayed' | 'in-progress' | 'played';

// 5s tolerance: a position within 5s of the end counts as finished. Matches the
// common "auto-mark-done near end" behavior podcast apps use.
const PLAYED_TOLERANCE_SEC = 5;

export function episodeStatus(pos: number, dur: number): Exclude<StatusFilter, 'all'> {
  if (dur > 0 && pos >= dur - PLAYED_TOLERANCE_SEC) return 'played';
  if (pos > PLAYED_TOLERANCE_SEC) return 'in-progress';
  return 'unplayed';
}

export interface FilterOptions {
  query: string;
  sortMode: SortMode;
  statusFilter: StatusFilter;
}

export interface FilterableEpisode {
  id?: string;
  eid?: string;
  title?: string;
  description?: string;
  pubDate?: string;
  duration?: number;
  lastPosition?: number;
}

export function filterEpisodes<T extends FilterableEpisode>(
  episodes: T[],
  opts: FilterOptions,
): T[] {
  const q = opts.query.trim().toLowerCase();
  let list = episodes;

  if (q) {
    // Match title only. The episode list renders just the title (no
    // description), so matching on description would surface rows whose
    // relevance the user can't see — keep it to what's visible.
    list = list.filter((e) => (e.title || '').toLowerCase().includes(q));
  }

  if (opts.statusFilter !== 'all') {
    list = list.filter((e) => {
      const status = episodeStatus(e.lastPosition || 0, e.duration || 0);
      return status === opts.statusFilter;
    });
  }

  // Copy before sort so we never mutate the caller's array.
  return [...list].sort((a, b) => {
    const at = new Date(a.pubDate || 0).getTime() || 0;
    const bt = new Date(b.pubDate || 0).getTime() || 0;
    return opts.sortMode === 'new-old' ? bt - at : at - bt;
  });
}
