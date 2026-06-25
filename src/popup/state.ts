import { signal, computed } from '@preact/signals';

export interface Episode {
  id?: string;
  eid?: string;
  title?: string;
  podcastId?: string;
  podcastName?: string;
  podcastTitle?: string;
  coverUrl?: string;
  audioUrl?: string;
  feedUrl?: string;
  duration?: number;
  pubDate?: string;
  description?: string;
  guid?: string;
  url?: string;
  lastPosition?: number;
  listenedDuration?: number;
  isExternal?: boolean;
  isNew?: boolean;
}

export interface Podcast {
  id?: string;
  pid?: string;
  title?: string;
  name?: string;
  author?: string;
  coverUrl?: string;
  feedUrl?: string;
  description?: string;
  episodeCount?: number;
  subscribedAt?: number | null;
  lastFetchedAt?: number;
  latestPubDate?: string;
  // Watermark for unread tracking: the pubDate (ms) of the newest episode the
  // user has seen/played. Episodes with pubDate newer than this are "unread".
  lastReadPubDate?: number;
  updatedAt?: number;
  isExternal?: boolean;
}

export interface PlaybackState {
  playing: boolean;
  loading?: boolean;
  currentTime: number;
  duration: number;
  speed: number;
  volume: number;
  episode: Episode | null;
  error?: string;
}

export interface Settings {
  theme?: string;
  locale?: string;
  updateFrequency?: number;
  notificationsEnabled?: boolean;
  autoPlayNext?: boolean;
  defaultSpeed?: number;
  panelMode?: 'popup' | 'sidepanel';
}

// Available playback speeds, shared by the settings "default speed" picker
// and the expanded player's speed toggle so the two never drift. Keep this
// small — too many steps makes the cycle button tedious.
export const PLAYBACK_SPEEDS = [1, 1.5, 2];

export const currentTab = signal<'home' | 'mine'>('home');
export const playbackState = signal<PlaybackState | null>(null);
export const settings = signal<Settings>({});
export const subscriptions = signal<Podcast[]>([]);
export const favorites = signal<any[]>([]);
export const playlist = signal<Episode[]>([]);
export const playlistIndex = signal(-1);
export const searchHistory = signal<string[]>([]);

export const currentPage = signal<string | null>(null);
export const previousPage = signal<string | null>(null);
export const currentPodcastId = signal<string | null>(null);
export const currentFeedUrl = signal<string | null>(null);
export const isExpandedPlayerOpen = signal(false);
export const isPlaylistOpen = signal(false);

// --- Cross-component coordination signals ---
// Overrides the mini-player title briefly (e.g. playback error messages).
export const miniTitleOverride = signal('');
// Incremented to ask the Mine page to re-fetch its subscription list.
export const mineRefreshTick = signal(0);
// Incremented to ask the Mine page to refresh WebDAV sync status.
export const webdavSyncTick = signal(0);
// Incremented whenever a favorite is added/removed from anywhere (episode
// list, expanded player, etc.) so the Favorites page can re-fetch and stay
// in sync instead of showing a stale list.
export const favoritesRefreshTick = signal(0);
// Prefill string for the search input (set when opening the search page from
// an external-podcast "find on XYZ" action).
export const searchPrefill = signal('');

export const hasActivePlayback = computed(() =>
  playbackState.value?.episode != null
);
