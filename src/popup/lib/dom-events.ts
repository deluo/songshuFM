// Unified cross-page event dispatch. ALL navigation/play events dispatch on
// `document` (never `window`) — this was the root cause of the history play and
// sub-mgmt open-podcast buttons being dead (window-dispatched events don't reach
// document listeners).

type NavDetail = { page: string; data?: Record<string, any> };
type PodcastDetail = { id: string; feedUrl?: string };
type PlayDetail = { episode: any; episodeList?: any[]; podcast?: any; autoPlay?: boolean; resumeTime?: number };

export const dispatchOpenPage = (d: NavDetail) =>
  document.dispatchEvent(new CustomEvent('open-page', { detail: d }));
export const dispatchOpenPodcast = (d: PodcastDetail) =>
  document.dispatchEvent(new CustomEvent('open-podcast', { detail: d }));
export const dispatchClosePage = () =>
  document.dispatchEvent(new CustomEvent('close-page'));
export const dispatchPlayEpisode = (d: PlayDetail) =>
  document.dispatchEvent(new CustomEvent('play-episode', { detail: d }));
export const dispatchPlayResume = (d: PlayDetail) =>
  document.dispatchEvent(new CustomEvent('play-resume', { detail: d }));
export const dispatchRefreshMine = () =>
  document.dispatchEvent(new CustomEvent('refresh-mine'));
export const dispatchHistoryUpdated = () =>
  document.dispatchEvent(new CustomEvent('history-updated'));

export function onDocEvent(name: string, handler: (e: Event) => void): () => void {
  document.addEventListener(name, handler);
  return () => document.removeEventListener(name, handler);
}
