import { describe, it, expect } from 'vitest';
import {
  episodeStatus,
  filterEpisodes,
  type StatusFilter,
  type SortMode,
} from './filter-episodes';

const makeEp = (over: Partial<any> = {}) => ({
  id: 'e1',
  eid: 'e1',
  title: 'Episode One',
  description: 'about cats',
  pubDate: '2024-01-01',
  duration: 100,
  lastPosition: 0,
  ...over,
});

describe('episodeStatus', () => {
  it('returns unplayed when no position', () => {
    expect(episodeStatus(0, 100)).toBe('unplayed');
  });
  it('returns in-progress when position > 5 but not near end', () => {
    expect(episodeStatus(50, 100)).toBe('in-progress');
  });
  it('returns played when within 5s tolerance of duration', () => {
    expect(episodeStatus(96, 100)).toBe('played');
    expect(episodeStatus(100, 100)).toBe('played');
  });
  it('returns unplayed when position <= 5', () => {
    expect(episodeStatus(5, 100)).toBe('unplayed');
  });
  it('treats missing duration as unplayed/in-progress by position only', () => {
    expect(episodeStatus(0, 0)).toBe('unplayed');
    expect(episodeStatus(50, 0)).toBe('in-progress');
  });
});

describe('filterEpisodes', () => {
  const eps = [
    makeEp({ id: 'a', title: 'AI 与未来', description: 'tech', pubDate: '2024-03-01', duration: 100, lastPosition: 0 }),
    makeEp({ id: 'b', title: '猫咪日常', description: 'pets', pubDate: '2024-02-01', duration: 100, lastPosition: 50 }),
    makeEp({ id: 'c', title: 'AI 入门', description: 'intro', pubDate: '2024-01-01', duration: 100, lastPosition: 100 }),
  ];

  it('passes everything through with default opts', () => {
    expect(filterEpisodes(eps, { query: '', sortMode: 'new-old', statusFilter: 'all' })).toHaveLength(3);
  });

  it('filters by query on title (case-insensitive)', () => {
    const r = filterEpisodes(eps, { query: 'ai', sortMode: 'new-old', statusFilter: 'all' });
    expect(r.map((e) => e.id)).toEqual(['a', 'c']);
  });

  it('does NOT match on description (the list renders title only)', () => {
    // 'b' has description 'pets' but title '猫咪日常'; querying 'pets' must miss.
    const r = filterEpisodes(eps, { query: 'pets', sortMode: 'new-old', statusFilter: 'all' });
    expect(r).toEqual([]);
  });

  it('filters by status unplayed', () => {
    const r = filterEpisodes(eps, { query: '', sortMode: 'new-old', statusFilter: 'unplayed' });
    expect(r.map((e) => e.id)).toEqual(['a']);
  });

  it('filters by status in-progress', () => {
    const r = filterEpisodes(eps, { query: '', sortMode: 'new-old', statusFilter: 'in-progress' });
    expect(r.map((e) => e.id)).toEqual(['b']);
  });

  it('filters by status played', () => {
    const r = filterEpisodes(eps, { query: '', sortMode: 'new-old', statusFilter: 'played' });
    expect(r.map((e) => e.id)).toEqual(['c']);
  });

  it('sorts new-old by default (descending pubDate)', () => {
    const r = filterEpisodes(eps, { query: '', sortMode: 'new-old', statusFilter: 'all' });
    expect(r.map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('sorts old-new (ascending pubDate)', () => {
    const r = filterEpisodes(eps, { query: '', sortMode: 'old-new', statusFilter: 'all' });
    expect(r.map((e) => e.id)).toEqual(['c', 'b', 'a']);
  });

  it('combines query + status + sort', () => {
    const r = filterEpisodes(eps, { query: 'ai', sortMode: 'old-new', statusFilter: 'unplayed' });
    // only 'a' is unplayed among AI matches
    expect(r.map((e) => e.id)).toEqual(['a']);
  });

  it('returns empty when nothing matches', () => {
    expect(filterEpisodes(eps, { query: 'zzz', sortMode: 'new-old', statusFilter: 'all' })).toEqual([]);
  });

  it('does not mutate input array', () => {
    const copy = [...eps];
    filterEpisodes(eps, { query: 'ai', sortMode: 'old-new', statusFilter: 'all' });
    expect(eps.map((e) => e.id)).toEqual(copy.map((e) => e.id));
  });

  it('handles unparseable pubDate by treating as 0', () => {
    const bad = [makeEp({ id: 'x', pubDate: 'not-a-date' })];
    const r = filterEpisodes(bad, { query: '', sortMode: 'new-old', statusFilter: 'all' });
    expect(r).toHaveLength(1);
  });
});
