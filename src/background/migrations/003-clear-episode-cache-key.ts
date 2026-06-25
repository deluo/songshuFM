import type { MigrationContext } from './index';

// One-time cleanup: a stale 'episodeCache' key lingered in chrome.storage.local
// from an older data model. This migration removes it if present. Previously an
// IIFE gated on the _cacheCleared_v3 boolean sentinel in service-worker.ts.
export async function migrateClearEpisodeCacheKey(_ctx: MigrationContext): Promise<void> {
  try {
    await chrome.storage.local.remove(['episodeCache']);
  } catch {
    // Key absent or storage unavailable — nothing to do.
  }
}
