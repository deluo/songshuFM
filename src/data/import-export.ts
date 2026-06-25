import { idbGetAll, idbPut, idbClear } from './db';
import { SYNC_VERSION } from '../lib/constants';

// Batch import/export of all synced stores. Kept separate from the per-table
// repositories barrel (which is for single-record CRUD) so batch semantics don't
// pollute the per-table surface.
//
// SYNCED_STORES is the authoritative list of what round-trips through sync.json.
// importAll now includes episodes + audioUrls (the old db.ts skipped them, which
// silently lost episode play-position/notes on merge-mode restore). Merge-mode
// importMerge (WF5) layers mergeRecord on top of this.
const SYNCED_STORES = ['podcasts', 'episodes', 'playHistory', 'favorites', 'audioUrls', 'listenStats'] as const;

export async function exportAll(): Promise<any> {
  const out: any = { version: SYNC_VERSION, deviceId: 'local', exportedAt: Date.now() };
  for (const s of SYNCED_STORES) out[s] = await idbGetAll(s);
  return out;
}

export async function importAll(data: any): Promise<void> {
  if (!data || data.version !== SYNC_VERSION) throw new Error('Unsupported backup version');
  for (const s of SYNCED_STORES) {
    if (data[s]?.length) for (const record of data[s]) await idbPut(s, record);
  }
}

export async function importAllOverwrite(data: any): Promise<void> {
  if (!data || data.version !== SYNC_VERSION) throw new Error('Unsupported backup version');
  for (const s of SYNCED_STORES) {
    await idbClear(s);
    if (data[s]?.length) for (const record of data[s]) await idbPut(s, record);
  }
}
