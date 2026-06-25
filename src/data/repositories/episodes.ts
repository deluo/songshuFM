import { idbGet, idbGetAll, idbGetByIndex, idbPut } from '../db';
import { decodeHtmlEntities } from '../../lib/utils';
import { parsePubDateMs } from '../../lib/dates';

// episodes store. upsertEpisode preserves user-owned fields (notes, tags,
// firstSeenAt, isDeleted) across re-fetches from RSS, so refreshing a feed never
// wipes user annotations.

const TEXT_FIELDS_EPISODE = ['title', 'podcastName', 'description', 'guid'] as const;

function normalizeText<T extends Record<string, any>>(record: T, fields: readonly string[]): T {
  let changed = false;
  const out: Record<string, any> = { ...record };
  for (const f of fields) {
    const v = out[f];
    if (typeof v === 'string' && v.indexOf('&') !== -1) {
      const decoded = decodeHtmlEntities(v);
      if (decoded !== v) {
        out[f] = decoded;
        changed = true;
      }
    }
  }
  return changed ? (out as T) : record;
}

export async function upsertEpisode(episodeData: any): Promise<void> {
  if (!episodeData.eid) return;
  const data = normalizeText(episodeData, TEXT_FIELDS_EPISODE);
  const existing = await idbGet('episodes', data.eid);
  const now = Date.now();
  if (existing) {
    await idbPut('episodes', {
      ...existing,
      ...data,
      userNotes: existing.userNotes || '',
      userTags: existing.userTags || [],
      firstSeenAt: existing.firstSeenAt,
      isDeleted: existing.isDeleted,
      updatedAt: now,
    });
  } else {
    await idbPut('episodes', {
      ...data,
      userNotes: '',
      userTags: [],
      firstSeenAt: now,
      isDeleted: false,
      updatedAt: now,
    });
  }
}

export async function upsertEpisodes(episodes: any[]): Promise<void> {
  for (const ep of episodes) {
    await upsertEpisode(ep);
  }
}

export const getEpisode = (eid: string): Promise<any> => idbGet('episodes', eid);

export async function getEpisodesByPodcast(podcastId: string): Promise<any[]> {
  const episodes = await idbGetByIndex('episodes', 'podcastId', podcastId);
  return episodes.sort((a: any, b: any) => parsePubDateMs(b.pubDate) - parsePubDateMs(a.pubDate));
}

export async function getEpisodeCount(podcastId: string): Promise<number> {
  const episodes = await idbGetByIndex('episodes', 'podcastId', podcastId);
  return episodes.length;
}

// All episodes across every podcast, newest first. Used by local episode search
// (the "search subscribed episodes" tab). We full-scan the store and sort in JS
// rather than using the pubDate index because pubDate is stored as an RSS date
// string, which does not key-range against numeric timestamps.
export async function getAllEpisodes(): Promise<any[]> {
  const episodes = await idbGetAll('episodes');
  return episodes.sort((a: any, b: any) => parsePubDateMs(b.pubDate) - parsePubDateMs(a.pubDate));
}
