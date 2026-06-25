import { FEED_FETCH_TIMEOUT_MS } from '../lib/constants';
import { parseFeed, type ParsedFeed } from './parser';

// HTTP layer for feed fetching: timeout + retry + concurrency-limited batch.
// Used by services/feed-sync.ts (Task 4.4). The old background/feed-fetcher.ts
// remains until handlers are slimmed (Task 4.6), then it is deleted.

export function fetchWithTimeout(url: string, timeoutMs: number = FEED_FETCH_TIMEOUT_MS): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

export async function fetchFeedXml(url: string): Promise<string> {
  const resp = await fetchWithTimeout(url);
  if (!resp.ok) throw new Error(`Feed fetch failed: ${resp.status} for ${url}`);
  return resp.text();
}

export async function fetchAndParseFeed(url: string): Promise<ParsedFeed> {
  const xml = await fetchFeedXml(url);
  return parseFeed(xml, url);
}

// Retry with exponential backoff. Returns the first successful result, or throws
// the last error after `retries` attempts.
export async function fetchWithRetry<T>(fn: () => Promise<T>, retries: number = 2): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 300 * Math.pow(2, attempt)));
      }
    }
  }
  throw lastErr;
}

// Concurrency-limited batch runner. Replaces the serial for-loop in OPML import:
// feeds fetch in parallel up to `limit`, with a progress callback. Results are
// returned in input order regardless of completion order.
export async function batch<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  onProgress?: (done: number, total: number) => void,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  let done = 0;
  let hasError = false;
  let rejectFn: (e: unknown) => void;
  const earlyExit = new Promise<never>((_, reject) => { rejectFn = reject; });

  async function run(): Promise<void> {
    while (cursor < items.length) {
      if (hasError) return;
      const i = cursor++;
      try {
        results[i] = await worker(items[i], i);
      } catch (e) {
        hasError = true;
        rejectFn(e);
        return;
      }
      done++;
      onProgress?.(done, items.length);
    }
  }

  const runners = Array.from({ length: Math.min(limit, items.length) }, () => run());
  await Promise.race([Promise.all(runners), earlyExit]);
  if (hasError) {
    throw new Error('batch stopped early due to worker error');
  }
  return results;
}
