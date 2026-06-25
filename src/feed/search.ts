import { decodeHtmlEntities, simpleHash } from '../lib/utils';
import { getSearchCache, setSearchCache } from '../data/storage-local';
import { SEARCH } from '../lib/constants';

// iTunes podcast search with 24h cache + fuzzy title matching. Consolidates
// the api-search logic; background/api-search.ts is now a thin re-export shim
// over this (kept until handlers import directly from here in Task 4.6).

const cacheKey = (q: string) => `search:${q.trim().toLowerCase()}`;

function normalize(s: string): string {
  return (s || '').toLowerCase().replace(/[\s\-–_|·:：]/g, '');
}

function titleMatches(title: string, query: string): boolean {
  const nt = normalize(title);
  const nq = normalize(query);
  if (nt.includes(nq)) return true;
  // Subsequence match as a fuzzy fallback (over-matches, but iTunes pre-ranks).
  let i = 0;
  for (const ch of nt) {
    if (ch === nq[i]) i++;
    if (i === nq.length) return true;
  }
  return false;
}

async function searchITunes(query: string): Promise<any[]> {
  const params = new URLSearchParams({
    term: query,
    media: 'podcast',
    // iTunes caps `limit` at 200. Request the full set in one call instead of
    // paging — cross-page dedup/hasMore isn't worth the complexity given the
    // popup renders whatever we return.
    limit: String(SEARCH.RESULT_LIMIT),
    country: SEARCH.COUNTRY,
  });
  const url = `https://itunes.apple.com/search?${params.toString()}`;

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`iTunes API: ${resp.status}`);
  const data = await resp.json();
  if (!data.results || !Array.isArray(data.results)) return [];

  return data.results.map((item: any) => {
    const xiaoyuzhouUrl = item.collectionViewUrl || '';
    const xyMatch = xiaoyuzhouUrl.match(/xiaoyuzhoufm\.com\/podcast\/([a-f0-9]{24})/);

    // Prefer the xiaoyuzhoufm collection id when the iTunes URL points there;
    // otherwise derive a stable ext- id from the feed URL.
    const id = xyMatch ? xyMatch[1] : `ext-${simpleHash(item.feedUrl)}`;

    // Upscale the 100x100 artwork to 600x600 (Apple's URL format allows it).
    let coverUrl = item.artworkUrl100 || '';
    if (coverUrl) {
      coverUrl = coverUrl
        .replace(/100x100bb?(\.\w+)$/, '600x600bb$1')
        .replace(/100x100(\.\w+)$/, '600x600$1');
    }

    return {
      title: decodeHtmlEntities(item.collectionName || ''),
      description: decodeHtmlEntities(item.description || ''),
      coverUrl,
      author: decodeHtmlEntities(item.artistName || ''),
      id,
      feedUrl: item.feedUrl || '',
    };
  });
}

export async function search(query: string): Promise<any[]> {
  const cached = await getSearchCache(cacheKey(query));
  if (cached) return cached;

  const allItems: any[] = [];
  try {
    allItems.push(...(await searchITunes(query)));
  } catch (e) {
    console.error('[feed/search] iTunes search error:', e);
  }

  if (!allItems.length) throw new Error('NO_RESULTS');

  const q = query.trim().toLowerCase();
  const seen = new Set<string>();
  const results = allItems
    .filter((it) => !seen.has(it.id) && seen.add(it.id))
    .filter((it) => titleMatches(it.title, q));

  if (!results.length) throw new Error('NO_RESULTS');

  setSearchCache(cacheKey(query), results).catch(() => {});
  return results;
}

export function cleanTitle(s: string): string {
  return (s || '').replace(/\s+/g, ' ').trim();
}

export { normalize, titleMatches };
export { simpleHash } from '../lib/utils';
