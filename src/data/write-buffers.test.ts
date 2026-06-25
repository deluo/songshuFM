import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createWriteBuffer } from './write-buffers';

describe('createWriteBuffer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('flushes after the interval', async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const buf = createWriteBuffer(flush, 5000);
    buf.queue('a', 1);
    buf.queue('b', 2);
    expect(flush).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5000);
    await vi.waitFor(() => expect(flush).toHaveBeenCalledWith({ a: 1, b: 2 }));
  });

  it('coalesces duplicate keys (last wins)', async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const buf = createWriteBuffer(flush, 5000);
    buf.queue('a', 1);
    buf.queue('a', 99);
    vi.advanceTimersByTime(5000);
    await vi.waitFor(() => expect(flush).toHaveBeenCalledWith({ a: 99 }));
  });

  it('flushNow flushes immediately and clears pending', async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const buf = createWriteBuffer(flush, 5000);
    buf.queue('a', 1);
    await buf.flushNow();
    expect(flush).toHaveBeenCalledWith({ a: 1 });
    // next tick does not re-flush
    vi.advanceTimersByTime(5000);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('does not flush when empty', async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const buf = createWriteBuffer(flush, 5000);
    vi.advanceTimersByTime(5000);
    expect(flush).not.toHaveBeenCalled();
  });
});
