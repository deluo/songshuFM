import { describe, it, expect, vi } from 'vitest';
import { batch, fetchWithRetry } from './fetcher';

describe('batch', () => {
  it('returns results in input order regardless of completion order', async () => {
    // Worker for index 1 resolves slower than index 0 and 2; results must still
    // come back ordered [a, b, c].
    const items = ['a', 'b', 'c'];
    const worker = (item: string, i: number) =>
      new Promise<string>((resolve) =>
        setTimeout(() => resolve(`${item}-${i}`), i === 1 ? 30 : 5),
      );
    const out = await batch(items, 3, worker);
    expect(out).toEqual(['a-0', 'b-1', 'c-2']);
  });

  it('respects the concurrency limit', async () => {
    let active = 0;
    let maxActive = 0;
    const items = Array.from({ length: 10 }, (_, i) => i);
    const worker = () =>
      new Promise<number>((resolve) => {
        active++;
        maxActive = Math.max(maxActive, active);
        setTimeout(() => { active--; resolve(1); }, 10);
      });
    await batch(items, 3, worker);
    expect(maxActive).toBeLessThanOrEqual(3);
  });

  it('reports progress as items complete', async () => {
    const progress: Array<[number, number]> = [];
    const items = [1, 2, 3];
    await batch(items, 2, async () => 1, (done, total) => progress.push([done, total]));
    expect(progress.length).toBe(3);
    expect(progress[progress.length - 1]).toEqual([3, 3]);
  });

  it('propagates worker errors', async () => {
    await expect(
      batch([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error('boom');
        return n;
      }),
    ).rejects.toThrow();
  });
});

describe('fetchWithRetry', () => {
  it('returns on first success without retrying', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const r = await fetchWithRetry(fn, 3);
    expect(r).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure then succeeds', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail-1'))
      .mockRejectedValueOnce(new Error('fail-2'))
      .mockResolvedValue('ok');
    const r = await fetchWithRetry(fn, 3);
    expect(r).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws last error after exhausting retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always-fail'));
    await expect(fetchWithRetry(fn, 2)).rejects.toThrow('always-fail');
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });
});
