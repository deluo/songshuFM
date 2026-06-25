import { idbGet, idbGetAll, idbDelete, idbClear, withRecord } from '../db';

// playHistory store. Each entry is keyed by eid and tracks last-played time,
// cumulative listened duration, and resume position.

export async function addOrUpdatePlayHistory(episodeData: any): Promise<void> {
  if (!episodeData.eid && !episodeData.id) return;
  const eid = episodeData.eid || episodeData.id;
  const now = Date.now();
  await withRecord<any>('playHistory', eid, (existing) => {
    if (existing) {
      existing.lastPlayedAt = now;
      existing.listenedDuration = (existing.listenedDuration || 0) + (episodeData._incrementDuration || 0);
      if (episodeData.lastPosition != null) existing.lastPosition = episodeData.lastPosition;
      if (episodeData.podcastName) existing.podcastName = episodeData.podcastName;
      if (episodeData.podcastId) existing.podcastId = episodeData.podcastId;
      if (episodeData.coverUrl) existing.coverUrl = episodeData.coverUrl;
      if (episodeData.audioUrl) existing.audioUrl = episodeData.audioUrl;
      if (episodeData.feedUrl) existing.feedUrl = episodeData.feedUrl;
      return existing;
    }
    return {
      eid,
      title: episodeData.title || '',
      podcastId: episodeData.podcastId || '',
      podcastName: episodeData.podcastName || episodeData.podcastTitle || '',
      coverUrl: episodeData.coverUrl || '',
      duration: episodeData.duration || 0,
      audioUrl: episodeData.audioUrl || '',
      feedUrl: episodeData.feedUrl || '',
      listenedDuration: episodeData._incrementDuration || 0,
      lastPosition: episodeData.lastPosition || 0,
      playedAt: now,
      lastPlayedAt: now,
    };
  });
}

export async function getPlayHistory(limit: number = 500): Promise<any[]> {
  const all = await idbGetAll('playHistory');
  return all.sort((a: any, b: any) => (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0)).slice(0, limit);
}

export const removePlayHistory = (eid: string): Promise<void> => idbDelete('playHistory', eid);
export const clearPlayHistory = (): Promise<void> => idbClear('playHistory');

export async function getPlayPosition(eid: string): Promise<number> {
  if (!eid) return 0;
  const entry = await idbGet('playHistory', eid);
  return entry?.lastPosition || 0;
}

export async function updatePlayPosition(eid: string, position: number): Promise<void> {
  if (!eid || position == null) return;
  await withRecord<any>('playHistory', eid, (existing) =>
    existing ? { ...existing, lastPosition: position } : null,
  );
}

export async function incrementListenDuration(eid: string, increment: number): Promise<void> {
  if (!eid || !increment) return;
  await withRecord<any>('playHistory', eid, (existing) => {
    if (!existing) return null;
    existing.listenedDuration = (existing.listenedDuration || 0) + increment;
    existing.lastPlayedAt = Date.now();
    return existing;
  });
}

export async function getPlayedEpisodeIds(): Promise<Set<string>> {
  const all = await idbGetAll('playHistory');
  return new Set(all.map((e: any) => e.eid));
}
