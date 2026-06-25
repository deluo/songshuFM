import { decodeHtmlEntities, simpleHash } from '../lib/utils';

function parseDuration(durationStr: string | number | undefined): number {
  if (!durationStr) return 0;
  const str = String(durationStr).trim();
  if (str.includes(':')) {
    const parts = str.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return 0;
  }
  const num = parseInt(str, 10);
  return isNaN(num) ? 0 : num;
}

function extractText(xml: string, tagName: string): string {
  const patterns = [
    new RegExp(`<${tagName}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tagName}>`, 'i'),
    new RegExp(`<${tagName}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tagName}\\s*>`, 'i'),
  ];
  for (const p of patterns) {
    const m = xml.match(p);
    if (m && m[1]) return decodeHtmlEntities(m[1]).trim();
  }
  return '';
}

function extractAttr(xml: string, tagName: string, attrName: string): string {
  const p = new RegExp(`<${tagName}[^>]*${attrName}\\s*=\\s*["']([^"']+)["']`, 'i');
  const m = xml.match(p);
  return m ? m[1] : '';
}

export interface RssPodcast {
  title: string;
  description: string;
  author: string;
  coverUrl: string;
}

export interface RssEpisode {
  id: string;
  title: string;
  audioUrl: string;
  duration: number;
  pubDate: string;
  description: string;
  guid: string;
  coverUrl: string;
}

export interface RssFeedResult {
  podcast: RssPodcast;
  episodes: RssEpisode[];
}

export function parseRssFeed(xmlString: string, feedUrl: string): RssFeedResult {
  const podcast: RssPodcast = {
    title: '',
    description: '',
    author: '',
    coverUrl: '',
  };

  const episodes: RssEpisode[] = [];

  try {
    const channelMatch = xmlString.match(/<channel[^>]*>([\s\S]*?)<\/channel>/i);
    const channelContent = channelMatch ? channelMatch[1] : xmlString;

    podcast.title = extractText(channelContent, 'title') || extractText(channelContent, 'itunes:name');
    podcast.description = extractText(channelContent, 'description') || extractText(channelContent, 'itunes:summary');
    podcast.author = extractText(channelContent, 'itunes:author') || extractText(channelContent, 'managingEditor');

    const itunesImage = extractAttr(channelContent, 'itunes:image', 'href');
    if (itunesImage) {
      podcast.coverUrl = decodeHtmlEntities(itunesImage);
    } else {
      const imageMatch = channelContent.match(/<image[^>]*>[\s\S]*?<url[^>]*>([^<]+)<\/url>[\s\S]*?<\/image>/i);
      if (imageMatch) podcast.coverUrl = decodeHtmlEntities(imageMatch[1]).trim();
    }

    const itemPattern = /<item[^>]*>([\s\S]*?)<\/item>/gi;
    let itemMatch: RegExpExecArray | null;
    while ((itemMatch = itemPattern.exec(channelContent)) !== null) {
      const itemContent = itemMatch[1];

      const title = extractText(itemContent, 'title');
      const enclosureUrl = extractAttr(itemContent, 'enclosure', 'url');
      const pubDate = extractText(itemContent, 'pubDate');
      const duration = extractText(itemContent, 'itunes:duration');
      const description = extractText(itemContent, 'description') || extractText(itemContent, 'itunes:summary') || extractText(itemContent, 'content:encoded');
      const guid = extractText(itemContent, 'guid');
      const coverUrl = extractAttr(itemContent, 'itunes:image', 'href');

      if (!title) continue;

      const episodeId = 'ep-' + simpleHash(guid || enclosureUrl || title + pubDate);

      episodes.push({
        id: episodeId,
        title,
        audioUrl: enclosureUrl,
        duration: parseDuration(duration),
        pubDate,
        description,
        guid,
        coverUrl,
      });
    }
  } catch (e) {
    console.error('[rss-parser] Parse error:', e);
  }

  episodes.sort((a, b) => {
    const dateA = new Date(a.pubDate || 0).getTime();
    const dateB = new Date(b.pubDate || 0).getTime();
    return dateB - dateA;
  });

  return { podcast, episodes };
}
