import { signal } from '@preact/signals';
import { MSG, sendMessage } from '../../lib/messaging';
import { subscriptions } from '../state';

// Cover URLs resolved by podcast id, beyond what's already in `subscriptions`.
// Avoids re-fetching FETCH_COVER on every render. Negative results ('') are
// cached too so we don't hammer the background for podcasts with no cover.
const coverCache = signal<Record<string, string>>({});

/**
 * Returns the best-known cover URL for a podcast:
 *   1. an explicit coverUrl on the object itself, or
 *   2. the matching subscription's coverUrl, or
 *   3. a previously-fetched cover from the cache.
 * When none are known, kicks off a background FETCH_COVER (once per podcast)
 * so a later render picks the resolved value up.
 */
export function resolveCover(podcastId: string | undefined | null, fallback?: string): string {
  if (fallback) return fallback;
  if (!podcastId) return '';
  const sub = subscriptions.value.find((s) => s.id === podcastId || s.pid === podcastId);
  if (sub?.coverUrl) return sub.coverUrl;
  const cached = coverCache.value[podcastId];
  if (cached != null) return cached;
  // Not yet known — fetch once and cache the result.
  fetchCover(podcastId);
  return '';
}

async function fetchCover(podcastId: string) {
  // Mark as in-flight immediately to avoid duplicate concurrent fetches.
  coverCache.value = { ...coverCache.value, [podcastId]: '' };
  try {
    const result = await sendMessage<{ coverUrl?: string }>(MSG.FETCH_COVER, { podcastId });
    const url = result?.coverUrl || '';
    if (url) coverCache.value = { ...coverCache.value, [podcastId]: url };
  } catch {
    // leave the empty-string cache entry so we don't retry forever
  }
}
