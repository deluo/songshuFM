import { simpleHash } from './utils';

// Single source of truth for ID derivation. Replaces the ext-/ep- hashing that was
// duplicated (and divergent) across api-search.ts, subscription.ts, and rss-parser.ts.
export function derivePodcastId(feedUrl: string): string {
  return `ext-${simpleHash(feedUrl)}`;
}

export function deriveEpisodeId(guid: string, audioUrl: string, title: string, pubDate: string): string {
  return `ep-${simpleHash(guid || audioUrl || title + pubDate)}`;
}
