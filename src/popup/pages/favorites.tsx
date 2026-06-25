import { useEffect, useMemo } from 'preact/hooks';
import { memo } from 'preact/compat';
import { signal, computed } from '@preact/signals';
import { MSG, sendMessage } from '../../lib/messaging';
import { t } from '../../lib/i18n';
import { handleImgLoad } from '../lib/cover';
import { BackButton } from '../components/BackButton';
import { ConfirmButton } from '../components/ConfirmButton';
import { toEpisodeView } from '../lib/normalize';
import { dispatchClosePage } from '../lib/dom-events';
import { handleEpisodeRowClick } from '../lib/play-decision';
import { currentPage, currentPodcastId, currentFeedUrl, favoritesRefreshTick } from '../state';
import type { Episode } from '../state';

interface FavEntry {
  episode: Episode;
  podcastName?: string;
  addedAt?: number;
}

interface RawFavEntry {
  eid?: string;
  id?: string;
  title?: string;
  podcastId?: string;
  podcastName?: string;
  coverUrl?: string;
  duration?: number;
  audioUrl?: string;
  feedUrl?: string;
  favoritedAt?: number;
}

interface PodcastGroup {
  podcastId: string;
  podcastName: string;
  coverUrl?: string;
  items: FavEntry[];
}

// Convert raw favorite entry to FavEntry format
function normalizeFavEntry(raw: any): FavEntry {
  // If already in FavEntry format (has episode object)
  if (raw.episode) {
    return raw as FavEntry;
  }
  // Otherwise convert from flat structure (episode via shared toEpisodeView,
  // plus favorites-specific wrapper fields).
  return {
    episode: toEpisodeView(raw),
    podcastName: raw.podcastName || '',
    addedAt: raw.favoritedAt || raw.addedAt || 0,
  };
}

// View mode: 'tree' or 'list'
const viewMode = signal<'tree' | 'list'>('tree');

// Data
const favItems = signal<FavEntry[]>([]);
const loading = signal(true);

// Expanded podcasts in tree view
const expandedPodcasts = signal<Set<string>>(new Set());

// Load saved view mode from localStorage
function loadViewMode(): 'tree' | 'list' {
  try {
    const saved = localStorage.getItem('favViewMode');
    return saved === 'list' ? 'list' : 'tree';
  } catch {
    return 'tree';
  }
}

// Save view mode to localStorage
function saveViewMode(mode: 'tree' | 'list') {
  try {
    localStorage.setItem('favViewMode', mode);
  } catch {}
}

// Group favorites by podcast. Falls back to the podcast name (and ultimately a
// shared "unknown" bucket) when an entry has no podcastId, so that episodes
// from different podcasts don't all collapse into one group.
function groupByPodcast(items: FavEntry[]): PodcastGroup[] {
  const groups = new Map<string, PodcastGroup>();

  for (const item of items) {
    const podcastName = item.podcastName || item.episode?.podcastName || item.episode?.podcastTitle || '';
    // Prefer podcastId; fall back to the name so untitled-id entries still
    // group by show instead of all merging together.
    const groupKey = item.episode?.podcastId || podcastName || 'unknown';
    const displayName = podcastName || t('favorites.unknownPodcast');

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        podcastId: item.episode?.podcastId || groupKey,
        podcastName: displayName,
        coverUrl: item.episode?.coverUrl,
        items: [],
      });
    }
    groups.get(groupKey)!.items.push(item);
  }

  return Array.from(groups.values());
}

// Find global index of an item
function findGlobalIndex(items: FavEntry[], target: FavEntry): number {
  return items.findIndex(item =>
    item.episode?.id === target.episode?.id ||
    item.episode?.eid === target.episode?.eid
  );
}

function handlePlay(entry: FavEntry) {
  const episode = entry.episode;
  // Row click = smart toggle. Podcast context is rebuilt by app.tsx when the
  // action is play-new; toggling the current episode needs no podcast info.
  const podcast = episode?.podcastId
    ? { id: episode.podcastId, title: entry.podcastName }
    : null;
  handleEpisodeRowClick(episode, { podcast });
}

function handlePodcastClick(podcastId: string) {
  currentPodcastId.value = podcastId;
  currentFeedUrl.value = null;
  currentPage.value = 'podcastDetail';
}

function toggleExpand(podcastId: string) {
  const expanded = new Set(expandedPodcasts.value);
  if (expanded.has(podcastId)) {
    expanded.delete(podcastId);
  } else {
    expanded.add(podcastId);
  }
  expandedPodcasts.value = expanded;
}

function toggleViewMode() {
  const newMode = viewMode.value === 'tree' ? 'list' : 'tree';
  viewMode.value = newMode;
  saveViewMode(newMode);
}

// Called by ConfirmButton's onConfirm after the user confirms. Plays the exit
// animation on the row, then removes the favorite and persists the change.
function doRemove(e: Event, index: number) {
  const entry = favItems.value[index];
  if (!entry) return;
  const btn = e.currentTarget as HTMLElement;
  const el = btn.closest('.fav-item') as HTMLElement | null;
  if (el) el.classList.add('removing');
  setTimeout(() => {
    favItems.value = favItems.value.filter((_, i) => i !== index);
    if (entry?.episode?.id || entry?.episode?.eid) {
      sendMessage(MSG.FAVORITE_REMOVE, { episodeId: entry.episode.id || entry.episode.eid });
    }
  }, 250);
}

// A single podcast group row. memo'd so that toggling one group's expansion
// only re-renders that row — the other rows' props (group + isExpanded) are
// unchanged, so Preact skips them. This is what removes the "first expand is
// janky, second is smooth" hitch: previously every group re-rendered and
// re-ran its VNode diff on every toggle.
const PodcastGroupRow = memo(({ group, isExpanded }: { group: PodcastGroup; isExpanded: boolean }) => {
  return (
    <div class={`podcast-group${isExpanded ? ' expanded' : ''}`} key={group.podcastId}>
      <div
        class="podcast-group-header"
        onClick={() => toggleExpand(group.podcastId)}
        title={t('favorites.toggleGroup')}
      >
        <div class="podcast-group-cover cover-img">
          {group.coverUrl && <img src={group.coverUrl} onLoad={handleImgLoad} />}
        </div>
        <div class="podcast-group-info">
          <div class="podcast-group-name">{group.podcastName}</div>
          <div class="podcast-group-count">
            <span class="podcast-group-count-num">{group.items.length}</span>
            <span class="podcast-group-count-unit">{t('favorites.episodeUnit')}</span>
          </div>
        </div>
        <button
          class="podcast-group-open"
          title={t('favorites.openPodcast')}
          aria-label={t('favorites.openPodcast')}
          onClick={(e) => { e.stopPropagation(); handlePodcastClick(group.podcastId); }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7" /><path d="M8 7h9v9" /></svg>
        </button>
        <div class="podcast-group-arrow">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points={isExpanded ? "6 9 12 15 18 9" : "9 18 15 12 9 6"} />
          </svg>
        </div>
      </div>
      {isExpanded && (
        <div class="podcast-group-items">
          {group.items.map((entry, i) => {
            const title = entry.episode?.title || '';
            return (
              <div
                class="fav-item fav-item--tree"
                key={entry.episode?.id || entry.episode?.eid || i}
                style={`animation-delay:${Math.min(i, 8) * 30}ms`}
                onClick={() => handlePlay(entry)}
              >
                <span class="fav-play-dot" aria-hidden="true">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4" /></svg>
                </span>
                <div class="fav-info">
                  <div class="fav-title">{title}</div>
                </div>
                <ConfirmButton
                  class="fav-remove-btn"
                  title={t('common.remove')}
                  ariaLabel={t('common.remove')}
                  onConfirm={(e) => {
                    const gi = findGlobalIndex(favItems.value, entry);
                    if (gi >= 0) doRemove(e, gi);
                  }}
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </ConfirmButton>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

// Render tree view
function TreeView({ groups }: { groups: PodcastGroup[] }) {
  // Read the expanded set once here and pass isExpanded down as a prop. The
  // memo'd PodcastGroupRow then only re-renders the row whose isExpanded
  // actually flipped; siblings are skipped entirely.
  const expanded = expandedPodcasts.value;
  return (
    <div class="fav-tree-view">
      {groups.map(group => (
        <PodcastGroupRow
          key={group.podcastId}
          group={group}
          isExpanded={expanded.has(group.podcastId)}
        />
      ))}
    </div>
  );
}

// Render list view
function ListView({ items }: { items: FavEntry[] }) {
  return (
    <div class="fav-list-view">
      {items.map((entry, index) => {
        const coverUrl = entry.episode?.coverUrl;
        const title = entry.episode?.title || '';
        const podcastName = entry.podcastName || entry.episode?.podcastName || '';
        return (
          <div
            class="fav-item fav-item--list"
            key={entry.episode?.id || entry.episode?.eid || index}
            style={`animation-delay:${Math.min(index, 10) * 25}ms`}
            onClick={() => handlePlay(entry)}
          >
            <div class="fav-cover cover-img">
              {coverUrl && <img src={coverUrl} onLoad={handleImgLoad} />}
              <span class="fav-cover-play" aria-hidden="true">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4" /></svg>
              </span>
            </div>
            <div class="fav-info">
              <div class="fav-title">{title}</div>
              {podcastName && <div class="fav-podcast">{podcastName}</div>}
            </div>
            <ConfirmButton
              class="fav-remove-btn"
              title={t('common.remove')}
              ariaLabel={t('common.remove')}
              onConfirm={(e) => doRemove(e, index)}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </ConfirmButton>
          </div>
        );
      })}
    </div>
  );
}

export function FavoritesPage() {
  const visible = currentPage.value === 'favorites';

  // Load view mode on mount
  useEffect(() => {
    viewMode.value = loadViewMode();
  }, []);

  // (Re)fetch the favorites list. Called on mount, every time the page becomes
  // visible, and whenever a favorite is toggled anywhere in the app. Keeping
  // this single source fresh prevents the tree/list views from drifting out of
  // sync with the actual favorites store.
  const reloadFavorites = () => {
    loading.value = true;
    sendMessage<any[]>(MSG.FAVORITE_GET_ALL).then((data) => {
      favItems.value = (data || []).map(normalizeFavEntry);
      loading.value = false;
    });
  };

  // Load data when visible
  useEffect(() => {
    if (!visible) return;
    reloadFavorites();
  }, [visible]);

  // A favorite was added/removed elsewhere — refresh even if we're not the
  // active page, so the data is current by the time the user switches back.
  useEffect(() => {
    if (favoritesRefreshTick.value === 0) return;
    reloadFavorites();
  }, [favoritesRefreshTick.value]);

  const items = favItems.value;
  // Memoize the grouping so expanding/collapsing a tree row (which re-runs
  // this component function via the expandedPodcasts signal) doesn't re-walk
  // and re-bucket the whole favorites list every time.
  const groups = useMemo(() => groupByPodcast(items), [items]);

  return (
    <div class={`secondary-page${visible ? ' visible' : ''}`}>
      <div class="secondary-header fav-header">
        <BackButton onBack={dispatchClosePage} />
        <div class="fav-title-block">
          <div class="secondary-title">
            {t('favorites.title')}
          </div>
        </div>
        {items.length > 0 && (
          <div class="view-toggle" role="group">
            <button
              class={`view-toggle-btn${viewMode.value === 'tree' ? ' active' : ''}`}
              onClick={() => { viewMode.value = 'tree'; saveViewMode('tree'); }}
              title={t('favorites.treeView')}
              aria-label={t('favorites.treeView')}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="4.5" width="7" height="3.5" rx="1" /><rect x="3" y="14" width="7" height="3.5" rx="1" /><line x1="13" y1="6.25" x2="21" y2="6.25" /><line x1="13" y1="15.75" x2="21" y2="15.75" /><line x1="6.5" y1="8" x2="6.5" y2="14" />
              </svg>
            </button>
            <button
              class={`view-toggle-btn${viewMode.value === 'list' ? ' active' : ''}`}
              onClick={() => { viewMode.value = 'list'; saveViewMode('list'); }}
              title={t('favorites.listView')}
              aria-label={t('favorites.listView')}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="9" y1="6" x2="21" y2="6" /><line x1="9" y1="12" x2="21" y2="12" /><line x1="9" y1="18" x2="21" y2="18" /><circle cx="4.5" cy="6" r="1.4" /><circle cx="4.5" cy="12" r="1.4" /><circle cx="4.5" cy="18" r="1.4" />
              </svg>
            </button>
          </div>
        )}
      </div>
      <div class="secondary-content">
        {loading.value ? (
          <div class="loading">...</div>
        ) : items.length === 0 ? (
          <div class="empty-state fav-empty">
            <div class="fav-empty-icon">
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
            </div>
            <div class="fav-empty-text">{t('favorites.empty')}</div>
          </div>
        ) : viewMode.value === 'tree' ? (
          <TreeView groups={groups} />
        ) : (
          <ListView items={items} />
        )}
      </div>
    </div>
  );
}
