import { describe, it, expect, vi } from 'vitest';
import { externalPodcastUrl, isSubscribed, toggleSubscribe } from './subscribe';
import { XYZ_BASE_URL } from '../../lib/constants';

// Stub sendMessage so toggleSubscribe doesn't hit chrome.runtime.
vi.mock('../../lib/messaging', () => ({
  MSG: { SUBSCRIBE: 'subscribe', UNSUBSCRIBE: 'unsubscribe' },
  sendMessage: vi.fn(() => Promise.resolve({ success: true })),
}));

describe('isSubscribed', () => {
  it('returns false for undefined id', () => {
    expect(isSubscribed(undefined, [{ id: 'p1' }])).toBe(false);
  });
  it('matches by id', () => {
    expect(isSubscribed('p1', [{ id: 'p1' }])).toBe(true);
  });
  it('matches by pid when id absent', () => {
    expect(isSubscribed('p2', [{ pid: 'p2' }])).toBe(true);
  });
  it('returns false when not present', () => {
    expect(isSubscribed('p3', [{ id: 'p1' }])).toBe(false);
  });
});

describe('externalPodcastUrl', () => {
  it('returns null for normal id', () => {
    expect(externalPodcastUrl({ id: 'p1' })).toBeNull();
  });
  it('returns null for undefined id', () => {
    expect(externalPodcastUrl({})).toBeNull();
  });
  it('builds URL for ext- prefix', () => {
    expect(externalPodcastUrl({ id: 'ext-abc' })).toBe(`${XYZ_BASE_URL}/podcast/ext-abc`);
  });
  it('builds URL for opml- prefix', () => {
    expect(externalPodcastUrl({ id: 'opml-xyz' })).toBe(`${XYZ_BASE_URL}/podcast/opml-xyz`);
  });
});

describe('toggleSubscribe', () => {
  it('returns false (unsubscribed) when currently subscribed', async () => {
    const r = await toggleSubscribe({ id: 'p1' }, true);
    expect(r).toBe(false);
  });
  it('returns true (subscribed) when not currently subscribed', async () => {
    const r = await toggleSubscribe({ id: 'p1' }, false);
    expect(r).toBe(true);
  });
});
