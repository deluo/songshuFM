import type { MigrationContext } from './index';
import { getSubscribedPodcasts, updateSubscription } from '../../data/repositories/podcasts';
import { getEpisodesByPodcast } from '../../data/repositories/episodes';

// Seeds latestPubDate + episodeCount on subscriptions that lack them. Previously
// an IIFE gated on the _migrated_latestPubDate boolean sentinel. Idempotent: only
// backfills subscriptions whose latestPubDate is still missing.
export async function migrateSeedSubscriptionMeta(_ctx: MigrationContext): Promise<void> {
  const subs = await getSubscribedPodcasts();
  for (const sub of subs) {
    if (sub.latestPubDate) continue;
    const episodes = await getEpisodesByPodcast(sub.id);
    if (episodes.length > 0) {
      await updateSubscription(sub.id, {
        latestPubDate: episodes[0].pubDate,
        episodeCount: episodes.length,
      });
    }
  }
}
