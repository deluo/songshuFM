import { MSG, broadcast } from '../../lib/messaging';
import { search, simpleHash } from '../api-search';
import { fetchAndParse, fetchAndParseBatch } from '../feed-fetcher';
import { getSubscriptions, addSubscription, removeSubscription, updateSubscription } from '../storage';
import { markDirty } from '../sync-observer';
import { checkForUpdates } from '../updates';

type HandlerFn = (msg: any, sender: chrome.runtime.MessageSender, ctx: any) => Promise<any>;

export const handlers: Record<string, HandlerFn> = {
  [MSG.SEARCH_REQUEST]: async (msg) => {
    try {
      const results = await search(msg.query);
      return { type: 'search', results };
    } catch (e: any) {
      if (e.message === 'NO_RESULTS') return { type: 'error', error: '没有找到相关播客' };
      return { type: 'error', error: e.message };
    }
  },

  [MSG.SUBSCRIBE]: async (msg) => {
    const podcast = msg.podcast;
    await addSubscription(podcast);
    const feedUrl = podcast.feedUrl || podcast.xmlUrl;
    if (feedUrl) {
      (async () => {
        try {
          const data = await fetchAndParse(feedUrl, podcast.id, podcast);
          await updateSubscription(podcast.id, {
            name: data.podcast.title || podcast.name,
            coverUrl: data.podcast.coverUrl || podcast.coverUrl,
            lastFetchedAt: Date.now(),
            ...(data.episodes.length > 0 ? {
              latestEpisodeId: data.episodes[0].eid,
              latestEpisodeTitle: data.episodes[0].title,
              episodeCount: data.episodes.length,
            } : {}),
          });
          chrome.runtime.sendMessage({
            type: MSG.PODCAST_DETAIL_UPDATE,
            podcastId: podcast.id,
            podcast: { id: podcast.id, ...data.podcast },
            allEpisodes: data.episodes,
          }).catch(() => {});
          broadcast(MSG.HOME_DATA_UPDATE);
        } catch (e) { console.warn('订阅后获取 RSS 失败:', e); }
      })();
    }
    markDirty('podcasts');
    return { success: true };
  },

  [MSG.UNSUBSCRIBE]: async (msg) => { await removeSubscription(msg.podcastId); markDirty('podcasts'); return { success: true }; },
  [MSG.GET_SUBSCRIPTIONS]: async () => getSubscriptions(),

  [MSG.IMPORT_OPML]: async (msg) => {
    const podcasts = msg.podcasts;
    const feeds = podcasts.map((p: any) => ({
      feedUrl: p.xmlUrl,
      podcastId: `ext-${simpleHash(p.xmlUrl)}`,
      title: p.title,
    }));

    const result = await fetchAndParseBatch(feeds, (completed, total) => {
      chrome.runtime.sendMessage({
        type: MSG.IMPORT_OPML_PROGRESS,
        completed, total,
      }).catch(() => {});
    });

    for (let i = 0; i < feeds.length; i++) {
      const feed = feeds[i];
      const successItem = result.succeeded?.find((s: any) => s.feedUrl === feed.feedUrl);
      if (!result.failed.find((f: any) => f.feedUrl === feed.feedUrl)) {
        await addSubscription({
          id: feed.podcastId,
          name: feed.title,
          feedUrl: feed.feedUrl,
          coverUrl: successItem?.coverUrl || '',
          isExternal: true,
        });
      }
    }

    markDirty('podcasts');
    return { success: true, imported: result.imported, failed: result.failed };
  },

  [MSG.CHECK_UPDATES]: async () => checkForUpdates(),
};
