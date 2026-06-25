import { WRITE_BUFFER_INTERVAL_MS } from '../lib/constants';

// Generic debounced write buffer. Replaces the two near-identical
// pendingDurationUpdates/durationFlushTimer and pendingPositionUpdates/positionFlushTimer
// pairs that were in storage.ts. Coalesces updates to the same key (last write wins)
// and flushes on an interval or on demand.
export function createWriteBuffer<T>(
  flush: (pending: Record<string, T>) => Promise<void>,
  intervalMs: number = WRITE_BUFFER_INTERVAL_MS,
) {
  let pending: Record<string, T> = {};
  let timer: ReturnType<typeof setTimeout> | null = null;

  function doFlush(batch: Record<string, T>) {
    return flush(batch).catch((e) => console.error('[write-buffer] flush failed', e));
  }

  return {
    queue(key: string, value: T) {
      pending[key] = value;
      if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          const batch = pending;
          pending = {};
          void doFlush(batch);
        }, intervalMs);
      }
    },
    async flushNow() {
      if (timer) { clearTimeout(timer); timer = null; }
      const batch = pending;
      pending = {};
      if (Object.keys(batch).length) await doFlush(batch);
    },
  };
}
