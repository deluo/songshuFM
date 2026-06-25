import { idbGet, idbPut } from '../db';

// syncMeta store: small key/value bag used by the migration framework and
// sync-observer for bookkeeping (_migrations applied list, localModifiedAt, etc).
export const getSyncMeta = (key: string): Promise<any> =>
  idbGet('syncMeta', key).then((e: any) => e?.value ?? null);

export const setSyncMeta = (key: string, value: any): Promise<void> =>
  idbPut('syncMeta', { key, value });
