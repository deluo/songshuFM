import { idbGet, idbGetAll, idbPut, idbDelete } from '../db';

// favorites store. Keyed by eid; favoritedAt drives ordering + sync merge.
export async function addFavorite(episodeData: any): Promise<void> {
  const eid = episodeData.episodeId || episodeData.eid || episodeData.id;
  if (!eid) return;
  await idbPut('favorites', {
    eid,
    title: episodeData.title || '',
    podcastId: episodeData.podcastId || '',
    podcastName: episodeData.podcastName || episodeData.podcastTitle || '',
    coverUrl: episodeData.coverUrl || '',
    duration: episodeData.duration || 0,
    audioUrl: episodeData.audioUrl || '',
    feedUrl: episodeData.feedUrl || '',
    favoritedAt: Date.now(),
  });
}

export const removeFavorite = (eid: string): Promise<void> => idbDelete('favorites', eid);

export async function isFavorite(eid: string): Promise<boolean> {
  const entry = await idbGet('favorites', eid);
  return !!entry;
}

export async function getFavorites(): Promise<any[]> {
  const all = await idbGetAll('favorites');
  return all.sort((a: any, b: any) => (b.favoritedAt || 0) - (a.favoritedAt || 0));
}
