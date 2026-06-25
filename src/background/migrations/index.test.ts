import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { runMigrations, MIGRATIONS, type MigrationContext } from './index';
import { getSyncMeta, setSyncMeta } from '../../data/repositories/sync-meta';
import { getDB } from '../../data/db';

async function makeCtx(): Promise<MigrationContext> {
  return { db: await getDB(), meta: { get: getSyncMeta, set: setSyncMeta } };
}

// fake-indexeddb persists across tests in the same process; reset the migration
// record so each test starts from a clean "nothing applied" state.
beforeEach(async () => {
  await setSyncMeta('_migrations', { applied: [] });
});

describe('runMigrations', () => {
  it('runs all registered migrations and records their ids', async () => {
    const ctx = await makeCtx();
    await runMigrations(ctx);
    const rec = await getSyncMeta('_migrations');
    expect(rec.applied).toEqual(MIGRATIONS.map((m) => m.id));
  });

  it('does not rerun already-applied migrations', async () => {
    const ctx = await makeCtx();
    const spy = vi.spyOn(MIGRATIONS[0], 'run');
    await runMigrations(ctx);
    await runMigrations(ctx);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('applies new migrations added after a prior run', async () => {
    const ctx = await makeCtx();
    await runMigrations(ctx);
    const extra: (typeof MIGRATIONS)[number] = {
      version: 99, id: 'test-extra', run: vi.fn(async () => {}),
    };
    (MIGRATIONS as any).push(extra);
    try {
      await runMigrations(ctx);
      // Extra ran once; the original three did not rerun (already applied).
      expect(extra.run).toHaveBeenCalledTimes(1);
    } finally {
      (MIGRATIONS as any).pop();
    }
  });
});
