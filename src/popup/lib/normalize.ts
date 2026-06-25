// Normalizes the flat records returned by playHistory/favorites stores into the
// Episode view-model that the popup pages render. Unifies the near-identical
// normalizeHistoryEntry (history.tsx) and normalizeFavEntry (favorites.tsx).
export interface EpisodeView {
  id: string;
  eid: string;
  title: string;
  podcastId: string;
  podcastName: string;
  podcastTitle: string;
  coverUrl: string;
  audioUrl: string;
  feedUrl: string;
  duration: number;
  pubDate: string;
  lastPosition: number;
  listenedDuration: number;
}

export function toEpisodeView(record: any): EpisodeView {
  const id = record.eid || record.id || '';
  const podcastName = record.podcastName || record.podcastTitle || '';
  return {
    id,
    eid: id,
    title: record.title || '',
    podcastId: record.podcastId || '',
    podcastName,
    podcastTitle: record.podcastTitle || record.podcastName || '',
    coverUrl: record.coverUrl || '',
    audioUrl: record.audioUrl || '',
    feedUrl: record.feedUrl || '',
    duration: record.duration || 0,
    pubDate: record.pubDate || '',
    lastPosition: record.lastPosition || 0,
    listenedDuration: record.listenedDuration || 0,
  };
}
