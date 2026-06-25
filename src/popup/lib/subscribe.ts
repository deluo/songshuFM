import { sendMessage, MSG } from '../../lib/messaging';
import { XYZ_BASE_URL } from '../../lib/constants';

// Unified subscribe/unsubscribe helpers. Replaces the divergent toggleSubscribe/
// isSubscribed copies in search.tsx (handles ext-/opml- external ids) and
// podcast-detail.tsx (did not). The search version is the canonical behavior.

export function isSubscribed(podcastId: string | undefined, subscriptions: any[]): boolean {
  if (!podcastId) return false;
  return subscriptions.some((s) => (s.id || s.pid) === podcastId);
}

export async function toggleSubscribe(podcast: any, subscribed: boolean): Promise<boolean> {
  if (subscribed) {
    await sendMessage(MSG.UNSUBSCRIBE, { podcastId: podcast.id });
    return false;
  }
  await sendMessage(MSG.SUBSCRIBE, { podcast });
  return true;
}

// External podcasts (imported via OPML or added by feed URL) use ext-/opml-
// prefixed ids and have a corresponding xiaoyuzhoufm detail page.
export function externalPodcastUrl(podcast: any): string | null {
  const id = podcast?.id;
  if (!id || (!id.startsWith('ext-') && !id.startsWith('opml-'))) return null;
  return `${XYZ_BASE_URL}/podcast/${id}`;
}
