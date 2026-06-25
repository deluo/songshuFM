import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';
import { withRecord, getDB } from './db';

describe('withRecord', () => {
  it('creates a new record when none exists', async () => {
    // Use the real 'episodes' store created by onupgradeneeded.
    await withRecord('episodes', 'ep-test-1', (existing) => existing ?? { eid: 'ep-test-1', title: 'New' });
    const db = await getDB();
    const got = await new Promise<any>((res) => {
      const tx = db.transaction('episodes', 'readonly');
      const r = tx.objectStore('episodes').get('ep-test-1');
      r.onsuccess = () => res(r.result);
    });
    expect(got.title).toBe('New');
  });

  it('updates an existing record', async () => {
    await withRecord('episodes', 'ep-test-2', () => ({ eid: 'ep-test-2', title: 'V1' }));
    await withRecord('episodes', 'ep-test-2', (existing) => ({ ...(existing as any), title: 'V2' }));
    const db = await getDB();
    const got = await new Promise<any>((res) => {
      const tx = db.transaction('episodes', 'readonly');
      const r = tx.objectStore('episodes').get('ep-test-2');
      r.onsuccess = () => res(r.result);
    });
    expect(got.title).toBe('V2');
  });

  it('skips write when mutate returns null', async () => {
    await withRecord('episodes', 'ep-test-3', () => ({ eid: 'ep-test-3', title: 'Keep' }));
    await withRecord('episodes', 'ep-test-3', () => null);
    const db = await getDB();
    const got = await new Promise<any>((res) => {
      const tx = db.transaction('episodes', 'readonly');
      const r = tx.objectStore('episodes').get('ep-test-3');
      r.onsuccess = () => res(r.result);
    });
    expect(got.title).toBe('Keep');
  });
});
