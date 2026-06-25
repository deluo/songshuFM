import { getWebDAVConfig, performSync } from './webdav-sync';
import { getSyncMeta, setSyncMeta } from './db';
import { MSG, broadcast } from '../lib/messaging';

const THROTTLE_MS = 3 * 60 * 1000;
const SYNC_ALARM = 'periodic-sync';

const dirtyStores = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

export function markDirty(storeName: string): void {
  dirtyStores.add(storeName);
  setSyncMeta('localModifiedAt', Date.now());
}

export function onPlaybackStop(): void {
  if (dirtyStores.size === 0) return;
  scheduleAutoSync();
}

function scheduleAutoSync(): void {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    throttledFlush();
  }, 2000);
}

async function throttledFlush(): Promise<void> {
  if (dirtyStores.size === 0) return;

  const lastSyncAt = await getSyncMeta('lastSyncAt') || 0;
  if (Date.now() - lastSyncAt < THROTTLE_MS) {
    console.log('[SyncObserver] Throttled, last sync was',
      Math.round((Date.now() - lastSyncAt) / 1000), 's ago');
    return;
  }

  await flushSync();
}

export async function onPeriodicSync(): Promise<void> {
  const localModifiedAt = await getSyncMeta('localModifiedAt') || 0;
  const lastSyncAt = await getSyncMeta('lastSyncAt') || 0;
  if (localModifiedAt <= lastSyncAt) return;

  dirtyStores.add('periodic');
  await throttledFlush();
}

export async function flushSync(): Promise<void> {
  if (dirtyStores.size === 0) return;

  const config = await getWebDAVConfig();
  if (!config.enabled || !config.serverUrl || !config.username || !config.password) {
    dirtyStores.clear();
    return;
  }

  const stores = Array.from(dirtyStores);
  dirtyStores.clear();

  console.log('[SyncObserver] Auto-sync triggered, dirty stores:', stores.join(', '));
  try {
    const result = await performSync('merge');
    if (!result.success) throw new Error(result.error || 'Unknown error');
    console.log('[SyncObserver] Auto-sync success, timestamp:', result.timestamp);
  } catch (e: any) {
    console.error('[SyncObserver] Auto-sync failed:', e.message);
    await setSyncMeta('lastSyncStatus', 'error');
    await setSyncMeta('lastSyncError', e.message);
    await setSyncMeta('lastFailedAt', Date.now());
    stores.forEach(s => dirtyStores.add(s));
  }
  console.log('[SyncObserver] Sending WEBDAV_SYNC_DONE notification');
  broadcast(MSG.WEBDAV_SYNC_DONE);
}

export function startPeriodicSync(): void {
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 5 });
}
