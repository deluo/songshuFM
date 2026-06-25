// SHIM + business helpers. Re-exports the data layer for backwards compatibility
// with existing `from '../storage'` / `from './storage'` importers, and keeps the
// subscription- and play-history-debounce business functions that haven't moved
// to services/ yet (WF4 moves them). This file is DELETED in WF4.

// --- data layer re-exports (formerly inlined here or re-exported from ./db) ---
export {
  getPlayHistory, addOrUpdatePlayHistory as addPlayHistory,
  removePlayHistory, clearPlayHistory,
  getPlayPosition, updatePlayPosition,
  getPlayedEpisodeIds,
} from '../data/repositories/play-history';
export {
  addFavorite, removeFavorite, isFavorite, getFavorites,
} from '../data/repositories/favorites';
export {
  removeAudioUrl, removeAudioUrlsByPodcast, getAudioUrlStats,
} from '../data/repositories/audio-urls';
export {
  getEpisode, getEpisodesByPodcast, upsertEpisode, upsertEpisodes,
} from '../data/repositories/episodes';
export {
  getPodcast, updateSubscription,
} from '../data/repositories/podcasts';
export {
  getListenStats, getAllListenStats,
  updateListenStats, rebuildListenStatsFromHistory,
} from '../data/repositories/listen-stats';
export {
  getAudioCacheMeta, setAudioCacheMeta, deleteAudioCacheMeta,
  getAllAudioCacheMeta, clearAudioCacheMeta,
} from './db';
export {
  getSubscribedPodcasts as getSubscriptions,
} from '../data/repositories/podcasts';

// --- chrome.storage.local wrappers (delegated to data/storage-local) ---
export {
  getSettings, updateSettings,
  getPlayingState, setPlayingState,
  getSearchCache, setSearchCache,
  getSearchHistory, addSearchHistory, clearSearchHistory,
} from '../data/storage-local';

// --- business helpers (move to services/subscriptions.ts + services/history.ts in WF4) ---
import { upsertPodcast, updateSubscription } from '../data/repositories/podcasts';
import { getEpisodesByPodcast, upsertEpisodes } from '../data/repositories/episodes';
import { updatePlayPosition, incrementListenDuration } from '../data/repositories/play-history';
import { idbGet, idbPut } from '../data/db';
import { createWriteBuffer } from '../data/write-buffers';
import { WRITE_BUFFER_INTERVAL_MS } from '../lib/constants';

export async function addSubscription(podcast: any): Promise<void> {
  const pid = podcast.id || podcast.pid;
  if (!pid) {
    console.error('[addSubscription] Missing podcast ID:', podcast);
    throw new Error('Podcast ID is required');
  }

  const subscriptionData = {
    pid: pid,
    id: pid,
    title: podcast.name || podcast.title || '',
    name: podcast.name || podcast.title || '',
    author: podcast.author || '',
    coverUrl: podcast.coverUrl || '',
    description: podcast.description || '',
    feedUrl: podcast.feedUrl || podcast.xmlUrl || '',
    episodeCount: podcast.episodeCount || 0,
    subscribedAt: podcast.subscribedAt || Date.now(),
    url: podcast.url || '',
    updatedAt: Date.now(),
  };

  await upsertPodcast(subscriptionData);
}

export async function removeSubscription(podcastId: string): Promise<void> {
  const podcast = await idbGet('podcasts', podcastId);
  if (podcast) {
    podcast.subscribedAt = null;
    await idbPut('podcasts', podcast);
  }
}

export async function getEpisodeCache(podcastId: string, maxAgeMs?: number): Promise<any> {
  const episodes = await getEpisodesByPodcast(podcastId);
  if (!episodes.length) return null;
  if (maxAgeMs != null) {
    const newestUpdate = episodes.reduce((max: number, ep: any) => Math.max(max, ep.updatedAt || 0), 0);
    if (newestUpdate > 0 && (Date.now() - newestUpdate) > maxAgeMs) return null;
  }
  const podcast = await idbGet('podcasts', podcastId);
  return {
    episodes,
    podcastTitle: podcast?.title || '',
    podcastAuthor: podcast?.author || '',
    podcastCoverUrl: podcast?.coverUrl || '',
    feedUrl: podcast?.feedUrl || '',
    timestamp: episodes[0]?.updatedAt || Date.now(),
  };
}

export async function setEpisodeCache(podcastId: string, data: any): Promise<void> {
  if (data.episodes?.length) {
    await upsertEpisodes(data.episodes.map((ep: any) => ({
      ...ep,
      eid: ep.id || ep.eid,
      podcastId: ep.podcastId || podcastId,
    })));
  }
}

// Debounced play-history writers.
//
// Position is last-writer-wins — the generic createWriteBuffer handles it.
// Duration must SUM across queued updates (three +5s calls must flush as +15),
// so it uses a small dedicated accumulator rather than the generic buffer.
const positionBuffer = createWriteBuffer<number>(async (pending) => {
  for (const [eid, pos] of Object.entries(pending)) {
    await updatePlayPosition(eid, pos);
  }
});

let pendingDuration: Record<string, number> = {};
let durationTimer: ReturnType<typeof setTimeout> | null = null;

export function updatePlayHistoryDuration(episodeId: string, incrementDuration: number): void {
  if (!episodeId || !incrementDuration) return;
  pendingDuration[episodeId] = (pendingDuration[episodeId] || 0) + incrementDuration;
  if (!durationTimer) {
    durationTimer = setTimeout(async () => {
      durationTimer = null;
      const updates = pendingDuration;
      pendingDuration = {};
      for (const [eid, inc] of Object.entries(updates)) {
        await incrementListenDuration(eid, inc);
      }
    }, WRITE_BUFFER_INTERVAL_MS);
  }
}

export function updatePlayHistoryPosition(episodeId: string, position: number): void {
  if (!episodeId || position == null) return;
  positionBuffer.queue(episodeId, position);
}
