import { SEARCH } from '../lib/constants';

// chrome.storage.local wrappers. Each hot-path key (settings, playingState,
// searchHistory) has a read-through in-memory cache invalidated by the global
// storage.onChanged listener — without it every GET_SETTINGS / GET_PLAYING_STATE
// on popup open + alarm tick would be a fresh round-trip (plus a SW wake on cold
// start). On MV3 SW recycling the module scope is lost, so a recycled SW simply
// re-reads once on first use.

const DEFAULT_SETTINGS: Record<string, any> = {
  updateFrequency: 60,
  notificationsEnabled: true,
  autoPlayNext: true,
  defaultSpeed: 1,
  panelMode: 'sidepanel',
};

let settingsCache: Record<string, any> | null = null;
let playingStateCache: any = undefined; // undefined = not loaded; null is a valid value
let searchHistoryCache: string[] | null = null;

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.settings) settingsCache = null;
  if (changes.playingState) playingStateCache = undefined;
  if (changes.searchHistory) searchHistoryCache = null;
});

export const settingsRepo = {
  async get(): Promise<Record<string, any>> {
    if (settingsCache) return settingsCache;
    const result = (await chrome.storage.local.get('settings')) as { settings?: Record<string, any> };
    settingsCache = { ...DEFAULT_SETTINGS, ...(result.settings || {}) };
    return settingsCache;
  },
  async update(partial: Record<string, any>): Promise<Record<string, any>> {
    const current = await this.get();
    const updated = { ...current, ...partial };
    await chrome.storage.local.set({ settings: updated });
    settingsCache = updated;
    return updated;
  },
};

export const playingStateRepo = {
  async get(): Promise<any> {
    if (playingStateCache !== undefined) return playingStateCache;
    const result = await chrome.storage.local.get('playingState');
    playingStateCache = result.playingState || null;
    return playingStateCache;
  },
  async set(state: any): Promise<void> {
    await chrome.storage.local.set({ playingState: state });
    playingStateCache = state;
  },
};

// Search result cache: query → { results, timestamp }. Entries expire after
// SEARCH.CACHE_TTL_MS; a stale read deletes the entry and returns null.
export const searchCacheRepo = {
  async get(query: string): Promise<any[] | null> {
    const result = await chrome.storage.local.get('searchCache');
    const cache: Record<string, any> = result.searchCache || {};
    const entry = cache[query];
    if (!entry) return null;
    if (Date.now() - entry.timestamp > SEARCH.CACHE_TTL_MS) {
      delete cache[query];
      await chrome.storage.local.set({ searchCache: cache });
      return null;
    }
    return entry.results;
  },
  async set(query: string, results: any[]): Promise<void> {
    const result = await chrome.storage.local.get('searchCache');
    const cache: Record<string, any> = result.searchCache || {};
    cache[query] = { results, timestamp: Date.now() };
    await chrome.storage.local.set({ searchCache: cache });
  },
};

// Search query history: most-recent-first, deduped, capped at SEARCH.HISTORY_LIMIT.
export const searchHistoryRepo = {
  async get(): Promise<string[]> {
    if (searchHistoryCache) return searchHistoryCache;
    const result = (await chrome.storage.local.get('searchHistory')) as { searchHistory?: string[] };
    searchHistoryCache = Array.isArray(result.searchHistory) ? result.searchHistory : [];
    return searchHistoryCache;
  },
  async add(query: string): Promise<void> {
    const history = await this.get();
    const filtered = history.filter((q) => q !== query);
    filtered.unshift(query);
    if (filtered.length > SEARCH.HISTORY_LIMIT) filtered.length = SEARCH.HISTORY_LIMIT;
    await chrome.storage.local.set({ searchHistory: filtered });
    searchHistoryCache = filtered;
  },
  async clear(): Promise<void> {
    await chrome.storage.local.set({ searchHistory: [] });
    searchHistoryCache = [];
  },
};

// Backwards-compatible named exports matching the old storage.ts surface, so
// importers in Task 2.8 can switch paths with minimal call-site churn.
export const getSettings = () => settingsRepo.get();
export const updateSettings = (partial: Record<string, any>) => settingsRepo.update(partial);
export const getPlayingState = () => playingStateRepo.get();
export const setPlayingState = (state: any) => playingStateRepo.set(state);
export const getSearchCache = (query: string) => searchCacheRepo.get(query);
export const setSearchCache = (query: string, results: any[]) => searchCacheRepo.set(query, results);
export const getSearchHistory = () => searchHistoryRepo.get();
export const addSearchHistory = (query: string) => searchHistoryRepo.add(query);
export const clearSearchHistory = () => searchHistoryRepo.clear();
