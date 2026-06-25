import { playbackState, isExpandedPlayerOpen, subscriptions, miniTitleOverride } from '../state';
import { formatTime } from '../../lib/utils';
import { sendMessage, MSG } from '../../lib/messaging';
import { playAdjacentEpisode } from './expanded-player';
import { t } from '../../lib/i18n';

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

async function handleTogglePlay() {
  const ps = playbackState.value;
  if (!ps?.episode) return;
  await sendMessage(MSG.TOGGLE).catch(() => {});
}

export function MiniPlayer() {
  const ps = playbackState.value;
  if (!ps?.episode) return null;

  const progress = ps.duration > 0 ? (ps.currentTime / ps.duration) * 100 : 0;
  const coverUrl = getCoverUrl(ps.episode);

  return (
    <div class="mini-player" onClick={() => { isExpandedPlayerOpen.value = true; }}>
      <div
        class="mini-progress-bar"
        onClick={(e) => {
          // Seek instead of opening the expanded player when tapping the bar.
          e.stopPropagation();
          const el = e.currentTarget as HTMLDivElement;
          const rect = el.getBoundingClientRect();
          const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          sendMessage(MSG.SEEK, { time: ratio * (ps.duration || 0) }).catch(() => {});
        }}
      >
        <div class="mini-progress-fill" style={`width:${progress}%`} />
      </div>
      <div class="mini-cover cover-img">
        {coverUrl && <img src={coverUrl} onLoad={handleImgLoad} />}
      </div>
      <div class="mini-info">
        <div class="mini-title">{miniTitleOverride.value || ps.episode.title}</div>
        <div class="mini-time">
          {formatTime(ps.currentTime)} / {formatTime(ps.duration)}
        </div>
      </div>
      <button
        class="mini-ctrl"
        onClick={(e) => {
          e.stopPropagation();
          handleTogglePlay();
        }}
      >
        {ps.playing ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
        )}
      </button>
      <button
        class="mini-ctrl"
        title={t('player.next')}
        onClick={(e) => {
          e.stopPropagation();
          playAdjacentEpisode(-1);
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 15 12 5 20 5 4" fill="currentColor" /><line x1="19" y1="5" x2="19" y2="19" /></svg>
      </button>
    </div>
  );
}
