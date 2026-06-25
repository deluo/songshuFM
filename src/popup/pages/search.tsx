import { signal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { MSG, sendMessage } from '../../lib/messaging';
import { t } from '../../lib/i18n';
import { handleImgLoad } from '../lib/cover';
import { BackButton } from '../components/BackButton';
import { dispatchClosePage } from '../lib/dom-events';
import { isSubscribed as isPodcastSubscribed } from '../lib/subscribe';
import { XYZ_BASE_URL } from '../../lib/constants';
import {
  currentPage,
  searchHistory,
  subscriptions,
  searchPrefill,
} from '../state';
import type { Podcast, Episode } from '../state';
import { formatRelativeDate, formatDuration } from '../../lib/utils';
import { handleEpisodeRowClick } from '../lib/play-decision';

const query = signal('');
const results = signal<Podcast[]>([]);
const loading = signal(false);
const errorText = signal('');
const showHistory = signal(true);

// Local episode search state. searchMode toggles between iTunes podcast search
// (default) and subscribed-episode search. The two share the query input.
type SearchMode = 'podcast' | 'episode';
const searchMode = signal<SearchMode>('podcast');
const episodeResults = signal<Episode[]>([]);
const episodeErrorText = signal('');

async function doSearch() {
  const q = query.value.trim();
  if (!q) return;

  showHistory.value = false;
  loading.value = true;
  errorText.value = '';
  results.value = [];

  sendMessage(MSG.SEARCH_HISTORY_ADD, { query: q }).catch(() => {});

  const result = await sendMessage(MSG.SEARCH_REQUEST, { query: q });
  loading.value = false;

  const items =
    result.type === 'search' && Array.isArray(result.results)
      ? result.results
      : result.results?.items;

  if (items?.length > 0) {
    // Normalize: api-search now returns `id`, but older cached results may still
    // use `podcastId`. Map to a consistent `id` so toggleSubscribe/openPodcast/
    // isSubscribed all resolve.
    results.value = items.map((it: any) => ({ ...it, id: it.id || it.podcastId }));
  } else {
    results.value = [];
    errorText.value = result.error || t('search.noResults');
  }
}

async function doEpisodeSearch() {
  const q = query.value.trim();
  if (!q) return;

  showHistory.value = false;
  loading.value = true;
  episodeErrorText.value = '';
  episodeResults.value = [];

  // Local episode search shares the iTunes search history (per spec §C.3).
  sendMessage(MSG.SEARCH_HISTORY_ADD, { query: q }).catch(() => {});

  sendMessage<{ episodes: Episode[] }>(MSG.LOCAL_SEARCH_EPISODES, { query: q })
    .then((r) => {
      loading.value = false;
      if (r?.episodes?.length > 0) {
        episodeResults.value = r.episodes;
      } else {
        episodeResults.value = [];
        episodeErrorText.value = t('search.episodeNoResults');
      }
    })
    .catch(() => {
      loading.value = false;
      episodeResults.value = [];
      episodeErrorText.value = t('search.episodeNoResults');
    });
}

// Run the search appropriate to the active tab.
function runSearch() {
  if (searchMode.value === 'episode') doEpisodeSearch();
  else doSearch();
}

function isSubscribed(podcastId: string) {
  return isPodcastSubscribed(podcastId, subscriptions.value);
}

async function toggleSubscribe(podcast: Podcast) {
  const subbed = isSubscribed(podcast.id || '');
  if (subbed) {
    await sendMessage(MSG.UNSUBSCRIBE, { podcastId: podcast.id });
    // Optimistic UI: remove immediately so the button reflects the new state
    // without waiting for the next subscriptions reload.
    subscriptions.value = subscriptions.value.filter(
      (s) => (s.id || s.pid) !== podcast.id,
    );
  } else {
    const isExternal =
      podcast.id?.startsWith('ext-') || podcast.id?.startsWith('opml-');
    await sendMessage(MSG.SUBSCRIBE, {
      podcast: {
        id: podcast.id,
        name: podcast.title,
        url: isExternal
          ? podcast.feedUrl
          : `${XYZ_BASE_URL}/podcast/${podcast.id}`,
        feedUrl: podcast.feedUrl,
        isExternal,
      },
    });
    // Optimistic UI: add immediately. The background will broadcast refresh
    // events too, but this makes the button flip without a round-trip.
    subscriptions.value = [
      ...subscriptions.value,
      {
        id: podcast.id,
        pid: podcast.id,
        title: podcast.title,
        name: podcast.title,
        coverUrl: podcast.coverUrl,
        feedUrl: podcast.feedUrl,
        subscribedAt: Date.now(),
        isExternal,
      },
    ];
  }
}


export function SearchPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const visible = currentPage.value === 'search';

  useEffect(() => {
    if (visible) {
      setTimeout(() => inputRef.current?.focus(), 260);
      showHistory.value = true;
      results.value = [];
      errorText.value = '';
      // If another page asked to prefill the query (e.g. Find on XYZ), honor it
      // and run the search immediately; otherwise start from a blank query.
      const prefill = searchPrefill.value;
      if (prefill) {
        query.value = prefill;
        searchPrefill.value = '';
        doSearch();
      } else {
        query.value = '';
        sendMessage<string[]>(MSG.SEARCH_HISTORY_GET).then((h) => {
          if (h) searchHistory.value = h;
        });
      }
    }
  }, [visible]);

  function handleHistoryClick(q: string) {
    query.value = q;
    if (inputRef.current) inputRef.current.value = q;
    doSearch();
  }

  function handleClearHistory() {
    sendMessage(MSG.SEARCH_HISTORY_CLEAR);
    searchHistory.value = [];
  }

  function openPodcast(item: Podcast) {
    document.dispatchEvent(
      new CustomEvent('open-page', {
        detail: {
          page: 'podcastDetail',
          data: {
            podcastId: item.id,
            feedUrl: item.feedUrl,
          },
        },
      }),
    );
  }

  return (
    <div class={`secondary-page${visible ? ' visible' : ''}`}>
      <div class="secondary-header">
        <BackButton onBack={dispatchClosePage} />
        <div class="search-input-wrap">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder={t('search.placeholder')}
            value={query.value}
            onInput={(e: Event) => {
              query.value = (e.target as HTMLInputElement).value;
            }}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === 'Enter') runSearch();
            }}
          />
        </div>
      </div>

      <div class="secondary-content">
        <div class="search-tabs">
          <button
            class={`search-tab${searchMode.value === 'podcast' ? ' active' : ''}`}
            onClick={() => {
              searchMode.value = 'podcast';
              results.value = [];
              errorText.value = '';
            }}
          >
            {t('search.tabPodcast')}
          </button>
          <button
            class={`search-tab${searchMode.value === 'episode' ? ' active' : ''}`}
            onClick={() => {
              searchMode.value = 'episode';
              episodeResults.value = [];
              episodeErrorText.value = '';
            }}
          >
            {t('search.tabEpisode')}
          </button>
        </div>

        {showHistory.value && searchHistory.value.length > 0 && (
          <div class="search-history">
            <div class="search-history-header">
              <span>{t('search.history')}</span>
              <button class="search-history-clear" onClick={handleClearHistory}>
                {t('search.clear')}
              </button>
            </div>
            <div id="searchHistoryTags">
              {searchHistory.value.map((q) => (
                <span
                  class="search-history-tag"
                  key={q}
                  onClick={() => handleHistoryClick(q)}
                >
                  {q}
                </span>
              ))}
            </div>
          </div>
        )}

        <div id="searchResults" class="result-list">
          {loading.value && <div class="loading">…</div>}

          {/* Podcast (iTunes) tab */}
          {searchMode.value === 'podcast' && !loading.value && errorText.value && (
            <div class="empty-state">{errorText.value}</div>
          )}
          {searchMode.value === 'podcast' &&
            !loading.value &&
            results.value.map((item, i) => {
              const subbed = isSubscribed(item.id || '');
              const isExternal =
                item.id?.startsWith('ext-') || item.id?.startsWith('opml-');
              return (
                <div
                  class="podcast-item animate-in"
                  key={item.id || i}
                  style={`animation-delay:${Math.min(i, 8) * 30}ms`}
                  onClick={() => openPodcast(item)}
                >
                  <div class="cover-img podcast-cover">
                    {item.coverUrl && (
                      <img
                        src={item.coverUrl}
                        alt=""
                        onLoad={handleImgLoad}
                      />
                    )}
                  </div>
                  <div class="podcast-info">
                    <div class="podcast-name">{item.title}</div>
                    <div class="podcast-desc">
                      {item.description || item.author || ''}
                    </div>
                  </div>
                  <button
                    class={`subscribe-btn${subbed ? ' subscribed' : ''}`}
                    onClick={(e: Event) => {
                      e.stopPropagation();
                      toggleSubscribe(item);
                    }}
                  >
                    {subbed ? t('detail.subscribed') : t('detail.subscribe')}
                  </button>
                </div>
              );
            })}

          {/* Episode (local) tab */}
          {searchMode.value === 'episode' && !loading.value && episodeErrorText.value && (
            <div class="empty-state">{episodeErrorText.value}</div>
          )}
          {searchMode.value === 'episode' &&
            !loading.value &&
            episodeResults.value.map((ep, i) => (
              <div
                class="episode-search-item animate-in"
                key={ep.id || ep.eid || i}
                style={`animation-delay:${Math.min(i, 8) * 30}ms`}
                onClick={() =>
                  handleEpisodeRowClick(ep, { podcast: { id: ep.podcastId, title: ep.podcastName } as any })
                }
              >
                <div class="episode-search-title">{ep.title}</div>
                <div class="episode-search-meta">
                  {ep.podcastName || ''}
                  {ep.pubDate ? ` · ${formatRelativeDate(ep.pubDate, t)}` : ''}
                  {ep.duration ? ` · ${formatDuration(ep.duration)}` : ''}
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
