// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseFeed } from './parser';

const STANDARD = `<?xml version="1.0"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
<channel>
  <title>Test Show</title>
  <description>A show</description>
  <itunes:author>Author</itunes:author>
  <itunes:image href="https://example.com/cover.jpg"/>
  <item>
    <title>Ep 1</title>
    <enclosure url="https://example.com/ep1.mp3" length="1000" type="audio/mpeg"/>
    <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
    <itunes:duration>1800</itunes:duration>
    <guid>guid-1</guid>
    <description>desc 1</description>
  </item>
  <item>
    <title>Ep 2</title>
    <enclosure url="https://example.com/ep2.mp3"/>
    <pubDate>Tue, 02 Jan 2024 00:00:00 GMT</pubDate>
    <itunes:duration>00:30:00</itunes:duration>
  </item>
</channel>
</rss>`;

const MALFORMED = `<rss><channel><item><title>broken`;

describe('parseFeed', () => {
  it('parses channel metadata', () => {
    const r = parseFeed(STANDARD, 'https://example.com/feed.xml');
    expect(r.podcast.title).toBe('Test Show');
    expect(r.podcast.author).toBe('Author');
    expect(r.podcast.coverUrl).toBe('https://example.com/cover.jpg');
  });
  it('parses episodes with audioUrl + duration (newest-first)', () => {
    const r = parseFeed(STANDARD, 'https://example.com/feed.xml');
    expect(r.episodes).toHaveLength(2);
    // Ep 2 (Jan 2) sorts before Ep 1 (Jan 1) — newest-first.
    expect(r.episodes[0].audioUrl).toBe('https://example.com/ep2.mp3');
    expect(r.episodes[0].duration).toBe(1800);
  });
  it('parses HH:MM:SS duration', () => {
    const r = parseFeed(STANDARD, 'https://example.com/feed.xml');
    expect(r.episodes[1].duration).toBe(1800);
  });
  it('eid is deterministic across parses', () => {
    const a = parseFeed(STANDARD, 'x');
    const b = parseFeed(STANDARD, 'x');
    expect(a.episodes[0].eid).toBe(b.episodes[0].eid);
  });
  it('sorts episodes newest-first', () => {
    const r = parseFeed(STANDARD, 'x');
    expect(r.episodes[0].title).toBe('Ep 2');
  });
  it('throws on malformed XML', () => {
    expect(() => parseFeed(MALFORMED, 'x')).toThrow();
  });
});
