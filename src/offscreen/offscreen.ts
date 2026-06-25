import { MSG, broadcast } from '../lib/messaging';

let audio: HTMLAudioElement | null = null;
let currentEpisode: any = null;
let playlist: any[] = [];
let playlistIndex: number = 0;
let stateUpdateInterval: ReturnType<typeof setInterval> | null = null;
let pendingSpeed: number | null = null;
let boundListeners: any = null;
let lastState: any = null;
let cachedSettings: any = {};
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let isLoadingAudio: boolean = false;
let isIntentionalPause: boolean = false;
let audioSessionId: number = 0;
let keepAliveAudio: HTMLAudioElement | null = null;
let lastReportedPosition: number = 0;

function log(...args: any[]) {
  console.log('[offscreen]', ...args);
}

log('Offscreen audio player initialized');

// Register the message listener and announce readiness IMMEDIATELY, before any
// state-restore round-trips. The service worker's ensureOffscreen() has a 2s
// timeout waiting for OFFSCREEN_READY; if we gate it on the GET_SETTINGS /
// GET_PLAYING_STATE round-trips below, a cold/slow service worker makes the
// first playback action time out. Handlers are safe to call before restore
// completes — they guard on `audio`/`currentEpisode` (null initially) and
// return sensible defaults (e.g. GET_STATE -> { playing: false }).
chrome.runtime.onMessage.addListener((message: any, _sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
  if (!message._forOffscreen) return false;
  const handler = (messageHandlers as any)[message.type];
  if (handler) {
    const result = handler(message);
    if (result instanceof Promise) {
      result.then(sendResponse).catch((e: any) => sendResponse({ error: e.message }));
    } else {
      sendResponse(result);
    }
    return true;
  }
  return false;
});

// Announce readiness now that the listener is wired. Runs in parallel with the
// non-blocking state restore below; neither gates the ready signal.
broadcast(MSG.OFFSCREEN_READY);

// Restore settings + playing state in the background. Non-blocking: a message
// arriving mid-restore sees safe defaults until these resolve.
chrome.runtime.sendMessage({ type: MSG.GET_SETTINGS }).then((result: any) => {
  cachedSettings = result || {};
}).catch(() => {
  cachedSettings = {};
});

chrome.runtime.sendMessage({ type: MSG.GET_PLAYING_STATE }).then((result: any) => {
  if (result) {
    if (result.playlist && result.playlist.length > 0) {
      playlist = result.playlist;
      playlistIndex = result.playlistIndex || 0;
    }
    if (result.episode) {
      currentEpisode = result.episode;
      lastState = {
        playing: false,
        currentTime: result.currentTime || 0,
        duration: result.duration || 0,
        speed: 1,
        volume: 1,
        episode: result.episode,
      };
      const audioUrl = result.episode.audioUrl;
      if (audioUrl) {
        setupAudio(audioUrl, result.episode, { resumeTime: result.currentTime || 0, autoPlay: false });
      }
    }
  }
}).catch(() => {});

const messageHandlers: Record<string, (msg: any) => any> = {
  [MSG.EXTRACT_RESULT]: (msg: any) => {
    const data = msg.data;
    log('EXTRACT_RESULT:', data?.type, 'audioUrl:', data?.episode?.audioUrl);
    if (data && data.type === 'episode' && data.episode && data.episode.audioUrl) {
      if (msg.playlist && msg.playlist.length > 0) {
        setPlaylist(msg.playlist, msg.playlistIndex || 0);
      }
      pendingSpeed = msg.speed != null ? msg.speed : null;
      setupAudio(data.episode.audioUrl, data.episode, { resumeTime: msg.resumeTime, autoPlay: msg.autoPlay !== false });
      return { success: true };
    }
    return { success: false, error: 'No episode data or audioUrl' };
  },
  [MSG.PLAY]: () => ({ success: requestPlay() }),
  [MSG.PAUSE]: () => ({ success: requestPause() }),
  [MSG.TOGGLE]: () => {
    log('TOGGLE, audio:', !!audio, 'paused:', audio?.paused, 'loading:', isLoadingAudio);
    if (!audio && !currentEpisode) return { success: false };
    if (isLoadingAudio) {
      log('Audio still loading, ignoring toggle');
      return { success: false };
    }
    if (isPlaybackActive()) {
      requestPause();
    } else {
      requestPlay();
    }
    return { success: true };
  },
  [MSG.SEEK]: (msg: any) => {
    if (!audio && currentEpisode) {
      const audioUrl = currentEpisode.audioUrl;
      if (audioUrl) {
        setupAudio(audioUrl, currentEpisode, { resumeTime: msg.time || lastState?.currentTime || 0, autoPlay: true });
        return { success: true };
      }
    }
    if (audio && msg.time != null) { audio.currentTime = msg.time; }
    return { success: true };
  },
  [MSG.VOLUME]: (msg: any) => {
    if (audio && msg.volume != null) { audio.volume = Math.max(0, Math.min(1, msg.volume)); }
    return { success: true };
  },
  [MSG.SPEED]: (msg: any) => {
    if (!audio && currentEpisode) {
      const audioUrl = currentEpisode.audioUrl;
      if (audioUrl) {
        pendingSpeed = msg.speed;
        setupAudio(audioUrl, currentEpisode, { resumeTime: lastState?.currentTime || 0, autoPlay: true });
        return { success: true };
      }
    }
    if (audio && msg.speed != null) { audio.playbackRate = msg.speed; }
    return { success: true };
  },
  [MSG.NEXT]: async () => {
    await ensurePlaylist();
    playNext();
    return { success: true };
  },
  [MSG.PREV]: async () => {
    await ensurePlaylist();
    playPrev();
    return { success: true };
  },
  [MSG.GET_STATE]: () => lastState || { playing: false },
  [MSG.GET_PLAYLIST]: () => ({ playlist, playlistIndex, currentEpisode }),
  [MSG.SET_PLAYLIST]: (msg: any) => {
    if (msg.playlist && msg.playlist.length > 0) {
      setPlaylist(msg.playlist, msg.playlistIndex || 0);
    }
    return { success: true };
  },
  [MSG.SETTINGS_UPDATE]: (msg: any) => {
    if (msg.settings) cachedSettings = msg.settings;
    return { success: true };
  },
};

function isPlaybackActive(): boolean {
  return !!audio && !audio.paused;
}

function startKeepAlive() {
  if (keepAliveAudio) return;
  try {
    keepAliveAudio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==');
    keepAliveAudio.loop = true;
    keepAliveAudio.volume = 0.001;
    keepAliveAudio.play().catch(() => {});
  } catch (e) {}
}

function stopKeepAlive() {
  if (!keepAliveAudio) return;
  keepAliveAudio.pause();
  keepAliveAudio.src = '';
  keepAliveAudio = null;
}

async function setupAudio(audioUrl: string, episode: any, options: { resumeTime?: number; autoPlay?: boolean } = {}) {
  const { resumeTime = 0, autoPlay = false } = options;
  log('setupAudio:', episode?.title, 'resumeTime:', resumeTime, 'autoPlay:', autoPlay);

  cleanupAudio();
  lastReportedPosition = resumeTime || 0;
  stopKeepAlive();
  isLoadingAudio = true;
  isIntentionalPause = !autoPlay;
  currentEpisode = episode;
  const currentSessionId = ++audioSessionId;

  if (!audioUrl) {
    log('No audio URL provided');
    isLoadingAudio = false;
    broadcastState();
    return;
  }

  audio = new Audio(audioUrl);
  const currentAudio = audio;
  audio.preload = 'metadata';

  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: episode.title,
      artist: episode.podcastName || episode.podcastTitle || '',
      album: episode.podcastName || episode.podcastTitle || '',
      artwork: episode.coverUrl ? [{ src: episode.coverUrl, sizes: '256x256', type: 'image/jpeg' }] : [],
    });
    navigator.mediaSession.setActionHandler('play', () => requestPlay());
    navigator.mediaSession.setActionHandler('pause', () => requestPause());
    navigator.mediaSession.setActionHandler('seekto', (details: any) => { if (audio) { audio.currentTime = details.seekTime; updatePositionState(); } });
    navigator.mediaSession.setActionHandler('nexttrack', () => playNext());
    navigator.mediaSession.setActionHandler('previoustrack', () => playPrev());
  }

  const onLoadedMetadata = () => {
    if (audio !== currentAudio || currentSessionId !== audioSessionId) return;
    if (resumeTime > 0 && audio!.duration && resumeTime < audio!.duration) {
      audio!.currentTime = resumeTime;
    }
    broadcastState();
    updatePositionState();
  };

  const onTimeUpdate = () => {
    if (audio !== currentAudio || currentSessionId !== audioSessionId) return;
    broadcastState();
    if ('mediaSession' in navigator) updatePositionState();
  };

  const onPlay = () => {
    if (audio !== currentAudio || currentSessionId !== audioSessionId) return;
    isLoadingAudio = false;
    stopKeepAlive();
    broadcastState();
  };

  const onPause = () => {
    if (audio !== currentAudio || currentSessionId !== audioSessionId) return;
    broadcastState();
    if (isIntentionalPause) startKeepAlive();
  };

  const onEnded = () => {
    if (audio !== currentAudio || currentSessionId !== audioSessionId) return;
    broadcastState();
    broadcast(MSG.ENDED);
    if (cachedSettings.autoPlayNext !== false) {
      playNext();
    } else {
      startKeepAlive();
    }
  };

  const onError = () => {
    if (audio !== currentAudio || currentSessionId !== audioSessionId) return;
    log('Audio error:', audio?.error);
    isLoadingAudio = false;
    broadcastState();
  };

  audio.addEventListener('loadedmetadata', onLoadedMetadata);
  audio.addEventListener('timeupdate', onTimeUpdate);
  audio.addEventListener('play', onPlay);
  audio.addEventListener('pause', onPause);
  audio.addEventListener('ended', onEnded);
  audio.addEventListener('error', onError);

  boundListeners = { onLoadedMetadata, onTimeUpdate, onPlay, onPause, onEnded, onError };

  if (pendingSpeed != null) {
    audio.playbackRate = pendingSpeed;
    pendingSpeed = null;
  }

  const onCanplay = () => {
    if (audio !== currentAudio || currentSessionId !== audioSessionId) return;
    isLoadingAudio = false;
    if (autoPlay) {
      audio!.play().catch((e: any) => {
        if (e.name !== 'AbortError') log('play() failed:', e.message);
        broadcastState();
      });
    }
  };

  if (audio.readyState >= 3) {
    onCanplay();
  } else {
    audio.addEventListener('canplay', onCanplay, { once: true });
  }

  if (stateUpdateInterval) clearInterval(stateUpdateInterval);
  stateUpdateInterval = setInterval(broadcastState, 1000);
  broadcastState();
  persistPlayingState();
}

function requestPlay(): boolean {
  if (!audio) {
    if (currentEpisode) {
      const audioUrl = currentEpisode.audioUrl;
      if (audioUrl) {
        setupAudio(audioUrl, currentEpisode, { resumeTime: lastState?.currentTime || 0, autoPlay: true });
        return true;
      }
      return false;
    }
    return false;
  }
  if (isLoadingAudio) {
    log('Audio still loading, ignoring play request');
    return false;
  }
  isIntentionalPause = false;
  stopKeepAlive();
  const result = audio.play();
  if (result !== undefined) {
    result.catch((e: any) => log('play() failed:', e.message));
  }
  return true;
}

function requestPause(): boolean {
  if (!audio) return false;
  isIntentionalPause = true;
  audio.pause();
  // Always persist immediately on pause. Previously this only ran when the
  // audio was already paused or still loading, so a normal play->pause relied
  // on broadcastState()'s 3s schedulePersist debounce. If the offscreen
  // document was torn down and rebuilt within that window, the new document
  // restored an empty/stale playlist from storage — making the expanded
  // player's playlist panel come up empty the next time it was opened.
  broadcastState();
  persistPlayingState();
  startKeepAlive();
  return true;
}

function cleanupAudio() {
  if (!audio) return;
  if (boundListeners) {
    audio.removeEventListener('loadedmetadata', boundListeners.onLoadedMetadata);
    audio.removeEventListener('timeupdate', boundListeners.onTimeUpdate);
    audio.removeEventListener('play', boundListeners.onPlay);
    audio.removeEventListener('pause', boundListeners.onPause);
    audio.removeEventListener('ended', boundListeners.onEnded);
    audio.removeEventListener('error', boundListeners.onError);
  }
  audio.pause();
  audio.src = '';
  audio.load();
  audio = null;
  boundListeners = null;
}

function updatePositionState() {
  if (!audio || !audio.duration) return;
  try {
    navigator.mediaSession.setPositionState({ duration: audio.duration, playbackRate: audio.playbackRate, position: Math.min(audio.currentTime, audio.duration) });
  } catch (e) {}
}

function broadcastState() {
  if (!audio && !currentEpisode) return;
  const state = {
    playing: audio ? !audio.paused : false,
    loading: !!audio && isLoadingAudio && !isIntentionalPause,
    currentTime: audio ? (audio.currentTime || 0) : 0,
    duration: audio ? (audio.duration || 0) : 0,
    speed: audio ? (audio.playbackRate || 1) : 1,
    volume: audio ? (audio.volume || 1) : 1,
    episode: currentEpisode,
  };
  lastState = state;

  if (audio && !isLoadingAudio && lastReportedPosition > 0) {
    const increment = Math.abs(audio.currentTime - lastReportedPosition);
    if (increment > 0.5 && increment < 300) {
      chrome.runtime.sendMessage({
        type: MSG.LISTEN_DURATION_REPORT,
        episode: currentEpisode,
        duration: Math.round(increment),
      }).catch(() => {});
    }
  }
  if (audio && !audio.paused) {
    lastReportedPosition = audio.currentTime;
  }

  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    broadcast(MSG.STATE_UPDATE, { state: lastState });
    debounceTimer = null;
  }, 16);

  schedulePersist();
}

function schedulePersist() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistPlayingState();
    persistTimer = null;
  }, 3000);
}

function persistPlayingState() {
  // Cancel any pending debounced persist: this call already captured the
  // latest state, so a later 3s timer firing would only write stale data
  // (e.g. before the rebuild has a chance to overwrite with old values).
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  // When the offscreen document is freshly rebuilt, the background state
  // restore (GET_PLAYING_STATE round-trip at the top of this module) may not
  // have resolved yet, so `playlist` is still the initial empty array. A
  // concurrent EXTRACT_RESULT (e.g. popup reopening a paused episode with
  // playlist: []) triggers setupAudio() -> persistPlayingState() here, which
  // would otherwise overwrite the persisted playlist with [] and lose it for
  // the next popup open. Skip the write when we have an episode but no
  // in-memory playlist yet — the restore will populate `playlist` and the
  // next persist (from setupAudio/timeupdate) writes the correct value.
  if (playlist.length === 0 && currentEpisode) {
    return;
  }
  const state = {
    episode: currentEpisode,
    playlist,
    playlistIndex,
    currentTime: audio ? audio.currentTime : 0,
    duration: audio ? (audio.duration || 0) : (lastState?.duration || 0),
    playing: audio ? !audio.paused : false,
    timestamp: Date.now(),
  };
  broadcast(MSG.SET_PLAYING_STATE, { state });
  if (currentEpisode?.id && state.currentTime > 0) {
    broadcast(MSG.PLAY_POSITION_UPDATE, { episodeId: currentEpisode.id, position: state.currentTime });
  }
}

function setPlaylist(episodes: any[], index: number = 0) { playlist = episodes; playlistIndex = index; }

async function ensurePlaylist(retries = 2) {
  if (playlist.length > 0) return true;
  for (let i = 0; i < retries; i++) {
    try {
      const result: any = await chrome.runtime.sendMessage({ type: MSG.GET_PLAYING_STATE });
      if (result?.playlist && result.playlist.length > 0) {
        playlist = result.playlist;
        playlistIndex = result.playlistIndex || 0;
        return true;
      }
      // Add small delay before retry to allow offscreen rebuild to complete
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (e) {
      // If it's the last retry, give up; otherwise wait and try again
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }
  return false;
}

function playNext() {
  if (playlist.length === 0) { log('playNext: playlist empty'); return; }
  playlistIndex = (playlistIndex + 1) % playlist.length;
  const ep = playlist[playlistIndex];
  if (ep && ep.audioUrl) {
    setupAudio(ep.audioUrl, ep, { autoPlay: true });
    reportHistory(ep);
    // Persist immediately after track change to prevent race condition if offscreen
    // document is torn down and rebuilt during auto-advance (similar to pause case).
    persistPlayingState();
  } else {
    log('playNext: no audioUrl for episode at index', playlistIndex);
  }
}

function playPrev() {
  if (playlist.length === 0) { log('playPrev: playlist empty'); return; }
  playlistIndex = (playlistIndex - 1 + playlist.length) % playlist.length;
  const ep = playlist[playlistIndex];
  if (ep && ep.audioUrl) {
    setupAudio(ep.audioUrl, ep, { autoPlay: true });
    reportHistory(ep);
    // Persist immediately after track change to prevent race condition if offscreen
    // document is torn down and rebuilt during auto-advance (similar to pause case).
    persistPlayingState();
  } else {
    log('playPrev: no audioUrl for episode at index', playlistIndex);
  }
}

function reportHistory(episode: any) {
  broadcast(MSG.PLAY_HISTORY_ADD, { episode });
}
