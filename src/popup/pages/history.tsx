import { useEffect, useRef } from 'preact/hooks';
import { signal } from '@preact/signals';
import { MSG, sendMessage } from '../../lib/messaging';
import { t } from '../../lib/i18n';
import { handleImgLoad } from '../lib/cover';
import { BackButton } from '../components/BackButton';
import { toEpisodeView } from '../lib/normalize';
import { formatTime, formatDuration } from '../../lib/utils';
import { dispatchClosePage } from '../lib/dom-events';
import { handleEpisodeRowClick } from '../lib/play-decision';
import { currentPage, playbackState } from '../state';
import type { Episode } from '../state';

interface HistoryEntry {
  episode: Episode;
  podcastName?: string;
  listenedDuration?: number;
  timestamp?: number;
  lastPosition?: number;
  duration?: number;
}

interface RawHistoryEntry {
  eid?: string;
  id?: string;
  title?: string;
  podcastId?: string;
  podcastName?: string;
  coverUrl?: string;
  duration?: number;
  audioUrl?: string;
  feedUrl?: string;
  listenedDuration?: number;
  lastPosition?: number;
  playedAt?: number;
  lastPlayedAt?: number;
}

const historyItems = signal<HistoryEntry[]>([]);
const loading = signal(true);

// Convert raw history entry to HistoryEntry format
function normalizeHistoryEntry(raw: any): HistoryEntry {
  // If already in HistoryEntry format (has episode object)
  if (raw.episode) {
    return raw as HistoryEntry;
  }
  // Otherwise convert from flat structure (episode via shared toEpisodeView,
  // plus history-specific wrapper fields).
  return {
    episode: toEpisodeView(raw),
    podcastName: raw.podcastName || '',
    listenedDuration: raw.listenedDuration || 0,
    timestamp: raw.lastPlayedAt || raw.playedAt || 0,
    lastPosition: raw.lastPosition || 0,
    duration: raw.duration || 0,
  };
}


function groupByDate(items: HistoryEntry[]): { label: string; items: HistoryEntry[] }[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;

  const groups: { label: string; items: HistoryEntry[] }[] = [
    { label: t('history.today'), items: [] },
    { label: t('history.yesterday'), items: [] },
    { label: t('history.earlier'), items: [] },
  ];

  for (const item of items) {
    const ts = item.timestamp || 0;
    if (ts >= todayStart) {
      groups[0].items.push(item);
    } else if (ts >= yesterdayStart) {
      groups[1].items.push(item);
    } else {
      groups[2].items.push(item);
    }
  }

  return groups.filter((g) => g.items.length > 0);
}

function handlePlay(entry: HistoryEntry) {
  // Row click = smart toggle, via the unified play-episode path. lastPosition
  // lives on entry.episode and is restored through resumeTime in app.tsx
  // handlePlayEpisode — no more special-case play-resume here.
  handleEpisodeRowClick(entry.episode, {});
}

function handleRemove(e: Event, index: number) {
  e.stopPropagation();
  const el = (e.currentTarget as HTMLElement).closest('.history-item') as HTMLElement;
  if (el) el.classList.add('removing');
  const entry = historyItems.value[index];
  setTimeout(() => {
    historyItems.value = historyItems.value.filter((_, i) => i !== index);
    if (entry?.episode?.id || entry?.episode?.eid) {
      sendMessage(MSG.PLAY_HISTORY_REMOVE, { episodeId: entry.episode.id || entry.episode.eid });
    }
  }, 250);
}

function handleClearAll() {
  historyItems.value = [];
  sendMessage(MSG.PLAY_HISTORY_CLEAR);
}

export function HistoryPage() {
  const visible = currentPage.value === 'history';
  // Remember the last live playback position per episode so that when an
  // episode stops being "current" (user switches to another), the progress
  // bar doesn't jump back to the stale persisted value.
  const livePosRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!visible) return;
    loading.value = true;
    sendMessage<any[]>(MSG.GET_PLAY_HISTORY).then((data) => {
      historyItems.value = (data || []).map(normalizeHistoryEntry);
      loading.value = false;
    });
  }, [visible]);

  const groups = groupByDate(historyItems.value);

  return (
    <div class={`secondary-page${visible ? ' visible' : ''}`}>
      <div class="secondary-header">
        <BackButton onBack={dispatchClosePage} />
        <div class="secondary-title">{t('history.title')}</div>
        {historyItems.value.length > 0 && (
          <button class="secondary-action" onClick={handleClearAll}>{t('history.clearAll')}</button>
        )}
      </div>
      <div class="secondary-content">
        {loading.value ? (
          <div class="loading">...</div>
        ) : historyItems.value.length === 0 ? (
          <div class="empty-state">{t('history.empty')}</div>
        ) : (
          groups.map((group) => (
            <div class="history-group">
              <div class="history-group-title">{group.label}</div>
              {group.items.map((entry, gi) => {
                const globalIndex = historyItems.value.indexOf(entry);
                const duration = entry.duration || entry.episode?.duration || 0;
                // Use live playback position for the currently playing episode
                // instead of the stale persisted value. While the new track is
                // still loading (currentTime=0 before metadata), fall back to
                // the stored resume position so the bar doesn't flash to zero.
                const ps = playbackState.value;
                const epId = entry.episode?.id || entry.episode?.eid;
                const psId = ps?.episode?.id || ps?.episode?.eid;
                const isCurrent = ps?.episode && epId && psId && epId === psId;
                const isLoading = isCurrent && ps.loading;
                const storedPos = entry.lastPosition || entry.episode?.lastPosition || 0;
                const livePos = isCurrent && !isLoading ? (ps.currentTime || 0) : 0;
                if (isCurrent && !isLoading && livePos > 0) {
                  livePosRef.current.set(epId!, livePos);
                }
                const position = isCurrent
                  ? (isLoading ? (livePosRef.current.get(epId!) ?? storedPos) : livePos)
                  : (epId && livePosRef.current.has(epId) ? livePosRef.current.get(epId)! : storedPos);
                const listenedDur = entry.listenedDuration || 0;
                const progress = duration > 0 ? Math.min((position / duration) * 100, 100) : 0;
                const coverUrl = entry.episode?.coverUrl;
                const title = entry.episode?.title || '';
                const podcastName = entry.podcastName || entry.episode?.podcastName || entry.episode?.podcastTitle || '';

                return (
                  <div class="history-item" onClick={() => handlePlay(entry)}>
                    <div class="history-cover cover-img">
                      {coverUrl && <img src={coverUrl} onLoad={handleImgLoad} />}
                    </div>
                    <div class="history-info">
                      <div class="history-title">{title}</div>
                      <div class="history-podcast">{podcastName}</div>
                      {duration > 0 && (
                        <div class="history-progress-bar">
                          <div class="history-progress-fill" style={`width:${progress}%`} />
                        </div>
                      )}
                      <div class="history-podcast">
                        {listenedDur > 0 ? formatDuration(listenedDur) : formatTime(position)}
                      </div>
                    </div>
                    <button class="history-play-btn" onClick={(e) => handleRemove(e, globalIndex)}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
