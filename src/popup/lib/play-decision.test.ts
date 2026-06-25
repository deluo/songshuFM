// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isSameEpisode, decideEpisodeAction, handleEpisodeRowClick } from './play-decision';
import { playbackState } from '../state';

describe('isSameEpisode', () => {
  it('returns false when either side is null', () => {
    expect(isSameEpisode(null, { id: 'a' })).toBe(false);
    expect(isSameEpisode({ id: 'a' }, null)).toBe(false);
    expect(isSameEpisode(null, null)).toBe(false);
  });

  it('matches by id', () => {
    expect(isSameEpisode({ id: 'a' }, { id: 'a' })).toBe(true);
    expect(isSameEpisode({ id: 'a' }, { id: 'b' })).toBe(false);
  });

  it('treats eid as id when id is absent', () => {
    expect(isSameEpisode({ eid: 'a' }, { id: 'a' })).toBe(true);
    expect(isSameEpisode({ id: 'a' }, { eid: 'a' })).toBe(true);
    expect(isSameEpisode({ eid: 'a' }, { eid: 'a' })).toBe(true);
  });

  it('falls back to audioUrl when ids are absent', () => {
    expect(isSameEpisode({ audioUrl: 'u' }, { audioUrl: 'u' })).toBe(true);
    expect(isSameEpisode({ audioUrl: 'u' }, { audioUrl: 'v' })).toBe(false);
  });

  it('falls back to url when id and audioUrl are absent', () => {
    expect(isSameEpisode({ url: 'p' }, { url: 'p' })).toBe(true);
    expect(isSameEpisode({ url: 'p' }, { url: 'q' })).toBe(false);
  });

  it('returns false when no field is usable on either side', () => {
    expect(isSameEpisode({}, {})).toBe(false);
    expect(isSameEpisode({ title: 'x' }, { title: 'x' })).toBe(false);
  });
});

describe('decideEpisodeAction', () => {
  it('returns none when clicked is null', () => {
    expect(decideEpisodeAction(null, { id: 'a' })).toEqual({ kind: 'none' });
  });

  it('returns play-new when nothing is loaded', () => {
    expect(decideEpisodeAction({ id: 'a' }, null)).toEqual({ kind: 'play-new' });
  });

  it('returns toggle when clicked is the loaded episode (by id)', () => {
    expect(decideEpisodeAction({ id: 'a' }, { id: 'a' })).toEqual({ kind: 'toggle' });
  });

  it('returns toggle when clicked is the loaded episode (by audioUrl fallback)', () => {
    expect(decideEpisodeAction({ audioUrl: 'u' }, { audioUrl: 'u' })).toEqual({ kind: 'toggle' });
  });

  it('returns play-new when clicked differs from loaded', () => {
    expect(decideEpisodeAction({ id: 'a' }, { id: 'b' })).toEqual({ kind: 'play-new' });
  });
});

describe('handleEpisodeRowClick', () => {
  beforeEach(() => {
    playbackState.value = null;
    // The global chrome.runtime.sendMessage is set up by test/setup/chrome-mock.ts.
    // Clear call history between tests without restoring the stubbed impl.
    vi.mocked((globalThis as any).chrome.runtime.sendMessage).mockClear();
  });

  it('dispatches play-episode when nothing is loaded', () => {
    const dispatch = vi.spyOn(document, 'dispatchEvent');
    const ep = { id: 'a', title: 'A' };
    handleEpisodeRowClick(ep, { podcast: { id: 'p' } });
    expect(dispatch).toHaveBeenCalled();
    const event = dispatch.mock.calls[0][0] as CustomEvent;
    expect(event.type).toBe('play-episode');
    expect(event.detail.episode).toBe(ep);
    expect(event.detail.autoPlay).toBe(true);
  });

  it('sends TOGGLE when clicked is the loaded episode', () => {
    playbackState.value = { playing: true, currentTime: 5, duration: 100, speed: 1, volume: 1, episode: { id: 'a' } };
    const send = (globalThis as any).chrome.runtime.sendMessage;
    handleEpisodeRowClick({ id: 'a' }, {});
    // sendMessage(MSG.TOGGLE) spreads into chrome.runtime.sendMessage({ type, }).
    expect(send).toHaveBeenCalledWith({ type: 'player:toggle' });
  });

  it('dispatches play-episode when clicked differs from loaded', () => {
    playbackState.value = { playing: true, currentTime: 5, duration: 100, speed: 1, volume: 1, episode: { id: 'b' } };
    const dispatch = vi.spyOn(document, 'dispatchEvent');
    handleEpisodeRowClick({ id: 'a' }, {});
    const event = dispatch.mock.calls[0][0] as CustomEvent;
    expect(event.type).toBe('play-episode');
    expect(event.detail.episode).toEqual({ id: 'a' });
  });
});
