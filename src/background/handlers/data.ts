import { MSG, broadcast } from '../../lib/messaging';
import {
  getPlayHistory, addPlayHistory, removePlayHistory, clearPlayHistory,
  updatePlayHistoryPosition, getPlayPosition,
  getFavorites, addFavorite, removeFavorite, isFavorite,
  getEpisodeCache, setEpisodeCache,
  getAllListenStats, rebuildListenStatsFromHistory,
  getSubscriptions, updateSubscription,
} from '../storage';
import { getPodcast, getEpisodesByPodcast, getAllEpisodes } from '../db';
import { fetchAndParse, fetchAndParseWithRetry, refreshFeed } from '../feed-fetcher';
import { markDirty, onPlaybackStop } from '../sync-observer';
import { getComments } from '../../services/comments';

// Mark an episode "unread" when its pubDate is newer than the podcast's
// lastReadPubDate watermark. Returns false for episodes with no parseable
// pubDate (treated as already-read to avoid false positives).
function isEpisodeUnread(ep: any, lastReadPubDate: number | undefined): boolean {
  if (!lastReadPubDate) return false;
  const pubMs = new Date(ep.pubDate || 0).getTime();
  if (!pubMs) return false;
  return pubMs > lastReadPubDate;
}

type HandlerFn = (msg: any, sender: chrome.runtime.MessageSender, ctx: any) => Promise<any>;

// Inject lastPosition / listenedDuration from the local playHistory store into
// a list of episodes. This lets the popup show resume progress for episodes
// loaded from RSS / external APIs that don't carry that data.
async function enrichWithHistory(episodes: any[]): Promise<any[]> {
  if (!episodes?.length) return episodes;
  const history = await getPlayHistory();
  if (!history?.length) return episodes;
  const byId = new Map<string, any>();
  for (const h of history) {
    const key = h.eid || h.id;
    if (key) byId.set(key, h);
  }
  return episodes.map((ep) => {
    const key = ep.id || ep.eid;
    const h = key ? byId.get(key) : null;
    if (!h) return ep;
    return {
      ...ep,
      lastPosition: h.lastPosition || ep.lastPosition || 0,
      listenedDuration: h.listenedDuration || ep.listenedDuration || 0,
    };
  });
}

export const handlers: Record<string, HandlerFn> = {
  [MSG.GET_HOME_DATA]: async () => getHomeData(),

  [MSG.GET_PLAY_HISTORY]: async () => getPlayHistory(),
  [MSG.PLAY_HISTORY_ADD]: async (msg) => { await addPlayHistory(msg.episode); markDirty('playHistory'); return { success: true }; },
  [MSG.PLAY_HISTORY_REMOVE]: async (msg) => { await removePlayHistory(msg.episodeId); markDirty('playHistory'); return { success: true }; },
  [MSG.PLAY_HISTORY_CLEAR]: async () => { await clearPlayHistory(); return { success: true }; },
  [MSG.PLAY_POSITION_UPDATE]: async (msg) => { updatePlayHistoryPosition(msg.episodeId, msg.position); return { success: true }; },
  [MSG.GET_PLAY_POSITION]: async (msg) => ({ position: await getPlayPosition(msg.episodeId) }),

  [MSG.FAVORITE_ADD]: async (msg) => { await addFavorite(msg.episode); markDirty('favorites'); return { success: true }; },
  [MSG.FAVORITE_REMOVE]: async (msg) => { await removeFavorite(msg.episodeId); markDirty('favorites'); return { success: true }; },
  [MSG.FAVORITE_CHECK]: async (msg) => ({ isFavorite: await isFavorite(msg.episodeId) }),
  [MSG.FAVORITE_GET_ALL]: async () => getFavorites(),

  // Local subscribed-episode search: full-text match title/description across
  // all subscribed podcasts' episodes. Empty query returns the newest 50.
  [MSG.LOCAL_SEARCH_EPISODES]: async (msg) => {
    const q = (msg.query || '').trim().toLowerCase();
    const all = await getAllEpisodes();
    if (!q) return { episodes: await enrichWithHistory(all.slice(0, 50)) };
    const matched = all.filter(
      (e: any) =>
        (e.title || '').toLowerCase().includes(q) ||
        (e.description || '').toLowerCase().includes(q),
    );
    return { episodes: await enrichWithHistory(matched.slice(0, 200)) };
  },

  [MSG.GET_PODCAST_DETAIL]: async (msg) => {
    const { podcastId, feedUrl } = msg;
    if (!podcastId) return { error: '无效的播客链接' };

    const podcast = await getPodcast(podcastId);
    const lastReadPubDate = podcast?.lastReadPubDate;
    const tagUnread = (eps: any[]) => eps.map((ep) => ({ ...ep, isNew: isEpisodeUnread(ep, lastReadPubDate) }));

    const cached = await getEpisodeCache(podcastId, 30 * 60 * 1000);
    if (cached && cached.episodes && cached.episodes.length > 0) {
      return {
        type: 'podcast',
        podcast: { id: podcastId, ...(podcast || {}), feedUrl: podcast?.feedUrl || feedUrl || cached.feedUrl || '' },
        episodes: tagUnread(await enrichWithHistory(cached.episodes)),
      };
    }

    let resolvedFeedUrl = feedUrl;
    if (!resolvedFeedUrl) {
      resolvedFeedUrl = podcast?.feedUrl;
    }

    if (resolvedFeedUrl) {
      try {
        const data = await fetchAndParseWithRetry(resolvedFeedUrl, podcastId);
        await setEpisodeCache(podcastId, {
          episodes: data.episodes,
          podcastTitle: data.podcast.title,
          podcastAuthor: data.podcast.author,
          podcastCoverUrl: data.podcast.coverUrl,
          feedUrl: resolvedFeedUrl,
        });
        return { type: 'podcast', podcast: { id: podcastId, ...data.podcast, feedUrl: resolvedFeedUrl }, episodes: tagUnread(await enrichWithHistory(data.episodes)) };
      } catch (error) {
        console.warn(`Failed to fetch podcast ${podcastId} after retries:`, error);
      }
    }

    const dbEpisodes = await getEpisodesByPodcast(podcastId);
    if (dbEpisodes.length > 0) {
      return {
        type: 'podcast',
        podcast: { id: podcastId, ...(podcast || {}), feedUrl: podcast?.feedUrl || feedUrl || '' },
        episodes: tagUnread(await enrichWithHistory(dbEpisodes)),
      };
    }

    return { type: 'loading', podcastId };
  },

  // Mark a podcast as read up through a given pubDate (or its newest known
  // episode). Persisted as the lastReadPubDate watermark; episodes with a
  // newer pubDate stay/again become unread on the next refresh.
  [MSG.MARK_PODCAST_READ]: async (msg) => {
    const { podcastId, pubDate } = msg;
    if (!podcastId) return { success: false };
    let watermark = pubDate ? new Date(pubDate).getTime() : 0;
    if (!watermark) {
      const eps = await getEpisodesByPodcast(podcastId);
      watermark = eps.length > 0 ? (new Date(eps[0].pubDate || 0).getTime() || Date.now()) : Date.now();
    }
    await updateSubscription(podcastId, { lastReadPubDate: watermark });
    return { success: true };
  },

  [MSG.FETCH_COVER]: async (msg) => {
    const podcast = await getPodcast(msg.podcastId);
    return { coverUrl: podcast?.coverUrl || '' };
  },

  [MSG.FETCH_AUDIO_URL]: async (msg) => {
    const { feedUrl, episodeId, episodeTitle } = msg;
    if (!feedUrl) return { error: 'No feedUrl' };
    try {
      const data = await fetchAndParse(feedUrl, episodeId || 'temp');
      let episode = data.episodes.find((ep: any) => ep.eid === episodeId);
      if (!episode && episodeTitle) {
        episode = data.episodes.find((ep: any) => ep.title === episodeTitle);
      }
      if (episode && episode.audioUrl) return { audioUrl: episode.audioUrl, episode };
      return { error: 'Episode not found in feed' };
    } catch (e: any) {
      return { error: e.message };
    }
  },

  [MSG.FETCH_RSS_FEED]: async (msg) => {
    const { feedUrl, podcastId } = msg;
    if (!feedUrl) return { success: false, error: 'No feedUrl provided' };
    try {
      const data = await fetchAndParse(feedUrl, podcastId);
      return { success: true, episodeCount: data.episodes.length };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  [MSG.GET_COMMENTS]: async (msg) => getComments(msg.episodeId),

  [MSG.STATS_GET]: async () => getAllListenStats(),
  [MSG.STATS_REBUILD]: async () => rebuildListenStatsFromHistory(),
  [MSG.ENDED]: async () => { markDirty('playHistory'); onPlaybackStop(); return { success: true }; },
};

async function getHomeData(): Promise<any> {
  const [history, subs] = await Promise.all([
    getPlayHistory(),
    getSubscriptions(),
  ]);

  // Refresh stale feeds in the BACKGROUND and broadcast HOME_DATA_UPDATE when
  // done. Previously this awaited Promise.allSettled(refreshes) before
  // returning, so the home page stayed on its loading state for up to 30s per
  // stale feed. Now we return cached episodes immediately and let the popup
  // re-pull via the existing HOME_DATA_UPDATE channel (home.tsx already
  // listens for it) once the refresh completes.
  const STALE_THRESHOLD = 30 * 60 * 1000;
  const now = Date.now();
  const staleFeeds = subs.filter((sub: any) =>
    sub.feedUrl && (now - (sub.lastFetchedAt || 0)) > STALE_THRESHOLD
  );
  if (staleFeeds.length > 0) {
    // Fire-and-forget; resolve quietly so an unhandled rejection never surfaces.
    (async () => {
      const refreshPromises = staleFeeds.map((sub: any) =>
        Promise.race([
          refreshFeed(sub.id, sub.feedUrl),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), 30000)
          ),
        ]).catch((err: any) => {
          console.warn(`[getHomeData] stale feed refresh failed for ${sub.name || sub.id}:`, err?.message || err);
          return { newEpisodes: [] };
        })
      );
      await Promise.allSettled(refreshPromises);
      broadcast(MSG.HOME_DATA_UPDATE);
    })();
  }

  // Read each subscription's cached episodes in PARALLEL — the previous serial
  // for-loop did one IDB round-trip per subscription, which dominated home load
  // time for users with many subscriptions.
  const cachedResults = await Promise.all(
    subs.map((sub: any) => getEpisodeCache(sub.id).then((cached) => ({ sub, cached })))
  );

  const allRecent: any[] = [];
  const needsRefresh: Array<{ id: string; feedUrl: string }> = [];
  for (const { sub, cached } of cachedResults) {
    if (!cached || !cached.episodes) continue;
    const episodes = cached.episodes;
    if (episodes.length > 0) {
      const podcastInfo = {
        id: sub.id,
        title: sub.name || sub.title || cached.podcastTitle || '',
        coverUrl: sub.coverUrl || cached.podcastCoverUrl || '',
        lastReadPubDate: sub.lastReadPubDate,
      };
      const top2 = episodes.slice(0, 2);
      for (const ep of top2) {
        allRecent.push({ episode: ep, podcast: podcastInfo });
      }
      if (episodes.some((ep: any) => !ep.duration || ep.duration < 60)) {
        needsRefresh.push({ id: sub.id, feedUrl: sub.feedUrl });
      }
    }
  }

  allRecent.sort((a, b) => {
    const aTime = new Date(a.episode.pubDate || 0).getTime() || 0;
    const bTime = new Date(b.episode.pubDate || 0).getTime() || 0;
    return bTime - aTime;
  });
  const topEpisodes = allRecent.slice(0, 20);

  const podcastMap = new Map<string, { podcast: any; episodes: any[] }>();
  for (const { episode, podcast } of topEpisodes) {
    if (!podcastMap.has(podcast.id)) {
      podcastMap.set(podcast.id, { podcast, episodes: [] });
    }
    const group = podcastMap.get(podcast.id)!;
    if (group.episodes.length < 2) {
      // isNew reflects real unread state from the podcast's lastReadPubDate
      // watermark, not the previous hardcoded `true`.
      group.episodes.push({ ...episode, isNew: isEpisodeUnread(episode, podcast.lastReadPubDate) });
    }
  }
  const updates = [...podcastMap.values()];

  for (const { id, feedUrl } of needsRefresh) {
    if (!feedUrl) continue;
    fetchAndParse(feedUrl, id).catch(() => {});
  }

  return { resumeEpisode: history.length > 0 ? history[0] : null, updates: updates.slice(0, 10) };
}
