import { idbGet, idbGetByIndex, idbPut, idbDelete, idbCount } from '../db';

// audioUrls store: per-episode resolved audio URL cache. Activated in WF4
// (services/audio-url.ts); before that the store exists but is only populated
// opportunistically. getStats returns a real count (no fake * 300 size).

export async function getAudioUrl(eid: string): Promise<string | null> {
  if (!eid) return null;
  const entry = await idbGet('audioUrls', eid);
  return entry?.url || null;
}

export async function setAudioUrl(eid: string, url: string, podcastId: string): Promise<void> {
  if (!eid || !url) return;
  await idbPut('audioUrls', {
    eid, url, podcastId,
    cachedAt: Date.now(),
    verifiedAt: Date.now(),
  });
}

export const removeAudioUrl = (eid: string): Promise<void> => idbDelete('audioUrls', eid);

export async function removeAudioUrlsByPodcast(podcastId: string): Promise<number> {
  const entries = await idbGetByIndex('audioUrls', 'podcastId', podcastId);
  for (const entry of entries) {
    await idbDelete('audioUrls', entry.eid);
  }
  return entries.length;
}

// Real stats — just a count. The old db.ts returned totalSize = count * 300 (a
// fabricated per-file size); that was misleading. Callers needing real size can
// sum audioCacheMeta entries (the chrome.downloads cache), which is a different store.
export async function getAudioUrlStats(): Promise<{ totalCached: number }> {
  return { totalCached: await idbCount('audioUrls') };
}
