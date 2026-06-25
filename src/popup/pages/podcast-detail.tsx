import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { MSG, sendMessage } from '../../lib/messaging';
import { t } from '../../lib/i18n';
import { handleImgLoad } from '../lib/cover';
import { useMessage } from '../hooks/use-message';
import { dispatchClosePage } from '../lib/dom-events';
import { BackButton } from '../components/BackButton';
import { isSubscribed as isPodcastSubscribed } from '../lib/subscribe';
import { XYZ_BASE_URL } from '../../lib/constants';
import {
  currentPage,
  currentPodcastId,
  currentFeedUrl,
  subscriptions,
  searchPrefill,
} from '../state';
import type { Episode, Podcast } from '../state';
import { EpisodeList } from '../components/episode-list';
import { filterEpisodes } from '../lib/filter-episodes';

const podcast = signal<Podcast | null>(null);
const episodes = signal<Episode[]>([]);
const loading = signal(false);
const errorText = signal('');
const titleFallback = signal('');
const coverFallback = signal<string | null>(null);
const descExpanded = signal(false);

// List filter state — local to this page; the side-panel view keeps its
// own independent state (per spec §D.1).
const filterQuery = signal('');


async function toggleSubscribe(p: Podcast) {
  const subbed = isPodcastSubscribed(p.id, subscriptions.value);
  if (subbed) {
    await sendMessage(MSG.UNSUBSCRIBE, { podcastId: p.id });
    // Optimistic UI: remove immediately (see search.tsx for rationale).
    subscriptions.value = subscriptions.value.filter(
      (s) => (s.id || s.pid) !== p.id,
    );
  } else {
    const isExternal = p.id?.startsWith('ext-') || p.id?.startsWith('opml-');
    await sendMessage(MSG.SUBSCRIBE, {
      podcast: {
        id: p.id,
        name: p.title || p.name,
        url: isExternal ? (p.feedUrl || '') : `${XYZ_BASE_URL}/podcast/${p.id}`,
        feedUrl: p.feedUrl,
        isExternal,
      },
    });
    // Optimistic UI: add immediately.
    subscriptions.value = [
      ...subscriptions.value,
      {
        id: p.id,
        pid: p.id,
        title: p.title || p.name,
        name: p.title || p.name,
        coverUrl: p.coverUrl,
        feedUrl: p.feedUrl,
        subscribedAt: Date.now(),
        isExternal,
      },
    ];
  }
}

export function PodcastDetailPage() {
  const visible = currentPage.value === 'podcastDetail';

  useEffect(() => {
    if (!visible) return;
    const pid = currentPodcastId.value;
    const furl = currentFeedUrl.value;
    if (!pid) return;

    podcast.value = null;
    episodes.value = [];
    loading.value = true;
    errorText.value = '';
    titleFallback.value = '';
    coverFallback.value = null;

    loadDetail(pid, furl);
  }, [visible, currentPodcastId.value, currentFeedUrl.value]);

  // Re-load when the background finishes fetching this podcast's detail
  // (e.g. async feed parse completed after the page was opened).
  useMessage(MSG.PODCAST_DETAIL_UPDATE, (data) => {
    if (!visible) return;
    if (data.podcastId === currentPodcastId.value) {
      loadDetail(currentPodcastId.value!, currentFeedUrl.value);
    }
  });

  async function loadDetail(
    podcastId: string,
    feedUrl: string | null,
  ) {
    loading.value = true;
    const result = await sendMessage(MSG.GET_PODCAST_DETAIL, {
      podcastId,
      feedUrl: feedUrl || '',
    });
    loading.value = false;

    if (result.type === 'loading') {
      loading.value = true;
      return;
    }

    if (result.type === 'podcast') {
      const p: Podcast = result.podcast;
      podcast.value = p;
      titleFallback.value = p.title || '';
      coverFallback.value = p.coverUrl || null;

      if (
        p.isExternal &&
        (!result.episodes || result.episodes.length === 0)
      ) {
        await tryFetchRss(podcastId, p.feedUrl || feedUrl || '');
      } else {
        episodes.value = result.episodes || [];
      }
    } else {
      errorText.value = result.error || t('search.noResults');
    }
  }

  async function tryFetchRss(podcastId: string, feedUrl: string) {
    const feedResult = await sendMessage(MSG.FETCH_RSS_FEED, {
      feedUrl,
      podcastId,
    });
    if (feedResult.success && feedResult.episodeCount > 0) {
      const updated = await sendMessage(MSG.GET_PODCAST_DETAIL, { podcastId });
      if (updated.type === 'podcast') {
        podcast.value = updated.podcast;
        episodes.value = updated.episodes || [];
        return;
      }
    }
    episodes.value = [];
  }

  function handleRefreshRss() {
    const pid = currentPodcastId.value;
    const furl = currentFeedUrl.value;
    if (!pid) return;
    loading.value = true;
    sendMessage(MSG.FETCH_RSS_FEED, {
      feedUrl: podcast.value?.feedUrl || furl || '',
      podcastId: pid,
    }).then(async (feedResult) => {
      if (feedResult.success && feedResult.episodeCount > 0) {
        const updated = await sendMessage(MSG.GET_PODCAST_DETAIL, {
          podcastId: pid,
        });
        if (updated.type === 'podcast') {
          podcast.value = updated.podcast;
          episodes.value = updated.episodes || [];
          loading.value = false;
          return;
        }
      }
      loading.value = false;
    });
  }

  const p = podcast.value;
  const isExternal =
    currentPodcastId.value?.startsWith('ext-') ||
    currentPodcastId.value?.startsWith('opml-');
  const isSubbed = p
    ? subscriptions.value.some(
        (s) => s.id === p.id || s.pid === p.id,
      )
    : false;
  const displayTitle = p?.title || titleFallback.value;
  const displayCover = p?.coverUrl || coverFallback.value;
  const desc = p?.description || '';
  const showDesc = descExpanded.value ? desc : desc.slice(0, 100);

  // Derive the displayed list from the search query. Memoization is implicit
  // via signal reads inside the render — Preact re-renders on any signal change.
  // sortMode is fixed at the default ('new-old') and statusFilter at 'all':
  // both toggles were removed (the status filter had no real data behind it on
  // the detail page — episodes come from RSS without injected play progress).
  const filteredEpisodes = filterEpisodes(episodes.value, {
    query: filterQuery.value,
    sortMode: 'new-old',
    statusFilter: 'all',
  });

  return (
    <div class={`secondary-page${visible ? ' visible' : ''}`}>
      <div class="secondary-header">
        <BackButton onBack={dispatchClosePage} />
        <div class="secondary-title">{displayTitle}</div>
        {!isExternal && p && (
          <button
            class={`subscribe-btn${isSubbed ? ' subscribed' : ''}`}
            onClick={() => toggleSubscribe(p)}
          >
            {isSubbed ? t('detail.subscribed') : t('detail.subscribe')}
          </button>
        )}
      </div>

      <div class="secondary-content">
        {p && (
          <div
            style="display:flex;align-items:flex-start;gap:10px;padding:8px 0 4px"
          >
            <div class="cover-img detail-cover-wrap">
              {displayCover && (
                <img
                  src={displayCover}
                  alt=""
                  onLoad={handleImgLoad}
                />
              )}
            </div>
            <div class="detail-text">
              <div class="detail-title">{displayTitle}</div>
              <div class="detail-author">{p.author || ''}</div>
              {desc && (
                <div style="margin-top:4px">
                  <div
                    class="detail-description-inline"
                    style={
                      descExpanded.value
                        ? 'white-space:normal;-webkit-line-clamp:unset'
                        : undefined
                    }
                  >
                    {showDesc}
                  </div>
                  {desc.length > 100 && (
                    <button
                      class="secondary-action"
                      style="padding:0;font-size:11px;margin-top:2px"
                      onClick={() => {
                        descExpanded.value = !descExpanded.value;
                      }}
                    >
                      {descExpanded.value
                        ? t('detail.collapse')
                        : t('detail.expand')}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <div class="section-header">
          <div class="section-title">{t('detail.episodes')}</div>
          {p?.episodeCount != null && (
            <span
              style="font-size:11px;color:var(--text-secondary)"
            >
              {p.episodeCount} {t('detail.episodeCount')}
            </span>
          )}
        </div>

        {/* Search bar — only shown once episodes are loaded */}
        {!loading.value && episodes.value.length > 0 && (
          <div class="episode-filter-bar">
            <input
              class="episode-filter-input"
              type="text"
              placeholder={t('detail.filterPlaceholder')}
              value={filterQuery.value}
              onInput={(e: Event) => {
                filterQuery.value = (e.target as HTMLInputElement).value;
              }}
            />
          </div>
        )}

        {loading.value && (
          <div class="loading">…</div>
        )}

        {!loading.value && errorText.value && (
          <div class="empty-state">{errorText.value}</div>
        )}

        {!loading.value &&
          !errorText.value &&
          p?.isExternal &&
          episodes.value.length === 0 && (
            <div class="empty-state">
              <div style="padding:20px;text-align:center">
                <p style="margin-bottom:12px;color:var(--text-secondary)">
                  {t('opml.external.noEpisodes')}
                </p>
                <div
                  style="display:flex;gap:12px;justify-content:center;margin-top:16px"
                >
                  <button
                    class="external-action-btn"
                    onClick={() => {
                      // Open the search page with the podcast title prefilled so
                      // the user lands on a catalog search for it.
                      searchPrefill.value = podcast.value?.title || titleFallback.value || '';
                      document.dispatchEvent(
                        new CustomEvent('open-page', {
                          detail: { page: 'search' },
                        }),
                      );
                    }}
                  >
                    {t('opml.external.findOnXyz')}
                  </button>
                  <button
                    class="external-action-btn"
                    onClick={handleRefreshRss}
                  >
                    {t('opml.external.refreshRss')}
                  </button>
                </div>
              </div>
            </div>
          )}

        {!loading.value && episodes.value.length > 0 && (
          filteredEpisodes.length > 0 ? (
            <EpisodeList episodes={filteredEpisodes} podcast={p} />
          ) : (
            <div class="empty-state">
              <div>{t('detail.filterNoResults')}</div>
              {filterQuery.value.trim() && (
                <div class="filter-scope-hint">
                  {t('detail.filterScopeHint')}
                </div>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
}
