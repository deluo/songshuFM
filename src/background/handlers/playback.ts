import { MSG } from '../../lib/messaging';
import { onPlaybackStop } from '../sync-observer';
import { updatePlayHistoryDuration, updateListenStats } from '../storage';

type HandlerFn = (msg: any, sender: chrome.runtime.MessageSender, ctx: any) => Promise<any>;

const forward: HandlerFn = (msg, sender, ctx) => ctx.forwardToOffscreen(msg);

export const handlers: Record<string, HandlerFn> = {
  [MSG.EXTRACT_RESULT]: forward,
  [MSG.PLAY]: forward,
  [MSG.PAUSE]: (msg, sender, ctx) => {
    onPlaybackStop();
    return forward(msg, sender, ctx);
  },
  [MSG.TOGGLE]: forward,
  [MSG.SEEK]: forward,
  [MSG.VOLUME]: forward,
  [MSG.SPEED]: forward,
  [MSG.NEXT]: forward,
  [MSG.PREV]: forward,
  [MSG.GET_PLAYLIST]: forward,
  [MSG.SET_PLAYLIST]: forward,

  [MSG.GET_STATE]: async (msg, sender, ctx) => {
    try {
      const result = await ctx.forwardToOffscreen({ type: MSG.GET_STATE });
      if (result && result.playing !== undefined && result.episode) return result;
    } catch (_) {}
    return await ctx.getPlayingState();
  },

  [MSG.ENSURE_OFFSCREEN]: async (msg, sender, ctx) => { await ctx.ensureOffscreen(); return { success: true }; },
  [MSG.STATE_UPDATE]: async () => ({ success: true }),
  [MSG.LISTEN_DURATION_REPORT]: async (msg) => {
    if (msg.episode?.id && msg.duration > 0) {
      updatePlayHistoryDuration(msg.episode.id, msg.duration);
      const now = new Date();
      const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      await updateListenStats(monthKey, {
        duration: msg.duration,
        episodeId: msg.episode.id,
        podcastId: msg.episode.podcastId || '',
        podcastName: msg.episode.podcastName || msg.episode.podcastTitle || '',
        coverUrl: msg.episode.coverUrl || '',
      });
    }
    return { success: true };
  },
  // NOTE: AUDIO_DOWNLOAD_PROGRESS / AUDIO_DOWNLOAD_COMPLETE / AUDIO_OPEN_FOLDER
  // are handled in handlers/audio-cache.ts (the real implementations). They are
  // broadcast/received here only via chrome.runtime.onMessage in the popup.
};
