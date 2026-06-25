import { idbGet, idbGetAll, idbPut, idbClear, withRecord } from '../db';
import { getPlayHistory } from './play-history';
import { toMonthKey, toDayKey } from '../../lib/dates';

// listenStats store, keyed by monthKey ('YYYY-MM'). updateListenStats keeps two
// internal scratch fields on disk (_activeDaysSet, _episodeIds) for cross-call
// dedup across separate SW wakes; stripInternal removes them before returning to
// consumers/sync so the leak the old db.ts had (exportAll shipped them) is fixed.

function stripInternal<T extends Record<string, any>>(record: T): T {
  if (!record) return record;
  const { _activeDaysSet, _episodeIds, ...clean } = record;
  return clean as T;
}

export async function getListenStats(monthKey: string): Promise<any> {
  const rec = await idbGet('listenStats', monthKey);
  return rec ? stripInternal(rec) : null;
}

export async function getAllListenStats(): Promise<Record<string, any>> {
  const all = await idbGetAll('listenStats');
  const result: Record<string, any> = {};
  for (const s of all) result[s.monthKey] = stripInternal(s);
  return result;
}

export async function updateListenStats(monthKey: string, increment: any): Promise<void> {
  await withRecord<any>('listenStats', monthKey, (existing) => {
    const rec = existing || {
      monthKey,
      totalDuration: 0,
      activeDays: 0,
      episodeCount: 0,
      byPodcast: {},
      updatedAt: 0,
      _activeDaysSet: {},
      _episodeIds: {},
    };
    rec.totalDuration += increment.duration || 0;
    const now = new Date();
    const dayKey = toDayKey(now.getTime());
    if (!rec._activeDaysSet) rec._activeDaysSet = {};
    if (!rec._activeDaysSet[dayKey]) {
      rec._activeDaysSet[dayKey] = true;
      rec.activeDays = (rec.activeDays || 0) + 1;
    }
    if (increment.episodeId) {
      if (!rec._episodeIds) rec._episodeIds = {};
      if (!rec._episodeIds[increment.episodeId]) {
        rec._episodeIds[increment.episodeId] = true;
        rec.episodeCount = (rec.episodeCount || 0) + 1;
      }
    }
    if (increment.podcastId) {
      if (!rec.byPodcast) rec.byPodcast = {};
      if (!rec.byPodcast[increment.podcastId]) {
        rec.byPodcast[increment.podcastId] = {
          name: increment.podcastName || '',
          duration: 0,
          coverUrl: increment.coverUrl || '',
        };
      }
      rec.byPodcast[increment.podcastId].duration += increment.duration || 0;
      if (increment.coverUrl) rec.byPodcast[increment.podcastId].coverUrl = increment.coverUrl;
      if (increment.podcastName) rec.byPodcast[increment.podcastId].name = increment.podcastName;
    }
    rec.updatedAt = Date.now();
    return rec;
  });
}

export async function rebuildListenStatsFromHistory(): Promise<Record<string, any>> {
  const history = await getPlayHistory(99999);
  const monthData: Record<string, any> = {};
  for (const entry of history) {
    if (!entry.lastPlayedAt && !entry.playedAt) continue;
    const d = new Date(entry.lastPlayedAt || entry.playedAt);
    const monthKey = toMonthKey(d.getTime());
    if (!monthData[monthKey]) {
      monthData[monthKey] = {
        monthKey,
        totalDuration: 0,
        activeDaysSet: new Set<string>(),
        episodeIds: new Set<string>(),
        byPodcast: {} as Record<string, any>,
      };
    }
    const s = monthData[monthKey];
    const duration = entry.listenedDuration || entry.duration || 0;
    s.totalDuration += duration;
    s.activeDaysSet.add(toDayKey(d.getTime()));
    s.episodeIds.add(entry.eid);
    const pid = entry.podcastId;
    if (pid) {
      if (!s.byPodcast[pid]) s.byPodcast[pid] = { name: entry.podcastName || '', duration: 0, coverUrl: entry.coverUrl || '' };
      s.byPodcast[pid].duration += duration;
      if (entry.coverUrl) s.byPodcast[pid].coverUrl = entry.coverUrl;
      if (entry.podcastName) s.byPodcast[pid].name = entry.podcastName;
    }
  }
  await idbClear('listenStats');
  const stats: Record<string, any> = {};
  for (const [key, data] of Object.entries(monthData)) {
    const record = {
      monthKey: key,
      totalDuration: data.totalDuration,
      activeDays: data.activeDaysSet.size,
      episodeCount: data.episodeIds.size,
      byPodcast: data.byPodcast,
      updatedAt: Date.now(),
    };
    await idbPut('listenStats', record);
    stats[key] = record;
  }
  return stats;
}
