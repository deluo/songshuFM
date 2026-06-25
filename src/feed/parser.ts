import { decodeHtmlEntities } from '../lib/utils';
import { deriveEpisodeId } from '../lib/ids';
import { parsePubDateMs } from '../lib/dates';

export interface ParsedPodcast {
  title: string;
  description: string;
  author: string;
  coverUrl: string;
}
export interface ParsedEpisode {
  eid: string;
  title: string;
  audioUrl: string;
  duration: number;
  pubDate: string;
  pubDateMs: number;
  description: string;
  guid: string;
  coverUrl: string;
}
export interface ParsedFeed {
  podcast: ParsedPodcast;
  episodes: ParsedEpisode[];
}

// Parses HH:MM:SS, MM:SS, or bare seconds into a seconds count. Handles the
// three itunes:duration formats feeds actually emit.
function parseDuration(s: string | undefined | null): number {
  if (!s) return 0;
  const str = String(s).trim();
  if (str.includes(':')) {
    const parts = str.split(':').map((n) => parseInt(n, 10));
    if (parts.some((n) => isNaN(n))) return 0;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return 0;
  }
  const n = parseInt(str, 10);
  return isNaN(n) ? 0 : n;
}

function textOf(node: Element | Document, tag: string): string {
  const el = node.getElementsByTagName(tag)[0];
  return el ? decodeHtmlEntities(el.textContent || '').trim() : '';
}

function attrOf(node: Element | Document, tag: string, attr: string): string {
  const el = node.getElementsByTagName(tag)[0];
  if (!el) return '';
  const v = el.getAttribute(attr);
  return v ? decodeHtmlEntities(v).trim() : '';
}

// Parses an RSS/Atom feed XML using DOMParser. Throws on malformed XML so the
// caller (feed-sync) can retry or surface the error — the old regex parser
// silently returned empty arrays, masking bad feeds. Namespace tags
// (itunes:duration, itunes:image, content:encoded) are queryable directly in
// application/xml mode.
export function parseFeed(xml: string, feedUrl: string): ParsedFeed {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) {
    throw new Error(`Invalid XML in feed ${feedUrl}`);
  }

  const channel = doc.getElementsByTagName('channel')[0] || doc.documentElement;
  const podcast: ParsedPodcast = {
    title: textOf(channel, 'title'),
    description: textOf(channel, 'description') || textOf(channel, 'itunes:summary'),
    author: textOf(channel, 'itunes:author') || textOf(channel, 'managingEditor'),
    coverUrl: attrOf(channel, 'itunes:image', 'href'),
  };
  if (!podcast.coverUrl) {
    const urlEl = channel.getElementsByTagName('url')[0];
    if (urlEl) podcast.coverUrl = decodeHtmlEntities(urlEl.textContent || '').trim();
  }

  const items = Array.from(channel.getElementsByTagName('item'));
  const episodes: ParsedEpisode[] = items
    .map((item): ParsedEpisode => {
      const title = textOf(item, 'title');
      const audioUrl = attrOf(item, 'enclosure', 'url');
      const pubDate = textOf(item, 'pubDate');
      const guid = textOf(item, 'guid');
      return {
        eid: deriveEpisodeId(guid, audioUrl, title, pubDate),
        title,
        audioUrl,
        duration: parseDuration(textOf(item, 'itunes:duration')),
        pubDate,
        pubDateMs: parsePubDateMs(pubDate),
        description:
          textOf(item, 'description') ||
          textOf(item, 'itunes:summary') ||
          textOf(item, 'content:encoded'),
        guid,
        coverUrl: attrOf(item, 'itunes:image', 'href'),
      };
    })
    .filter((e) => e.title);

  episodes.sort((a, b) => b.pubDateMs - a.pubDateMs);
  return { podcast, episodes };
}
