import { useEffect, useRef } from 'preact/hooks';
import {
  currentTab,
  playbackState,
  settings,
  subscriptions,
  playlist,
  playlistIndex as playlistIndexSignal,
  currentPage,
  previousPage,
  currentPodcastId,
  currentFeedUrl,
  isExpandedPlayerOpen,
  isPlaylistOpen,
  searchHistory,
  favorites,
  hasActivePlayback,
  miniTitleOverride,
  mineRefreshTick,
  webdavSyncTick,
} from './state';
import type { Settings, PlaybackState, Podcast, Episode } from './state';
import { sendMessage, MSG } from '../lib/messaging';
import { initLocale, t, localeLoaded } from '../lib/i18n';
import { isDirectAudioUrl } from '../lib/utils';
import { applyTheme } from '../lib/theme';
import { TabBar } from './components/tab-bar';
import { MiniPlayer } from './components/mini-player';
import { ExpandedPlayer } from './components/expanded-player';
import { HomePage } from './pages/home';
import { MinePage } from './pages/mine';
import { SearchPage } from './pages/search';
import { PodcastDetailPage } from './pages/podcast-detail';
import { HistoryPage } from './pages/history';
import { FavoritesPage } from './pages/favorites';
import { SubMgmtPage } from './pages/sub-mgmt';
import { StatsPage } from './pages/stats';
import { ImportPage } from './pages/import';

function openPage(page: string, data?: Record<string, any>) {
  previousPage.value = currentPage.value;
  currentPage.value = page;
  isExpandedPlayerOpen.value = false;
  isPlaylistOpen.value = false;
  if (data?.podcastId) currentPodcastId.value = data.podcastId;
  if (data?.feedUrl) currentFeedUrl.value = data.feedUrl;
}

function closePage() {
  currentPage.value = previousPage.value;
  previousPage.value = null;
}

async function playEpisode(episode: any, episodeList: any[] = [], podcast: any = null, autoPlay = true, resumeTime = 0) {
  const speed = settings.value.defaultSpeed || 1;
  const epWithPodcast = podcast ? {
    ...episode,
    podcastId: episode.podcastId || podcast.id,
    podcastName: episode.podcastName || episode.podcastTitle || podcast.title,
    podcastTitle: episode.podcastTitle || episode.podcastName || podcast.title,
    coverUrl: episode.coverUrl || podcast.coverUrl,
    feedUrl: episode.feedUrl || podcast.feedUrl || '',
  } : episode;

  const epList = episodeList.map((e: any) => podcast ? {
    ...e,
    podcastId: e.podcastId || podcast.id,
    podcastName: e.podcastName || e.podcastTitle || podcast.title,
    podcastTitle: e.podcastTitle || e.podcastName || podcast.title,
    coverUrl: e.coverUrl || podcast.coverUrl,
    feedUrl: e.feedUrl || podcast.feedUrl || '',
  } : e);

  // Locate the episode within the list so prev/next navigation uses the
  // correct baseline index. Falls back to 0 when the episode isn't found.
  const episodeId = episode.id || episode.eid;
  const foundIndex = epList.findIndex((e: any) => (e.id || e.eid) === episodeId);
  const playlistIndex = foundIndex >= 0 ? foundIndex : 0;
  if (epList.length > 0) {
    playlist.value = epList;
    playlistIndexSignal.value = playlistIndex;
  }

  playbackState.value = {
    ...playbackState.value!,
    loading: true,
    episode: epWithPodcast,
    currentTime: resumeTime,  // position the bar at the resume point while loading
    duration: episode.duration || playbackState.value?.duration || 0,
  } as PlaybackState;

  sendMessage(MSG.PLAY_HISTORY_ADD, { episode: epWithPodcast }).catch(() => {});
  // Notify the home page to refresh its "continue listening" card.
  document.dispatchEvent(new CustomEvent('history-updated'));

  const isRealAudioUrl = isDirectAudioUrl(episode.audioUrl);
  if (isRealAudioUrl) {
    sendMessage(MSG.EXTRACT_RESULT, {
      data: { type: 'episode', episode: epWithPodcast },
      playlist: epList,
      playlistIndex,
      speed,
      autoPlay,
      resumeTime,
    }).catch(() => {});
  } else {
    const feedUrl = episode.feedUrl || podcast?.feedUrl || '';
    if (feedUrl) {
      const result = await sendMessage(MSG.FETCH_AUDIO_URL, {
        feedUrl,
        episodeId: episode.id,
        episodeTitle: episode.title,
      });
      if (result.audioUrl) {
        sendMessage(MSG.EXTRACT_RESULT, {
          data: { type: 'episode', episode: { ...epWithPodcast, audioUrl: result.audioUrl } },
          playlist: epList,
          playlistIndex,
          speed,
          autoPlay,
          resumeTime,
        }).catch(() => {});
      }
    }
  }
}

async function handlePlayEpisode(e: Event) {
  const detail = (e as CustomEvent).detail;
  if (!detail?.episode) return;
  const episode = detail.episode;
  const episodeList = detail.episodeList || [];
  const podcast = detail.podcast || null;
  const autoPlay = detail.autoPlay !== false;
  // Universal resume: every play-new entry point restores lastPosition. Explicit
  // detail.resumeTime (e.g. a continue-listening card with a fresh position)
  // wins over the episode's stored lastPosition.
  let resumeTime = detail.resumeTime ?? (episode.lastPosition || 0);
  // Fallback: if the episode object doesn't carry lastPosition (e.g. loaded
  // from RSS / external API), look it up from the local play history store.
  if (!resumeTime) {
    const eid = episode.id || episode.eid;
    if (eid) {
      try {
        const result = await sendMessage<{ position?: number }>(MSG.GET_PLAY_POSITION, { episodeId: eid });
        if (result?.position) resumeTime = result.position;
      } catch { /* ignore */ }
    }
  }

  let epList = episodeList;
  if (podcast?.id) {
    const result = await sendMessage(MSG.GET_PODCAST_DETAIL, { podcastId: podcast.id, feedUrl: episode.feedUrl || '' });
    if (result?.type === 'podcast' && result.episodes?.length > 0) {
      epList = result.episodes;
    }
  }

  playEpisode(episode, epList, podcast, autoPlay, resumeTime);
}

async function handlePlayResume(e: Event) {
  const detail = (e as CustomEvent).detail;
  const ps = playbackState.value;
  let episode = detail?.episode || null;
  let resumeTime = 0;

  if (!episode) {
    if (ps?.episode) {
      episode = ps.episode;
      resumeTime = ps.currentTime || 0;
    } else {
      const history = await sendMessage<any>(MSG.GET_PLAY_HISTORY);
      if (Array.isArray(history) && history.length > 0) {
        episode = history[0];
        resumeTime = episode.lastPosition || 0;
      }
    }
  } else {
    resumeTime = episode.lastPosition || 0;
  }

  if (!episode) return;

  // Restore the playlist cheaply. The offscreen document keeps the current
  // playlist in memory (and rehydrates it from persisted playingState on its
  // own cold start), so GET_PLAYLIST is an in-process round-trip. Only fall
  // back to GET_PODCAST_DETAIL — which may trigger a network RSS fetch — when
  // the offscreen has no playlist yet (e.g. never played in this session).
  try {
    const pl = await sendMessage<any>(MSG.GET_PLAYLIST);
    if (pl?.playlist && pl.playlist.length > 0) {
      playEpisode(episode, pl.playlist, null, true, resumeTime);
      return;
    }
  } catch (err) {
    console.warn('play-resume: GET_PLAYLIST failed', err);
  }

  // Last resort: rebuild from the podcast's episode list.
  const podcastId = episode.podcastId;
  if (podcastId) {
    try {
      const result = await sendMessage<any>(MSG.GET_PODCAST_DETAIL, {
        podcastId,
        feedUrl: episode.feedUrl || '',
      });
      if (result?.type === 'podcast' && result.episodes?.length > 0) {
        playEpisode(episode, result.episodes, result.podcast, true, resumeTime);
        return;
      }
    } catch (err) {
      console.warn('play-resume: failed to rebuild playlist', err);
    }
  }
  playEpisode(episode, [], null, true, resumeTime);
}

export function App() {
  const appRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = appRef.current?.closest('#app') as HTMLElement | null;

    // Flush dirty data when the popup is closed so background auto-sync runs.
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        sendMessage(MSG.POPUP_CLOSED).catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    // Allow other pages (e.g. import) to ask the Mine page to refresh.
    const onRefreshMine = () => { mineRefreshTick.value++; };
    document.addEventListener('refresh-mine', onRefreshMine);

    async function init() {
      // Register message listeners FIRST, before any await. Previously these
      // were registered after GET_SETTINGS + initLocale resolved, so any
      // STATE_UPDATE / SETTINGS_UPDATE pushed during that ~tens-of-ms window
      // was silently dropped.
      chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === MSG.STATE_UPDATE) {
          const state = msg.state as PlaybackState;
          playbackState.value = state;
          // Surface playback errors briefly in the mini-player title, then
          // restore. Mirrors old popup/app.js STATE_UPDATE error handling.
          if (state?.error) {
            miniTitleOverride.value = t('player.error') + ': ' + state.error;
            const shown = miniTitleOverride.value;
            setTimeout(() => {
              if (miniTitleOverride.value === shown) miniTitleOverride.value = '';
            }, 3000);
          }
        }
        if (msg.type === MSG.SETTINGS_UPDATE) {
          settings.value = msg.settings as Settings;
          applyTheme(msg.settings?.theme || 'system');
        }
        if (msg.type === MSG.WEBDAV_SYNC_DONE) {
          // Ask the Mine page to refresh its WebDAV sync status badge.
          webdavSyncTick.value++;
        }
        // HOME_DATA_UPDATE, PODCAST_DETAIL_UPDATE, IMPORT_OPML_PROGRESS, and the
        // download progress/complete pushes are handled directly inside their
        // respective page/component onMessage listeners.
      });

      // Parallelize the cold-start critical path. GET_SETTINGS and
      // ENSURE_OFFSCREEN have no data dependency, so fire them together.
      // Previously they were serialized (settings → locale → offscreen →
      // state), making every popup open pay the full sum of their latencies.
      const [s] = await Promise.all([
        sendMessage<Settings>(MSG.GET_SETTINGS),
        sendMessage(MSG.ENSURE_OFFSCREEN),
      ]);
      settings.value = s || {};
      applyTheme(s?.theme || 'system');

      // initLocale dedups in-flight loads (main.tsx already started 'zh'), so
      // this is a no-op fetch when the locale matches. Run it in parallel with
      // GET_STATE, which needs offscreen (already ensured above).
      const [, ps] = await Promise.all([
        initLocale(s?.locale || 'zh'),
        sendMessage<PlaybackState>(MSG.GET_STATE),
      ]);
      if (ps?.episode) {
        playbackState.value = ps;
        if (!ps.playing) {
          sendMessage(MSG.EXTRACT_RESULT, {
            data: { type: 'episode', episode: ps.episode },
            playlist: [],
            playlistIndex: 0,
            speed: ps.speed || 1,
            autoPlay: false,
            resumeTime: ps.currentTime || 0,
          }).catch(() => {});
        }
      }

      sendMessage<Podcast[]>(MSG.GET_SUBSCRIPTIONS).then((subs) => {
        if (subs) subscriptions.value = Array.isArray(subs) ? subs : [];
      });

      sendMessage(MSG.FAVORITE_GET_ALL).then((favs) => {
        if (favs) favorites.value = Array.isArray(favs) ? favs : [];
      });

      sendMessage<string[]>(MSG.SEARCH_HISTORY_GET).then((history) => {
        if (history) searchHistory.value = Array.isArray(history) ? history : [];
      });

      requestAnimationFrame(() => {
        root?.classList.add('ready');
      });
    }

    init().catch((e) => {
      console.warn('init failed:', e);
    });

    function onOpenPage(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail?.page) {
        openPage(detail.page, detail.data);
      }
    }

    function onOpenPodcast(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        openPage('podcastDetail', {
          podcastId: detail.id,
          feedUrl: detail.feedUrl,
        });
      }
    }

    function onClosePage() {
      closePage();
    }

    document.addEventListener('open-page', onOpenPage);
    document.addEventListener('open-podcast', onOpenPodcast);
    document.addEventListener('close-page', onClosePage);
    document.addEventListener('play-episode', handlePlayEpisode);
    document.addEventListener('play-resume', handlePlayResume);

    return () => {
      document.removeEventListener('open-page', onOpenPage);
      document.removeEventListener('open-podcast', onOpenPodcast);
      document.removeEventListener('close-page', onClosePage);
      document.removeEventListener('play-episode', handlePlayEpisode);
      document.removeEventListener('play-resume', handlePlayResume);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('refresh-mine', onRefreshMine);
    };
  }, []);

  function handleTabSwitch(tab: 'home' | 'mine') {
    currentTab.value = tab;
    currentPage.value = null;
    previousPage.value = null;
    isExpandedPlayerOpen.value = false;
    isPlaylistOpen.value = false;
  }

  const showMiniPlayer = hasActivePlayback.value && !isExpandedPlayerOpen.value;
  // Subscribe to locale loading so the whole tree (incl. TabBar, which has no
  // own data-fetch to trigger a re-render) re-renders once translations land.
  // Wiring the value into an attribute keeps the read live through bundling
  // (a bare signal read in render gets dropped as dead code).
  const localeVersion = localeLoaded.value;

  return (
    <div id="mainView" ref={appRef} data-locale={localeVersion} class={showMiniPlayer ? 'has-mini-player' : undefined}>
      <TabBar />
      <div class="tab-content" style={showMiniPlayer ? 'padding-bottom:var(--mini-height)' : undefined}>
        {currentTab.value === 'home' ? <HomePage /> : <MinePage />}
      </div>

      <SearchPage />
      <PodcastDetailPage />
      <HistoryPage />
      <FavoritesPage />
      <SubMgmtPage />
      <StatsPage />
      <ImportPage />

      {showMiniPlayer && <MiniPlayer />}
      <ExpandedPlayer />
    </div>
  );
}
