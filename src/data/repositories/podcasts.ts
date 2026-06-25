import { idbGet, idbGetByIndex, idbGetAll, idbDelete, idbPut } from '../db';
import { decodeHtmlEntities } from '../../lib/utils';

// podcasts store. Subscriptions are podcasts with a non-null subscribedAt;
// getSubscribedPodcasts filters via the subscribedAt index lowerBound(1).

const TEXT_FIELDS_PODCAST = ['title', 'name', 'author', 'description'] as const;

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

export async function upsertPodcast(podcastData: any): Promise<void> {
  if (!podcastData.pid) return;
  const data = normalizeText(podcastData, TEXT_FIELDS_PODCAST);
  // Merge onto existing: preserve subscribedAt unless the caller explicitly sets it.
  const existing = await idbGet('podcasts', data.pid);
  if (existing) {
    const updated: Record<string, any> = { ...existing, ...data, updatedAt: Date.now() };
    if ('subscribedAt' in data) {
      updated.subscribedAt = data.subscribedAt;
    }
    await idbPut('podcasts', updated);
  } else {
    await idbPut('podcasts', { ...data, updatedAt: Date.now() });
  }
}

export const getPodcast = (pid: string): Promise<any> => idbGet('podcasts', pid);

export async function getSubscribedPodcasts(): Promise<any[]> {
  const all = await idbGetByIndex('podcasts', 'subscribedAt', IDBKeyRange.lowerBound(1));
  return all.sort((a: any, b: any) => (b.subscribedAt || 0) - (a.subscribedAt || 0));
}

export async function updateSubscription(podcastId: string, updates: any): Promise<void> {
  const podcast = await idbGet('podcasts', podcastId);
  if (!podcast) return;
  await idbPut('podcasts', { ...podcast, ...updates, updatedAt: Date.now() });
}

export const getAllPodcasts = (): Promise<any[]> => idbGetAll('podcasts');

export const removePodcast = (pid: string): Promise<void> => idbDelete('podcasts', pid);
