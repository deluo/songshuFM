import { getSubscriptions, updateSubscription, getSettings } from './storage';
import { refreshFeed } from './feed-fetcher';
import { MSG, broadcast } from '../lib/messaging';

export async function checkForUpdates(): Promise<{ newEpisodes: any[] }> {
  const subs = await getSubscriptions();
  const settings = await getSettings();
  const newEpisodes: any[] = [];

  for (const sub of subs) {
    const feedUrl = sub.feedUrl;
    if (!feedUrl) continue;
    try {
      const result = await refreshFeed(sub.id, feedUrl);
      if (result.newEpisodes.length > 0) {
        newEpisodes.push(...result.newEpisodes.map((ep: any) => ({
          podcast: { id: sub.id, title: sub.name, coverUrl: sub.coverUrl },
          episode: ep,
        })));
        await updateSubscription(sub.id, {
          latestEpisodeId: result.newEpisodes[0].eid,
          latestEpisodeTitle: result.newEpisodes[0].title,
        });
      }
    } catch (e) { console.warn(`更新检查失败 ${sub.name}:`, e); }
  }

  if (newEpisodes.length > 0 && settings.notificationsEnabled) {
    for (const item of newEpisodes) {
      chrome.notifications.create(`update-${item.episode.eid}`, {
        type: 'basic',
        iconUrl: item.podcast.coverUrl || 'icons/icon-128.png',
        title: `${item.podcast.title} 更新了`,
        message: item.episode.title,
      });
    }
  }

  if (newEpisodes.length > 0) {
    broadcast(MSG.HOME_DATA_UPDATE);
  }

  return { newEpisodes };
}
