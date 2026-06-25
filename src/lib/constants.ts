// Centralized magic numbers and strings. Imported across layers.
// Consolidating these here prevents the duplicated literals (5000ms debounce,
// 'check-updates' alarm name, etc.) that previously drifted across files.

// Feed / fetch
export const STALE_FEED_THRESHOLD_MS = 30 * 60 * 1000; // 30 min — a cached feed is stale past this
export const FEED_FETCH_TIMEOUT_MS = 30 * 1000;        // abort a hanging feed fetch

// Persistence / broadcast cadence
export const WRITE_BUFFER_INTERVAL_MS = 5000;          // debounce for batched IDB writes
export const STATE_BROADCAST_INTERVAL_MS = 1000;       // offscreen → SW/UI state push interval
export const PLAYING_STATE_PERSIST_MS = 2000;          // debounce for persisting playingState

// Offscreen lifecycle
export const OFFSCREEN_READY_TIMEOUT_MS = 2000;        // wait for OFFSCREEN_READY before forwarding

// Sync
export const SYNC_THROTTLE_MS = 3 * 60 * 1000;         // min interval between auto-syncs
export const SYNC_VERSION = 1;                          // version field inside sync.json payload

// Chrome alarm names (kept in sync with service-worker + sync-observer)
export const ALARM = {
  UPDATES: 'check-updates',
  PERIODIC_SYNC: 'periodic-sync',
} as const;

// iTunes podcast search defaults
export const SEARCH = {
  HISTORY_LIMIT: 10,
  CACHE_TTL_MS: 24 * 60 * 60 * 1000, // 24h
  RESULT_LIMIT: 200,
  COUNTRY: 'CN',
} as const;

// Base URL for external (xiaoyuzhoufm) podcast/episode links
export const XYZ_BASE_URL = 'https://www.xiaoyuzhoufm.com';
// Comments API uses a separate subdomain
export const COMMENT_BASE_URL = 'https://comment.xiaoyuzhoufm.com';
