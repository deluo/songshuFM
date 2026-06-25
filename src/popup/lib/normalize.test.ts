import { describe, it, expect } from 'vitest';
import { toEpisodeView } from './normalize';

describe('toEpisodeView', () => {
  it('maps eid and id from either field', () => {
    expect(toEpisodeView({ eid: 'e1' }).eid).toBe('e1');
    expect(toEpisodeView({ id: 'e2' }).eid).toBe('e2');
  });
  it('falls back podcastName from podcastTitle', () => {
    expect(toEpisodeView({ podcastTitle: 'Show' }).podcastName).toBe('Show');
    expect(toEpisodeView({ podcastName: 'Show' }).podcastName).toBe('Show');
  });
  it('defaults numeric fields to 0/empty', () => {
    const v = toEpisodeView({});
    expect(v.duration).toBe(0);
    expect(v.lastPosition).toBe(0);
    expect(v.title).toBe('');
  });
  it('preserves all passed fields', () => {
    const v = toEpisodeView({ eid: 'e1', title: 'T', audioUrl: 'u', duration: 30, lastPosition: 5 });
    expect(v).toMatchObject({ eid: 'e1', id: 'e1', title: 'T', audioUrl: 'u', duration: 30, lastPosition: 5 });
  });
});
