import { fetchAndParseFeed, fetchWithRetry, batch } from '../feed/fetcher';
import { upsertEpisodes, getEpisodesByPodcast } from '../data/repositories/episodes';
import { upsertPodcast } from '../data/repositories/podcasts';
import { setAudioUrl } from '../data/repositories/audio-urls';
import type { ParsedFeed } from '../feed/parser';

export interface DiffResult {
  episodeCount: number; // true total (existing kept + new added) — fixes the
                        // old undercount that ignored in-place updates
  newCount: number;
  updatedCount: number;
}

// Pure: classify the diff between existing on-disk episodes and freshly-parsed
// ones. Exported separately so the episode-count fix is unit-testable without IDB.
// episodeCount = existing.length + newCount (in-place updates don't add rows).
export function diffAndPersist(existing: any[], parsed: any[], _podcastId: string): DiffResult {
  const byEid = new Set(existing.map((e) => e.eid));
  let newCount = 0;
  let updatedCount = 0;
  for (const ep of parsed) {
    if (byEid.has(ep.eid)) updatedCount++;
    else newCount++;
  }
  return { episodeCount: existing.length + newCount, newCount, updatedCount };
}

// Persist a parsed feed: upsert podcast + episodes, and opportunistically
// backfill the audioUrls cache (a URL resolved once need not be re-parsed).
async function persistFeed(parsed: ParsedFeed, podcastId: string, fallbackMeta?: any): Promise<void> {
  const podcast = {
    pid: podcastId,
    title: fallbackMeta?.title || parsed.podcast.title,
    description: parsed.podcast.description,
    author: parsed.podcast.author,
    coverUrl: fallbackMeta?.coverUrl || parsed.podcast.coverUrl,
    feedUrl: fallbackMeta?.feedUrl,
    updatedAt: Date.now(),
  };
  await upsertPodcast(podcast);
  await upsertEpisodes(
    parsed.episodes.map((e) => ({
      eid: e.eid,
      title: e.title,
      audioUrl: e.audioUrl,
      duration: e.duration,
      pubDate: e.pubDate,
      description: e.description,
      guid: e.guid,
      coverUrl: e.coverUrl,
      podcastId,
      podcastName: podcast.title,
    })),
  );
  // Backfill audioUrls cache in the same pass.
  for (const e of parsed.episodes) {
    if (e.audioUrl) await setAudioUrl(e.eid, e.audioUrl, podcastId);
  }
}

// Subscribe path: fetch + parse + persist a feed. Retries on transient failure.
export async function fetchAndParse(
  feedUrl: string,
  podcastId: string,
  fallbackMeta?: any,
): Promise<ParsedFeed> {
  const parsed = await fetchWithRetry(() => fetchAndParseFeed(feedUrl));
  await persistFeed(parsed, podcastId, fallbackMeta);
  return parsed;
}

// Refresh path: re-fetch an already-subscribed feed and record the diff. The
// podcast's episodeCount is corrected to the true total (existing + new), which
// the old feed-fetcher.ts undercounted by ignoring in-place updates.
export async function refresh(podcastId: string, feedUrl: string): Promise<DiffResult> {
  const existing = await getEpisodesByPodcast(podcastId);
  const parsed = await fetchAndParseFeed(feedUrl);
  const diff = diffAndPersist(existing, parsed.episodes, podcastId);
  await persistFeed(parsed, podcastId);
  await upsertPodcast({ pid: podcastId, episodeCount: diff.episodeCount, feedUrl });
  return diff;
}

// OPML batch import: limited concurrency (5) with progress callback, replacing
// the serial for-loop that made large imports slow.
export async function importBatch(
  feeds: Array<{ feedUrl: string; podcastId: string; meta?: any }>,
  onProgress?: (done: number, total: number) => void,
): Promise<Array<{ ok: boolean; feedUrl: string; error?: string }>> {
  const results = await batch(
    feeds,
    5,
    async (f): Promise<{ ok: boolean; feedUrl: string; error?: string }> => {
      try {
        await fetchAndParse(f.feedUrl, f.podcastId, f.meta);
        return { ok: true, feedUrl: f.feedUrl };
      } catch (e) {
        return { ok: false, feedUrl: f.feedUrl, error: String(e) };
      }
    },
    onProgress,
  );
  return results;
}
