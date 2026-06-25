// Centralized date parsing. Every call site that did new Date(x.pubDate || 0).getTime()
// now goes through here so the NaN-guard and empty-fallback live in one place.

export function parsePubDateMs(s: string | undefined | null): number {
  if (!s) return 0;
  const ms = new Date(s).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export function toMonthKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// NOTE: db.ts's updateListenStats uses local getMonth()/getDate() (0-indexed, no pad)
// as a dedup key for active-day tracking. Keep that exact behavior to avoid changing
// the dedup semantics — do not "fix" this to zero-pad without updating the consumer.
export function toDayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
