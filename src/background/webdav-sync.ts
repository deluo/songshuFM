import { exportAll, importAll, importAllOverwrite, getSyncMeta, setSyncMeta } from './db';

const WEBDAV_SETTINGS_KEY = 'webdavSettings';
const SYNC_FILENAME = 'sync.json';

export async function getWebDAVConfig(): Promise<any> {
  const result = await chrome.storage.local.get(WEBDAV_SETTINGS_KEY);
  return result[WEBDAV_SETTINGS_KEY] || { enabled: false };
}

export async function setWebDAVConfig(config: any): Promise<void> {
  await chrome.storage.local.set({ [WEBDAV_SETTINGS_KEY]: config });
}

function buildHeaders(username: string, password: string): Record<string, string> {
  // UTF-8-safe Base64. Plain btoa() throws InvalidCharacterError on non-ASCII
  // credentials (e.g. Chinese passwords), so encode the raw pair as UTF-8 bytes
  // first (RFC 7617-compatible).
  const raw = new TextEncoder().encode(`${username}:${password}`);
  const encoded = btoa(String.fromCharCode(...raw));
  return {
    'Authorization': `Basic ${encoded}`,
    'Content-Type': 'application/json',
  };
}

async function davMkcol(url: string, headers: Record<string, string>): Promise<boolean> {
  try {
    const resp = await fetch(url, { method: 'MKCOL', headers });
    if (!resp.ok && resp.status !== 405) {
      console.error('[WebDAV] MKCOL failed:', resp.status, url);
    }
    return resp.ok || resp.status === 405;
  } catch (e: any) {
    console.error('[WebDAV] MKCOL error:', e.message, url);
    return false;
  }
}

async function davPut(url: string, headers: Record<string, string>, data: any): Promise<boolean> {
  try {
    const resp = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(data) });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      console.error('[WebDAV] PUT failed:', resp.status, url, body.slice(0, 200));
      throw new Error(`PUT ${resp.status}: ${body.slice(0, 100)}`);
    }
    return true;
  } catch (e: any) {
    if (e.message.startsWith('PUT ')) throw e;
    console.error('[WebDAV] PUT error:', e.message, url);
    throw new Error(`PUT network error: ${e.message}`);
  }
}

async function davGet(url: string, headers: Record<string, string>): Promise<any> {
  try {
    const resp = await fetch(url, { method: 'GET', headers });
    if (!resp.ok) {
      console.error('[WebDAV] GET failed:', resp.status, url);
      return null;
    }
    return await resp.json();
  } catch (e: any) {
    console.error('[WebDAV] GET error:', e.message, url);
    return null;
  }
}

function syncFileUrl(baseUrl: string, syncPath: string): string {
  return baseUrl + syncPath + SYNC_FILENAME;
}

function mergeRecords(
  localRecords: any[],
  remoteRecords: any[],
  keyField: string,
  mergeFn: (local: any, remote: any) => any
): any[] {
  const merged = new Map<string, any>();
  for (const r of localRecords) merged.set(r[keyField], r);
  for (const r of remoteRecords) {
    const existing = merged.get(r[keyField]);
    if (!existing) {
      merged.set(r[keyField], r);
    } else {
      merged.set(r[keyField], mergeFn(existing, r));
    }
  }
  return Array.from(merged.values());
}

function mergeEpisode(local: any, remote: any): any {
  const winner = (local.updatedAt || 0) >= (remote.updatedAt || 0) ? local : remote;
  return {
    ...winner,
    userNotes: local.userNotes || remote.userNotes || '',
    userTags: [...new Set([...(local.userTags || []), ...(remote.userTags || [])])],
    firstSeenAt: Math.min(local.firstSeenAt || Infinity, remote.firstSeenAt || Infinity),
  };
}

function mergePlayHistory(local: any, remote: any): any {
  const winner = (local.lastPlayedAt || 0) >= (remote.lastPlayedAt || 0) ? local : remote;
  return {
    ...winner,
    listenedDuration: Math.max(local.listenedDuration || 0, remote.listenedDuration || 0),
  };
}

function mergeFavorite(local: any, remote: any): any {
  return { ...local, favoritedAt: Math.min(local.favoritedAt, remote.favoritedAt) };
}

function mergeAudioUrl(local: any, remote: any): any {
  return (local.cachedAt || 0) >= (remote.cachedAt || 0) ? local : remote;
}

function mergeStats(local: any, remote: any): any {
  return {
    ...local,
    totalDuration: Math.max(local.totalDuration || 0, remote.totalDuration || 0),
    activeDays: Math.max(local.activeDays || 0, remote.activeDays || 0),
    episodeCount: Math.max(local.episodeCount || 0, remote.episodeCount || 0),
  };
}

function mergePodcast(local: any, remote: any): any {
  return (local.updatedAt || 0) >= (remote.updatedAt || 0) ? local : remote;
}

function filterMetadataOnly(data: any): any {
  const { episodes, audioUrls, ...rest } = data;
  return rest;
}

function mergeData(localData: any, remoteData: any): any {
  return {
    version: 1,
    deviceId: localData.deviceId,
    exportedAt: Date.now(),
    podcasts: mergeRecords(localData.podcasts || [], remoteData.podcasts || [], 'pid', mergePodcast),
    playHistory: mergeRecords(localData.playHistory || [], remoteData.playHistory || [], 'eid', mergePlayHistory),
    favorites: mergeRecords(localData.favorites || [], remoteData.favorites || [], 'eid', mergeFavorite),
    listenStats: mergeRecords(localData.listenStats || [], remoteData.listenStats || [], 'monthKey', mergeStats),
  };
}

export async function performSync(overrideMode: string): Promise<any> {
  const config = await getWebDAVConfig();
  if (!config.enabled || !config.serverUrl || !config.username || !config.password) {
    return { success: false, error: 'WebDAV not configured' };
  }

  const headers = buildHeaders(config.username, config.password);
  const syncPath = (config.syncPath || '/songshu-fm-sync/').replace(/\/?$/, '/');
  const baseUrl = config.serverUrl.replace(/\/?$/, '');
  const mode = overrideMode || config.syncMode || 'merge';

  if (mode === 'check') {
    return performConflictCheck(baseUrl, syncPath, headers);
  }

  await davMkcol(baseUrl + syncPath, headers);

  if (mode === 'upload') {
    return performUploadSync(baseUrl, syncPath, headers);
  } else if (mode === 'download') {
    return performDownloadSync(baseUrl, syncPath, headers);
  }
  return performMergeSync(baseUrl, syncPath, headers);
}

async function performConflictCheck(baseUrl: string, syncPath: string, headers: Record<string, string>): Promise<any> {
  const localModifiedAt = await getSyncMeta('localModifiedAt') || 0;
  const localLastSyncAt = await getSyncMeta('lastSyncAt') || 0;
  const hasLocalChanges = localModifiedAt > localLastSyncAt;

  const remoteData = await davGet(syncFileUrl(baseUrl, syncPath), headers);

  if (!remoteData) {
    return { success: true, conflict: false, autoMode: 'upload' };
  }

  const remoteExportedAt = remoteData.exportedAt || 0;
  const hasRemoteChanges = remoteExportedAt > localLastSyncAt;

  if (hasLocalChanges && hasRemoteChanges) {
    return { success: false, conflict: true };
  }

  return { success: true, conflict: false, autoMode: hasRemoteChanges ? 'download' : 'upload' };
}

async function performMergeSync(baseUrl: string, syncPath: string, headers: Record<string, string>): Promise<any> {
  const localData = await exportAll();
  const fileUrl = syncFileUrl(baseUrl, syncPath);

  const remoteData = await davGet(fileUrl, headers);

  let mergedData = localData;
  if (remoteData) {
    mergedData = mergeData(localData, remoteData);
  }

  await importAll(mergedData);
  await davPut(fileUrl, headers, filterMetadataOnly(mergedData));

  await setSyncMeta('lastSyncAt', Date.now());
  await setSyncMeta('lastSyncStatus', 'success');
  return { success: true, timestamp: Date.now() };
}

async function performUploadSync(baseUrl: string, syncPath: string, headers: Record<string, string>): Promise<any> {
  const localData = await exportAll();
  const ok = await davPut(syncFileUrl(baseUrl, syncPath), headers, filterMetadataOnly(localData));
  if (!ok) return { success: false, error: 'Upload failed' };

  await setSyncMeta('lastSyncAt', Date.now());
  await setSyncMeta('lastSyncStatus', 'success');
  return { success: true, timestamp: Date.now() };
}

async function performDownloadSync(baseUrl: string, syncPath: string, headers: Record<string, string>): Promise<any> {
  const remoteData = await davGet(syncFileUrl(baseUrl, syncPath), headers);

  if (!remoteData) {
    return { success: false, error: 'Remote sync file not found' };
  }

  await importAllOverwrite(remoteData);

  await setSyncMeta('lastSyncAt', Date.now());
  await setSyncMeta('lastSyncStatus', 'success');
  return { success: true, timestamp: Date.now() };
}

export async function getWebDAVStatus(): Promise<any> {
  const config = await getWebDAVConfig();
  const lastSyncAt = await getSyncMeta('lastSyncAt');
  const lastSyncStatus = await getSyncMeta('lastSyncStatus');
  const lastSyncError = await getSyncMeta('lastSyncError');
  const lastFailedAt = await getSyncMeta('lastFailedAt');
  return {
    enabled: config.enabled,
    serverUrl: config.serverUrl || '',
    lastSyncAt,
    lastSyncStatus,
    lastSyncError,
    lastFailedAt,
  };
}
