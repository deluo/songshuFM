// SHIM — re-exports the data layer for backwards compatibility with existing
// `from '../db'` / `from './db'` importers. The real implementation now lives in
// src/data/. This file is DELETED in WF4 once handlers/services are rewritten to
// import from ../data directly. Do not add new exports here.
export {
  getDB,
  withRecord,
  idbPut, idbGet, idbGetAll, idbGetByIndex, idbDelete, idbClear, idbCount,
} from '../data/db';

// Per-table repository functions (formerly defined inline in this file).
export {
  upsertPodcast, getPodcast, getSubscribedPodcasts, getAllPodcasts, removePodcast,
} from '../data/repositories/podcasts';
export {
  upsertEpisode, upsertEpisodes, getEpisode, getEpisodesByPodcast, getEpisodeCount, getAllEpisodes,
} from '../data/repositories/episodes';
export {
  addOrUpdatePlayHistory, getPlayHistory, removePlayHistory, clearPlayHistory,
  getPlayPosition, updatePlayPosition, incrementListenDuration, getPlayedEpisodeIds,
} from '../data/repositories/play-history';
export {
  addFavorite, removeFavorite, isFavorite, getFavorites,
} from '../data/repositories/favorites';
export {
  getAudioUrl, setAudioUrl, removeAudioUrl, removeAudioUrlsByPodcast, getAudioUrlStats,
} from '../data/repositories/audio-urls';
export {
  getListenStats, getAllListenStats, updateListenStats, rebuildListenStatsFromHistory,
} from '../data/repositories/listen-stats';
export {
  getSyncMeta, setSyncMeta,
} from '../data/repositories/sync-meta';
export {
  exportAll, importAll, importAllOverwrite,
} from '../data/import-export';

// audioCacheMeta store helpers — generic CRUD over the chrome.downloads cache
// metadata store. Belongs with handlers/audio-cache.ts long-term; kept here as
// thin wrappers over the data DAL so the old function names keep resolving until
// WF4 moves them into a repository.
import { idbGet, idbPut, idbDelete, idbGetAll, idbClear } from '../data/db';

export const getAudioCacheMeta = (eid: string) => idbGet('audioCacheMeta', eid);
export const setAudioCacheMeta = (data: any) => idbPut('audioCacheMeta', data);
export const deleteAudioCacheMeta = (eid: string) => idbDelete('audioCacheMeta', eid);
export const getAllAudioCacheMeta = () => idbGetAll('audioCacheMeta');
export const clearAudioCacheMeta = () => idbClear('audioCacheMeta');
