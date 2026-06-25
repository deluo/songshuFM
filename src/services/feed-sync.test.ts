import { describe, it, expect } from 'vitest';
// diffAndPersist is split out as a pure function so the episode-count fix
// (was undercounting in-place updates) is unit-testable without touching IDB.
import { diffAndPersist } from './feed-sync';

describe('diffAndPersist', () => {
  it('counts in-place updates + new episodes correctly (no undercount)', () => {
    const existing = [
      { eid: 'e1', title: 'Old Title', pubDate: '2024-01-01' },
      { eid: 'e2', title: 'Ep 2', pubDate: '2024-01-02' },
    ];
    const parsed = [
      { eid: 'e1', title: 'Updated Title', pubDate: '2024-01-01' }, // matches existing
      { eid: 'e2', title: 'Ep 2', pubDate: '2024-01-02' },          // matches existing
      { eid: 'e3', title: 'New Ep', pubDate: '2024-01-03' },        // new
    ];
    const result = diffAndPersist(existing as any, parsed as any, 'p1');
    expect(result.episodeCount).toBe(3);   // existing.length(2) + newCount(1)
    expect(result.newCount).toBe(1);
    expect(result.updatedCount).toBe(2);   // e1 + e2 both already existed (by eid)
  });

  it('reports all-new when nothing exists', () => {
    const parsed = [{ eid: 'e1' }, { eid: 'e2' }];
    const result = diffAndPersist([], parsed as any, 'p1');
    expect(result.episodeCount).toBe(2);
    expect(result.newCount).toBe(2);
    expect(result.updatedCount).toBe(0);
  });

  it('reports nothing new when parsed is a subset of existing', () => {
    const existing = [{ eid: 'e1' }, { eid: 'e2' }];
    const parsed = [{ eid: 'e1' }];
    const result = diffAndPersist(existing as any, parsed as any, 'p1');
    expect(result.episodeCount).toBe(2); // unchanged
    expect(result.newCount).toBe(0);
    expect(result.updatedCount).toBe(1);
  });
});
