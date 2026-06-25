import { parseRssFeed } from './rss-parser';
import { upsertPodcast, upsertEpisode, upsertEpisodes, getEpisodesByPodcast, getPodcast } from './db';

interface ParsedEpisode {
  id: string;
  eid: string;
  title: string;
  podcastId: string;
  podcastName: string;
  audioUrl: string;
  duration: number;
  coverUrl: string;
  description: string;
  pubDate: string;
  guid: string;
}

function buildEpisode(ep: any, podcastId: string, podcastTitle: string, coverFallback: string): ParsedEpisode {
  return {
    id: ep.id,
    eid: ep.id,
    title: ep.title,
    podcastId,
    podcastName: podcastTitle,
    audioUrl: ep.audioUrl,
    duration: ep.duration,
    coverUrl: ep.coverUrl || coverFallback,
    description: ep.description,
    pubDate: ep.pubDate,
    guid: ep.guid,
  };
}

async function fetchWithTimeout(feedUrl: string, timeout: number = 30000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const resp = await fetch(feedUrl, { signal: controller.signal });
    clearTimeout(timeoutId);
    return resp;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Feed fetch timeout for ${feedUrl}`);
    }
    throw error;
  }
}

async function fetchAndParseInternal(feedUrl: string, podcastId: string, fallbackMeta: any = null): Promise<{ podcast: any; episodes: ParsedEpisode[] }> {
  const resp = await fetchWithTimeout(feedUrl, 30000);

  if (!resp.ok) throw new Error(`Feed fetch failed: ${resp.status}`);
  const xml = await resp.text();
  const data = parseRssFeed(xml, feedUrl);

  const podcast = {
    pid: podcastId,
    title: data.podcast.title || fallbackMeta?.title || '',
    description: data.podcast.description || fallbackMeta?.description || '',
    author: data.podcast.author || fallbackMeta?.author || '',
    coverUrl: data.podcast.coverUrl || fallbackMeta?.coverUrl || '',
    feedUrl,
    lastFetchedAt: Date.now(),
    latestPubDate: data.episodes[0]?.pubDate || null,
    episodeCount: data.episodes.length,
    ...(fallbackMeta || {}),
  };

  const episodes = data.episodes.map(ep => buildEpisode(ep, podcastId, podcast.title, podcast.coverUrl));

  await upsertPodcast(podcast);
  if (episodes.length > 0) {
    await upsertEpisodes(episodes);
  }

  return { podcast, episodes };
}

export async function fetchAndParse(feedUrl: string, podcastId: string, fallbackMeta: any = null): Promise<{ podcast: any; episodes: ParsedEpisode[] }> {
  return await fetchAndParseInternal(feedUrl, podcastId, fallbackMeta);
}

export async function fetchAndParseWithRetry(feedUrl: string, podcastId: string, fallbackMeta: any = null, maxRetries: number = 2): Promise<{ podcast: any; episodes: ParsedEpisode[] }> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetchAndParseInternal(feedUrl, podcastId, fallbackMeta);
    } catch (error: any) {
      lastError = error;
      console.warn(`Feed fetch attempt ${attempt + 1} failed for ${feedUrl}:`, error.message);

      if (attempt < maxRetries) {
        const backoffDelay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }
    }
  }

  throw lastError;
}

export async function fetchAndParseBatch(feeds: Array<{ feedUrl: string; podcastId: string; title: string }>, onProgress: ((completed: number, total: number) => void) | null = null): Promise<{ imported: number; failed: Array<{ feedUrl: string; title: string; error: string }>; succeeded: Array<{ feedUrl: string; podcastId: string; coverUrl: string }> }> {
  let imported = 0;
  const failed: Array<{ feedUrl: string; title: string; error: string }> = [];
  const succeeded: Array<{ feedUrl: string; podcastId: string; coverUrl: string }> = [];

  for (let i = 0; i < feeds.length; i++) {
    const { feedUrl, podcastId, title } = feeds[i];
    try {
      const data = await fetchAndParse(feedUrl, podcastId, { title });
      imported++;
      succeeded.push({
        feedUrl,
        podcastId,
        coverUrl: data.podcast.coverUrl || '',
      });
    } catch (e: any) {
      console.warn(`[feed-fetcher] Failed to fetch ${feedUrl}:`, e);
      failed.push({ feedUrl, title, error: e.message });
    }
    if (onProgress) onProgress(i + 1, feeds.length);
  }

  return { imported, failed, succeeded };
}

export async function refreshFeed(podcastId: string, feedUrl: string): Promise<{ newEpisodes: ParsedEpisode[] }> {
  const existing = await getEpisodesByPodcast(podcastId);
  const existingIds = new Set(existing.map((ep: any) => ep.eid));
  const existingMap = new Map(existing.map((ep: any) => [ep.eid, ep]));

  const resp = await fetch(feedUrl);
  if (!resp.ok) throw new Error(`Feed refresh failed: ${resp.status}`);
  const xml = await resp.text();
  const data = parseRssFeed(xml, feedUrl);

  const podcast = await getPodcast(podcastId);
  const podcastTitle = podcast?.title || data.podcast.title;
  const coverFallback = data.podcast.coverUrl;
  const newEpisodes: ParsedEpisode[] = [];

  for (const ep of data.episodes) {
    if (!existingIds.has(ep.id)) {
      newEpisodes.push(buildEpisode(ep, podcastId, podcastTitle, coverFallback));
    } else {
      const old = existingMap.get(ep.id);
      if (old && (!old.duration || old.duration < 60) && ep.duration > 0) {
        await upsertEpisode(buildEpisode(ep, podcastId, podcastTitle, coverFallback));
      }
    }
  }

  if (newEpisodes.length > 0) {
    await upsertEpisodes(newEpisodes);
  }

  await upsertPodcast({
    pid: podcastId,
    title: data.podcast.title || podcast?.title,
    description: data.podcast.description || podcast?.description,
    author: data.podcast.author || podcast?.author,
    coverUrl: data.podcast.coverUrl || podcast?.coverUrl,
    feedUrl,
    lastFetchedAt: Date.now(),
    latestPubDate: data.episodes[0]?.pubDate || podcast?.latestPubDate || null,
    episodeCount: existing.length + newEpisodes.length,
  });

  return { newEpisodes };
}
