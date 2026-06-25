import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import {
  playbackState,
  isExpandedPlayerOpen,
  isPlaylistOpen,
  playlist,
  playlistIndex,
  subscriptions,
  currentPage,
  currentPodcastId,
  currentFeedUrl,
  PLAYBACK_SPEEDS,
  favoritesRefreshTick,
} from '../state';
import { formatTime, isDirectAudioUrl } from '../../lib/utils';
import { sendMessage, MSG } from '../../lib/messaging';
import { t } from '../../lib/i18n';
import type { Episode } from '../state';

const isFavorited = signal(false);
const downloadState = signal<'idle' | 'downloading' | 'cached'>('idle');
const downloadProgress = signal(0);
const isPlaylistHidden = signal(true);
const flashMessageText = signal('');
// Hover preview for the expanded-player progress bar (null = hidden).
const hoverTime = signal<string | null>(null);
const hoverRatio = signal(0);

let _downloadPollTimer: ReturnType<typeof setInterval> | null = null;
let _flashTimer: ReturnType<typeof setTimeout> | null = null;

// Briefly overlay a message (e.g. playlist-boundary feedback) on the player.
function flashMessage(msg: string) {
  if (!msg) return;
  flashMessageText.value = msg;
  if (_flashTimer) clearTimeout(_flashTimer);
  _flashTimer = setTimeout(() => { flashMessageText.value = ''; _flashTimer = null; }, 1800);
}

function handleImgLoad(e: Event) {
  (e.target as HTMLImageElement).classList.add('loaded');
}

function getCoverUrl(episode: any): string {
  if (episode?.coverUrl) return episode.coverUrl;
  const pid = episode?.podcastId;
  if (pid) {
    const sub = subscriptions.value.find(s => s.id === pid);
    if (sub?.coverUrl) return sub.coverUrl;
  }
  return '';
}

function stopDownloadPolling() {
  if (_downloadPollTimer) {
    clearInterval(_downloadPollTimer);
    _downloadPollTimer = null;
  }
}

// Track the episode currently shown in the expanded player so the push-based
// download listeners below only react when relevant.
let _activeDownloadEpisodeId: string | undefined;

function handleDownloadProgressPush(eid: string, progress: number) {
  if (eid !== _activeDownloadEpisodeId) return;
  if (downloadState.value !== 'downloading') downloadState.value = 'downloading';
  downloadProgress.value = progress;
}

function handleDownloadCompletePush(eid: string) {
  if (eid !== _activeDownloadEpisodeId) return;
  downloadState.value = 'cached';
  downloadProgress.value = 100;
  stopDownloadPolling();
}

// Register once. Background broadcasts these while a download is in flight;
// the polling loop is a fallback, but push gives near-instant UI updates.
let _pushListenerRegistered = false;
function ensureDownloadPushListener() {
  if (_pushListenerRegistered) return;
  _pushListenerRegistered = true;
  chrome.runtime.onMessage.addListener((msg: any) => {
    if (msg?.type === MSG.AUDIO_DOWNLOAD_PROGRESS && msg.eid != null && msg.progress != null) {
      handleDownloadProgressPush(msg.eid, msg.progress);
    } else if (msg?.type === MSG.AUDIO_DOWNLOAD_COMPLETE && msg.eid != null) {
      handleDownloadCompletePush(msg.eid);
    }
    return false;
  });
}

function startDownloadPolling() {
  stopDownloadPolling();
  _downloadPollTimer = setInterval(async () => {
    const ep = playbackState.value?.episode;
    if (!ep || !isExpandedPlayerOpen.value) { stopDownloadPolling(); return; }
    if (downloadState.value !== 'downloading') { stopDownloadPolling(); return; }
    const result = await sendMessage(MSG.AUDIO_DOWNLOAD_PROGRESS, { episodeId: ep.id });
    if (result?.state === 'complete') {
      downloadState.value = 'cached';
      downloadProgress.value = 100;
      stopDownloadPolling();
    } else if (result?.progress !== undefined) {
      downloadProgress.value = result.progress;
    }
  }, 1000);
}

async function checkDownloadStatus(episodeId?: string) {
  if (!episodeId) { downloadState.value = 'idle'; return; }
  const result = await sendMessage(MSG.AUDIO_CACHE_CHECK, { episodeId });
  if (result?.cached) {
    downloadState.value = 'cached';
  } else if (result?.meta?.status === 'downloading') {
    downloadState.value = 'downloading';
    downloadProgress.value = result.meta.progress || 0;
    startDownloadPolling();
  } else {
    downloadState.value = 'idle';
  }
}

async function handleDownloadClick() {
  const ep = playbackState.value?.episode;
  if (!ep) return;

  try {
    if (downloadState.value === 'cached') {
      await sendMessage(MSG.AUDIO_OPEN_FOLDER, { episodeId: ep.id });
      return;
    }
    if (downloadState.value === 'downloading') {
      stopDownloadPolling();
      await sendMessage(MSG.AUDIO_DOWNLOAD_CANCEL, { episodeId: ep.id });
      downloadState.value = 'idle';
      return;
    }
    if (!ep.audioUrl) return;
    downloadState.value = 'downloading';
    downloadProgress.value = 0;
    const res = await sendMessage(MSG.AUDIO_DOWNLOAD_START, {
      episodeId: ep.id,
      audioUrl: ep.audioUrl,
      episodeTitle: ep.title || '',
    });
    if (!res?.success) {
      downloadState.value = 'idle';
    } else {
      startDownloadPolling();
    }
  } catch (e) {
    console.warn('Download click failed:', e);
    downloadState.value = 'idle';
  }
}

function cycleSpeed() {
  const current = playbackState.value?.speed || 1;
  const idx = PLAYBACK_SPEEDS.indexOf(current);
  const next = PLAYBACK_SPEEDS[(idx + 1) % PLAYBACK_SPEEDS.length];
  sendMessage(MSG.SPEED, { speed: next }).catch(() => {});
}

async function handleTogglePlay() {
  const ps = playbackState.value;
  if (!ps?.episode) return;
  await sendMessage(MSG.TOGGLE).catch(() => {});
}

export async function playAdjacentEpisode(step: number) {
  let pl = playlist.value;
  if (!pl || pl.length === 0) {
    await loadPlaylist();
    pl = playlist.value;
  }
  if (!pl || pl.length === 0) {
    flashMessage(t('player.noPlaylist'));
    return;
  }

  const currentIndex = findPlaylistIndex(pl, playbackState.value?.episode, playlistIndex.value);
  if (currentIndex < 0) {
    flashMessage(t('player.notInPlaylist'));
    return;
  }

  const targetIndex = currentIndex + step;
  if (targetIndex < 0 || targetIndex >= pl.length) {
    flashMessage(t(targetIndex < 0 ? 'player.noNext' : 'player.noPrev'));
    return;
  }

  handlePlaylistClick(targetIndex);
}

async function toggleFavorite() {
  const episode = playbackState.value?.episode;
  if (!episode) return;
  try {
    if (isFavorited.value) {
      await sendMessage(MSG.FAVORITE_REMOVE, { episodeId: episode.id });
      isFavorited.value = false;
    } else {
      await sendMessage(MSG.FAVORITE_ADD, {
        episode: {
          id: episode.id,
          title: episode.title,
          podcastId: episode.podcastId || '',
          podcastName: episode.podcastName || episode.podcastTitle || '',
          coverUrl: getCoverUrl(episode) || '',
          duration: playbackState.value?.duration || 0,
          audioUrl: episode.audioUrl || '',
          url: episode.url || '',
        },
      });
      isFavorited.value = true;
    }
    // Notify the Favorites page to refresh so its list stays in sync.
    favoritesRefreshTick.value++;
  } catch (e) {
    console.warn('Toggle favorite failed:', e);
  }
}

async function loadPlaylist() {
  // Primary path: read the in-memory playlist from the offscreen document.
  // During an offscreen teardown/rebuild (common after pausing — the doc can be
  // recycled) GET_PLAYLIST races the rebuild and may return empty/error, so fall
  // back to GET_PLAYING_STATE which reads persisted state directly from storage.
  let result = await sendMessage(MSG.GET_PLAYLIST);
  if (!result || !Array.isArray(result.playlist) || result.playlist.length === 0) {
    // Add small delay for offscreen rebuild to complete before trying fallback
    await new Promise(resolve => setTimeout(resolve, 50));
    const fallback = await sendMessage(MSG.GET_PLAYING_STATE);
    if (fallback && Array.isArray(fallback.playlist) && fallback.playlist.length > 0) {
      result = {
        playlist: fallback.playlist,
        playlistIndex: fallback.playlistIndex,
        currentEpisode: fallback.episode,
      };
    }
  }
  if (!result || !Array.isArray(result.playlist) || result.playlist.length === 0) return;
  playlist.value = result.playlist;
  const ep = playbackState.value?.episode || result.currentEpisode;
  const idx = findPlaylistIndex(result.playlist, ep, result.playlistIndex);
  playlistIndex.value = idx;
}

function findPlaylistIndex(pl: Episode[], episode: any, fallback = -1): number {
  if (!pl || pl.length === 0) return -1;
  if (!episode) return fallback >= 0 && fallback < pl.length ? fallback : 0;
  const eid = episode.id || episode.eid;
  const idx = pl.findIndex((item) => {
    const iid = item.id || item.eid;
    if (eid && iid) return iid === eid;
    if (episode.audioUrl && item.audioUrl) return item.audioUrl === episode.audioUrl;
    if (episode.url && item.url) return item.url === episode.url;
    return false;
  });
  return idx >= 0 ? idx : (fallback >= 0 && fallback < pl.length ? fallback : 0);
}

function closePlaylist() {
  if (!isPlaylistOpen.value) return;
  isPlaylistOpen.value = false;
  setTimeout(() => {
    isPlaylistHidden.value = true;
  }, 350); // Match CSS transition duration
}

async function togglePlaylist() {
  const open = !isPlaylistOpen.value;
  if (open) {
    // Show playlist: remove hidden first, then add visible in next frame
    isPlaylistHidden.value = false;
    isPlaylistOpen.value = true;
    await loadPlaylist();
  } else {
    closePlaylist();
  }
}

// Play a playlist item, resolving the real audio URL first when the stored
// audioUrl is not a direct media link (mirrors old playPlaylistEpisode). Without
// this fallback, navigating to an episode whose audioUrl is empty or a
// web-page URL would silently fail at the offscreen EXTRACT_RESULT handler.
async function handlePlaylistClick(idx: number) {
  const pl = playlist.value;
  const ep = pl[idx];
  if (!ep) return;

  const speed = playbackState.value?.speed || 1;
  const feedUrl = ep.feedUrl || '';

  const playWith = (episode: Episode) => {
    sendMessage(MSG.EXTRACT_RESULT, {
      data: { type: 'episode', episode },
      playlist: pl,
      playlistIndex: idx,
      speed,
    }).catch(() => {});
  };

  if (isDirectAudioUrl(ep.audioUrl)) {
    playWith(ep);
  } else if (feedUrl) {
    try {
      const result = await sendMessage<{ audioUrl?: string }>(MSG.FETCH_AUDIO_URL, {
        feedUrl,
        episodeId: ep.id || ep.eid,
        episodeTitle: ep.title,
      });
      if (result?.audioUrl) {
        playWith({ ...ep, audioUrl: result.audioUrl });
      }
    } catch {
      // leave as-is; nothing plays but no crash
    }
  }
  closePlaylist();
}

function handleArtistClick() {
  const ep = playbackState.value?.episode;
  if (!ep?.podcastId) return;
  isExpandedPlayerOpen.value = false;
  closePlaylist();
  currentPodcastId.value = ep.podcastId;
  currentFeedUrl.value = ep.feedUrl || null;
  currentPage.value = 'podcastDetail';
}

export function ExpandedPlayer() {
  const ps = playbackState.value;
  if (!ps?.episode) return null;

  useEffect(() => {
    if (isExpandedPlayerOpen.value && ps.episode) {
      _activeDownloadEpisodeId = ps.episode.id || ps.episode.eid;
      ensureDownloadPushListener();
      sendMessage(MSG.FAVORITE_CHECK, { episodeId: ps.episode.id }).then((result) => {
        isFavorited.value = !!result?.isFavorite;
      }).catch(() => {});
      checkDownloadStatus(ps.episode.id);
      // Keep the playlist highlight in sync when the current episode changes
      // (e.g. background auto-advanced to the next track).
      const pl = playlist.value;
      if (pl.length > 0) {
        const idx = findPlaylistIndex(pl, ps.episode, playlistIndex.value);
        if (idx >= 0 && idx !== playlistIndex.value) playlistIndex.value = idx;
      }
    }
    return () => { stopDownloadPolling(); };
  }, [isExpandedPlayerOpen.value, ps.episode?.id]);

  // Keep the active playlist item scrolled into view whenever the highlight
  // moves or the playlist is opened.
  useEffect(() => {
    if (!isPlaylistOpen.value || !isExpandedPlayerOpen.value) return;
    const active = document.querySelector('.expanded-playlist.visible .playlist-item.active');
    if (active) (active as HTMLElement).scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
  }, [isPlaylistOpen.value, isExpandedPlayerOpen.value, playlistIndex.value]);

  const progress = ps.duration > 0 ? (ps.currentTime / ps.duration) * 100 : 0;
  const coverUrl = getCoverUrl(ps.episode);

  function handleProgressClick(e: MouseEvent) {
    const el = e.currentTarget as HTMLDivElement;
    const rect = el.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    sendMessage(MSG.SEEK, { time: ratio * (ps?.duration || 0) });
  }

  function handleProgressHover(e: MouseEvent) {
    const el = e.currentTarget as HTMLDivElement;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    hoverRatio.value = ratio;
    hoverTime.value = formatTime(ratio * (ps?.duration || 0));
  }

  function handleClose() {
    isExpandedPlayerOpen.value = false;
    closePlaylist();
    stopDownloadPolling();
  }

  const pl = playlist.value;
  const plIdx = playlistIndex.value;
  const dlState = downloadState.value;

  return (
    <div class={`expanded-player${isExpandedPlayerOpen.value ? ' visible' : ''}`}>
      {flashMessageText.value && (
        <div class="player-flash-toast">{flashMessageText.value}</div>
      )}
      <div class="expanded-header">
        <button class="expanded-close" onClick={handleClose}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
        </button>
        <div class="expanded-header-title">{t('player.playing')}</div>
        <div style="width:22px" />
      </div>

      <div class="expanded-body">
        <div class="expanded-cover-wrap cover-img">
          {coverUrl && <img src={coverUrl} onLoad={handleImgLoad} />}
        </div>

        <div class="expanded-info">
          <div class="expanded-title">{ps.episode.title}</div>
          <div
            class={`expanded-artist${ps.episode.podcastId ? ' clickable' : ''}`}
            role="button"
            tabindex={0}
            onClick={handleArtistClick}
          >
            {ps.episode.podcastName || ps.episode.podcastTitle}
          </div>
        </div>

        <div class="expanded-progress">
          <div
            class="progress-track"
            onClick={handleProgressClick}
            onMouseMove={handleProgressHover}
            onMouseLeave={() => { hoverTime.value = null; }}
          >
            <div class="progress-fill" style={`width:${progress}%`} />
            {hoverTime.value != null && (
              <div class="progress-tooltip" style={`left:${(hoverRatio.value * 100).toFixed(1)}%`}>{hoverTime.value}</div>
            )}
          </div>
          <div class="progress-time">
            <span>{ps.loading ? '...' : formatTime(ps.currentTime)}</span>
            <span>{ps.loading ? '...' : formatTime(ps.duration)}</span>
          </div>
        </div>

        <div class="expanded-controls-main">
          <button class="ctrl-skip" onClick={() => playAdjacentEpisode(1)} title={t('player.prev')}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="19 20 9 12 19 4 19 20" /><rect x="5" y="4" width="2" height="16" /></svg>
          </button>
          <button class="ctrl-skip" onClick={() => sendMessage(MSG.SEEK, { time: Math.max(0, (ps.currentTime || 0) - 30) }).catch(() => {})} title={t('player.back30')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
          </button>
          <button class="ctrl-play" onClick={handleTogglePlay}>
            {ps.playing ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3" /></svg>
            )}
          </button>
          <button class="ctrl-skip" onClick={() => sendMessage(MSG.SEEK, { time: (ps.currentTime || 0) + 30 }).catch(() => {})} title={t('player.forward30')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10" /></svg>
          </button>
          <button class="ctrl-skip" onClick={() => playAdjacentEpisode(-1)} title={t('player.next')}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 4 15 12 5 20 5 4" /><rect x="17" y="4" width="2" height="16" /></svg>
          </button>
        </div>

        <div class="expanded-controls-secondary">
          <button class="ctrl-secondary speed-display" onClick={cycleSpeed} title={t('player.speed')}>
            {(ps.speed || 1)}x
          </button>
          <button class={`ctrl-secondary${isFavorited.value ? ' favorited' : ''}`} onClick={toggleFavorite} title={t('mine.favorites')}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill={isFavorited.value ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
            <span>{t('mine.favorites')}</span>
          </button>
          <button class={`ctrl-secondary${dlState === 'cached' ? ' cached' : ''}${dlState === 'downloading' ? ' downloading' : ''}`} onClick={handleDownloadClick} title={t('player.download')}>
            <svg id="expDownloadIcon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              {dlState === 'cached'
                ? <polyline points="20 6 9 17 4 12" />
                : <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>
              }
            </svg>
            <span class="download-progress-text hidden" style={dlState === 'downloading' ? 'display:inline' : 'display:none'}>{downloadProgress.value}%</span>
            <span style={dlState === 'downloading' ? 'display:none' : undefined}>
              {dlState === 'cached' ? t('player.downloaded') : t('player.download')}
            </span>
          </button>
          <button class="ctrl-secondary" onClick={togglePlaylist} title={t('player.playlist')}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
            <span>{t('player.playlist')}</span>
          </button>
        </div>
      </div>

      {!isPlaylistHidden.value && (
        <div class={`expanded-playlist${isPlaylistOpen.value ? ' visible' : ''}`}>
          <div class="expanded-playlist-backdrop" onClick={togglePlaylist} />
          <div class="expanded-playlist-panel">
            <div class="expanded-playlist-panel-header">
              <div class="playlist-header">
                {t('player.playlist')}{pl.length > 0 ? ` (${pl.length})` : ''}
              </div>
              <button class="playlist-close-btn" onClick={togglePlaylist}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div class="playlist-items">
              {pl.length === 0 ? (
                <div class="empty-state" style="padding:16px">{t('player.noPlaylist')}</div>
              ) : (
                pl.map((ep, i) => (
                  <div
                    class={`playlist-item${i === plIdx ? ' active' : ''}`}
                    key={i}
                    onClick={() => handlePlaylistClick(i)}
                  >
                    <span class="playlist-item-icon">
                      {i === plIdx && (
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                      )}
                    </span>
                    <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{ep.title}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
