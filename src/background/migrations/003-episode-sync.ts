import type { MigrationContext } from './index';

// Adds episodeSyncedAt to podcasts that lack it, so a future incremental sync
// can pick up only episodes changed since that timestamp. Full-merge still works
// without it (episodes merge by updatedAt), so this is a forward-looking seed.
// Idempotent: only sets the field when absent.
export async function migrateEpisodeSync(ctx: MigrationContext): Promise<void> {
  const { db } = ctx;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('podcasts', 'readwrite');
    const store = tx.objectStore('podcasts');
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      const rec = cursor.value;
      if (rec && rec.episodeSyncedAt == null) {
        rec.episodeSyncedAt = rec.updatedAt || 0;
        cursor.update(rec);
      }
      cursor.continue();
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
