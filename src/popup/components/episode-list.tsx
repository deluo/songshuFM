import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { MSG, sendMessage } from '../../lib/messaging';
import { t } from '../../lib/i18n';
import { formatRelativeDate, formatDuration } from '../../lib/utils';
import { favoritesRefreshTick, playbackState } from '../state';
import type { Episode, Podcast } from '../state';
import { handleEpisodeRowClick, isSameEpisode } from '../lib/play-decision';

interface EpisodeListProps {
  episodes: Episode[];
  podcast: Podcast | null;
}

const favSet = signal<Set<string>>(new Set());

// Episode ids the user has already interacted with in the current view. We use
// this to clear the unread dot optimistically on click: marking a podcast read
// updates the persisted lastReadPubDate watermark, but the detail page doesn't
// refetch on click, so without this the dot would linger until the next visit.
const touchedUnread = signal<Set<string>>(new Set());

function checkFavorite(episodeId: string) {
  return favSet.value.has(episodeId);
}

async function toggleFavorite(episodeId: string, episode: Episode, podcast: Podcast | null) {
  const isFav = checkFavorite(episodeId);
  if (isFav) {
    await sendMessage(MSG.FAVORITE_REMOVE, { episodeId });
    const next = new Set(favSet.value);
    next.delete(episodeId);
    favSet.value = next;
  } else {
    await sendMessage(MSG.FAVORITE_ADD, {
      episode: {
        id: episode.id,
        title: episode.title,
        podcastId: podcast?.id || episode.podcastId || '',
        podcastName: podcast?.title || episode.podcastName || '',
        coverUrl: episode.coverUrl || podcast?.coverUrl || '',
        duration: episode.duration || 0,
        audioUrl: episode.audioUrl || '',
        url: episode.url || '',
      },
    });
    const next = new Set(favSet.value);
    next.add(episodeId);
    favSet.value = next;
  }
  // Notify the Favorites page (and any other listener) to refresh.
  favoritesRefreshTick.value++;
}

export function EpisodeList({ episodes, podcast }: EpisodeListProps) {
  // Reset the optimistic unread set when the list itself changes (different
  // podcast / refresh), so stale ids don't accumulate across views.
  useEffect(() => {
    touchedUnread.value = new Set();
  }, [episodes]);

  useEffect(() => {
    if (!episodes.length) return;
    Promise.all(
      episodes.map((ep) =>
        sendMessage<{ isFavorite?: boolean }>(MSG.FAVORITE_CHECK, {
          episodeId: ep.id,
        }).then((r) => (r?.isFavorite ? ep.id : null)),
      ),
    ).then((ids) => {
      const next = new Set(favSet.value);
      for (const id of ids) if (id) next.add(id);
      favSet.value = next;
    });
  }, [episodes]);

  if (!episodes || episodes.length === 0) {
    return <div class="empty-state">{t('search.noResults')}</div>;
  }

  return (
    <div class="episode-list">
      {episodes.map((ep) => {
        const isFav = checkFavorite(ep.id || '');
        const current = playbackState.value?.episode ?? null;
        const isCurrent = isSameEpisode(ep, current);
        const isPlaying = isCurrent && playbackState.value?.playing;
        const isNew = !!ep.isNew && !touchedUnread.value.has(ep.id || '');
        const markRead = () => {
          if (!isNew) return;
          const next = new Set(touchedUnread.value);
          next.add(ep.id || '');
          touchedUnread.value = next;
        };
          return (
            <div class={`episode-item${isNew ? ' episode-item--unread' : ''}${isCurrent ? ' episode-item--playing' : ''}`} key={ep.id}>
              <div
                class="episode-play-icon"
                onClick={(e: Event) => {
                  e.stopPropagation();
                  // ▶ icon = explicit play. Always load-and-play, even on the
                  // current episode; pausing belongs to the player controls.
                  markRead();
                  if (podcast?.id) sendMessage(MSG.MARK_PODCAST_READ, { podcastId: podcast.id, pubDate: ep.pubDate }).catch(() => {});
                  document.dispatchEvent(
                    new CustomEvent('play-episode', {
                      detail: { episode: ep, podcast, autoPlay: true },
                    }),
                  );
                }}
              >
              {isPlaying ? (
                <svg viewBox="0 0 24 24" width="14" height="14" fill="white"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" width="14" height="14" fill="white"><polygon points="5 3 19 12 5 21 5 3" /></svg>
              )}
            </div>
              <div
                class="episode-info"
                onClick={() => {
                  markRead();
                  if (podcast?.id) sendMessage(MSG.MARK_PODCAST_READ, { podcastId: podcast.id, pubDate: ep.pubDate }).catch(() => {});
                  // Row click = smart toggle (pause/resume current, else play).
                  handleEpisodeRowClick(ep, { podcast });
                }}
              >
              <div class="episode-title">{ep.title}</div>
              <div class="episode-meta">
                {formatRelativeDate(ep.pubDate, t)}
                {ep.duration ? ` · ${formatDuration(ep.duration)}` : ''}
              </div>
            </div>
            <button
              class={`episode-fav-btn${isFav ? ' favorited' : ''}`}
              onClick={(e: Event) => {
                e.stopPropagation();
                if (ep.id) toggleFavorite(ep.id, ep, podcast);
              }}
            >
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill={isFav ? 'currentColor' : 'none'}
                stroke="currentColor"
                stroke-width="1.8"
              >
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
