import { MSG } from '../lib/messaging';
import { getSettings, getPlayingState } from './storage';
import { markDirty, onPlaybackStop, onPeriodicSync, startPeriodicSync } from './sync-observer';
import { checkForUpdates } from './updates';
import { runMigrations } from './migrations';

import { handlers as playbackHandlers } from './handlers/playback';
import { handlers as dataHandlers } from './handlers/data';
import { handlers as subscriptionHandlers } from './handlers/subscription';
import { handlers as searchHandlers } from './handlers/search';
import { handlers as syncHandlers } from './handlers/sync';
import { handlers as audioCacheHandlers } from './handlers/audio-cache';
import { handlers as settingsHandlers } from './handlers/settings';
import { applyPanelMode } from './panel-mode';

type MessageHandler = (msg: any, sender: chrome.runtime.MessageSender, ctx: any) => Promise<any>;

const messageHandlers: Record<string, MessageHandler> = {
  ...playbackHandlers,
  ...dataHandlers,
  ...subscriptionHandlers,
  ...searchHandlers,
  ...syncHandlers,
  ...audioCacheHandlers,
  ...settingsHandlers,
};

const handlerContext = {
  forwardToOffscreen,
  getPlayingState: async () => getPlayingState(),
  ensureOffscreen,
};

// Data migrations (episode-sync fields, subscription meta, stale-key cleanup).
// Idempotent via syncMeta._migrations.applied; a recycled SW re-calling this
// skips already-applied migrations. Replaces the former boolean-sentinel IIFEs.
runMigrations().catch((e) => console.error('[service-worker] migration failed:', e));

let offscreenReady = false;
let offscreenCreatePromise: Promise<void> | null = null;
let offscreenReadyWaiters: Array<{ resolve: () => void; timer: ReturnType<typeof setTimeout> }> = [];

async function ensureOffscreen(): Promise<void> {
  const existingContexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (existingContexts.length > 0) {
    if (offscreenCreatePromise) {
      await waitForOffscreenReady();
      return;
    }
    offscreenReady = true;
    return;
  }
  if (!offscreenCreatePromise) {
    offscreenReady = false;
    offscreenCreatePromise = (async () => {
      await chrome.offscreen.createDocument({
        url: 'src/offscreen/offscreen.html',
        reasons: ['AUDIO_PLAYBACK'],
        justification: 'Audio playback for podcast episodes',
      });
      await waitForOffscreenReady();
    })().finally(() => {
      offscreenCreatePromise = null;
    });
  }
  await offscreenCreatePromise;
}

function markOffscreenReady(): void {
  offscreenReady = true;
  const waiters = offscreenReadyWaiters;
  offscreenReadyWaiters = [];
  waiters.forEach(({ resolve, timer }) => {
    clearTimeout(timer);
    resolve();
  });
}

function waitForOffscreenReady(timeoutMs: number = 2000): Promise<void> {
  if (offscreenReady) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(async () => {
      offscreenReadyWaiters = offscreenReadyWaiters.filter(item => item.resolve !== resolve);
      // The OFFSCREEN_READY push may have been lost (e.g. service worker
      // restarted just as it was sent). Re-probe the authoritative source:
      // if the document now exists, treat it as ready rather than failing.
      try {
        const ctx = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
        if (ctx.length > 0) {
          offscreenReady = true;
          resolve();
          return;
        }
      } catch (_) {}
      reject(new Error('Offscreen document 初始化超时'));
    }, timeoutMs);
    offscreenReadyWaiters.push({ resolve, timer });
  });
}

async function forwardToOffscreen(message: any): Promise<any> {
  await ensureOffscreen();
  const offscreenCtx = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (offscreenCtx.length === 0) {
    console.warn('[forwardToOffscreen] no offscreen context');
    return { error: 'Offscreen document not available' };
  }
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ ...message, _forOffscreen: true }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('[forwardToOffscreen] error:', chrome.runtime.lastError.message);
          resolve({ error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response || { success: false });
      });
    } catch (e: any) {
      console.warn('[forwardToOffscreen] exception:', e.message);
      resolve({ error: e.message });
    }
  });
}

chrome.runtime.onMessage.addListener((message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
  if (message.type === MSG.OFFSCREEN_READY) {
    markOffscreenReady();
    sendResponse({ success: true });
    return true;
  }
  const handler = messageHandlers[message.type];
  if (handler) {
    handler(message, sender, handlerContext)
      .then(data => sendResponse({ success: true, data }))
      .catch((e: any) => sendResponse({ success: false, error: e.message }));
    return true;
  }
  return false;
});

chrome.alarms.onAlarm.addListener(async (alarm: chrome.alarms.Alarm) => {
  if (alarm.name === 'check-updates') {
    const settings = await getSettings();
    if (settings.updateFrequency > 0) await checkForUpdates();
  }
  if (alarm.name === 'periodic-sync') {
    await onPeriodicSync();
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await getSettings();
  chrome.alarms.create('check-updates', { periodInMinutes: settings.updateFrequency });
  startPeriodicSync();
  applyPanelMode();
});

chrome.runtime.onStartup.addListener(async () => {
  const settings = await getSettings();
  chrome.alarms.create('check-updates', { periodInMinutes: settings.updateFrequency });
  startPeriodicSync();
  applyPanelMode();
});
