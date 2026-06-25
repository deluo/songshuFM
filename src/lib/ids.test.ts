import { describe, it, expect } from 'vitest';
import { derivePodcastId, deriveEpisodeId } from './ids';

describe('derivePodcastId', () => {
  it('produces ext- prefix', () => {
    expect(derivePodcastId('https://example.com/feed.xml')).toMatch(/^ext-/);
  });
  it('is deterministic for same input', () => {
    expect(derivePodcastId('https://example.com/feed.xml')).toBe(derivePodcastId('https://example.com/feed.xml'));
  });
  it('differs for different input', () => {
    expect(derivePodcastId('https://a.com/feed.xml')).not.toBe(derivePodcastId('https://b.com/feed.xml'));
  });
});

describe('deriveEpisodeId', () => {
  it('produces ep- prefix', () => {
    expect(deriveEpisodeId('guid-1', 'https://a.com/ep1.mp3', 'Title', 'date')).toMatch(/^ep-/);
  });
  it('prefers guid when present', () => {
    const a = deriveEpisodeId('guid-1', 'url-a', 'title', 'date');
    const b = deriveEpisodeId('guid-1', 'url-b', 'other', 'other-date');
    expect(a).toBe(b);
  });
  it('falls back to audioUrl when guid empty', () => {
    const a = deriveEpisodeId('', 'url-a', 'title', 'date');
    const b = deriveEpisodeId('', 'url-a', 'other', 'other-date');
    expect(a).toBe(b);
  });
  it('falls back to title+pubDate when guid and audioUrl empty', () => {
    const a = deriveEpisodeId('', '', 'Same Title', '2024-01-01');
    const b = deriveEpisodeId('', '', 'Same Title', '2024-01-01');
    expect(a).toBe(b);
  });
});
