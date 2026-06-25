export function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

export function formatTime(seconds: number | undefined | null): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export function formatDuration(seconds: number | undefined | null): string {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h} 小时 ${m % 60} 分钟`;
  }
  return `${m} 分钟`;
}

export function formatHoursMinutes(seconds: number | undefined | null): string {
  if (!seconds) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h${m > 0 ? m + 'm' : ''}`;
  return `${m}m`;
}

export function formatRelativeDate(
  dateStr: string | undefined | null,
  tFn: (key: string) => string,
): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return tFn('history.today');
  if (days === 1) return tFn('history.yesterday');
  if (days < 7) return `${days} 天前`;
  if (days < 30) return `${Math.floor(days / 7)} 周前`;
  return `${Math.floor(days / 30)} 月前`;
}

export function escHtml(str: string | undefined | null): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Named HTML/XML entities we actually see in podcast RSS feeds. Single-pass
// regex below also covers numeric entities (&#NN; / &#xHH;), so this only needs
// the common named ones — anything unknown is left untouched.
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  hellip: '\u2026',
  mdash: '\u2014',
  ndash: '\u2013',
  lsquo: '\u2018',
  rsquo: '\u2019',
  ldquo: '\u201c',
  rdquo: '\u201d',
  copy: '\u00a9',
  reg: '\u00ae',
  trade: '\u2122',
};

// Decode HTML/XML entities (&quot; &amp; &#39; &#x27; ...) back to real
// characters. RSS parsers and JSON APIs occasionally hand us pre-encoded text;
// Preact renders JS strings verbatim, so without this the UI shows the literal
// entity. Unknown entities are passed through unchanged. Single regex pass means
// ordering doesn't matter (no double-decode of &amp;quot; → ").
export function decodeHtmlEntities(str: string | undefined | null): string {
  if (!str) return '';
  return str.replace(
    /&(?:([a-zA-Z][a-zA-Z0-9]{1,30})|#(?:(\d+)|x([0-9a-fA-F]+)));/g,
    (match, name: string | undefined, dec: string | undefined, hex: string | undefined) => {
      if (name) {
        return NAMED_ENTITIES[name] ?? match;
      }
      const cp = dec ? parseInt(dec, 10) : parseInt(hex as string, 16);
      if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return match;
      try {
        return String.fromCodePoint(cp);
      } catch {
        return match;
      }
    },
  );
}

export function isDirectAudioUrl(url: string | undefined | null): boolean {
  return !!url && !url.includes('/podcast/') && !url.includes('/episode/');
}
