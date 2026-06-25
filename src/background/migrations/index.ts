import { getDB } from '../../data/db';
import { getSyncMeta, setSyncMeta } from '../../data/repositories/sync-meta';
import { migrateEpisodeSync } from './003-episode-sync';
import { migrateClearEpisodeCacheKey } from './003-clear-episode-cache-key';
import { migrateSeedSubscriptionMeta } from './003-seed-subscription-meta';

export interface MigrationContext {
  db: IDBDatabase;
  meta: { get(key: string): Promise<any>; set(key: string, value: any): Promise<void> };
}

export interface Migration {
  version: number;
  id: string; // unique, used for idempotent record in syncMeta._migrations.applied
  run(ctx: MigrationContext): Promise<void>;
}

export const MIGRATIONS: Migration[] = [
  { version: 3, id: 'clear-episode-cache-key', run: migrateClearEpisodeCacheKey },
  { version: 3, id: 'seed-subscription-meta', run: migrateSeedSubscriptionMeta },
  { version: 3, id: 'episode-sync-fields', run: migrateEpisodeSync },
];

// Run all not-yet-applied migrations in registration order, recording each id in
// syncMeta._migrations.applied. Idempotent: a recycled SW that calls this again
// skips everything already in the applied list. Structural changes (stores/indexes)
// live in db.ts onupgradeneeded; this framework is for DATA migrations only.
export async function runMigrations(ctx?: MigrationContext): Promise<void> {
  const c = ctx ?? { db: await getDB(), meta: { get: getSyncMeta, set: setSyncMeta } };
  const record = (await c.meta.get('_migrations')) || { applied: [] };
  const applied = new Set<string>(record.applied);
  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue;
    await m.run(c);
    applied.add(m.id);
  }
  await c.meta.set('_migrations', { applied: [...applied] });
}
