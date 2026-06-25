import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { MSG, sendMessage } from '../../lib/messaging';
import { t } from '../../lib/i18n';
import { handleImgLoad } from '../lib/cover';
import { useMessage } from '../hooks/use-message';
import { formatTime, formatDuration, formatRelativeDate, escHtml } from '../../lib/utils';
import { playbackState, currentTab } from '../state';
import type { Episode, Podcast } from '../state';
import { resolveCover } from '../lib/cover-cache';
import { handleEpisodeRowClick } from '../lib/play-decision';

interface HomeUpdate {
  podcast: Podcast;
  episodes: Episode[];
}

const homeData = signal<HomeUpdate[] | null>(null);
const historyData = signal<Episode[]>([]);
const loading = signal(true);

function dispatch(name: string, detail?: any) {
  document.dispatchEvent(new CustomEvent(name, { bubbles: true, detail }));
}

async function loadData() {
  loading.value = true;
  try {
    const [homeResult, historyResult] = await Promise.all([
      sendMessage(MSG.GET_HOME_DATA),
      sendMessage(MSG.GET_PLAY_HISTORY),
    ]);
    const updates = homeResult?.updates;
    homeData.value = Array.isArray(updates) ? updates : null;
    historyData.value = Array.isArray(historyResult) ? historyResult : [];
  } catch {
    homeData.value = null;
    historyData.value = [];
  }
  loading.value = false;
}

function ResumeSection() {
  const history = historyData.value;
  if (!history || history.length === 0) return null;

  const latest = history[0];
  const ps = playbackState.value;
  const latestId = latest.id || latest.eid;
  const psId = ps?.episode?.id || ps?.episode?.eid;
  const isSameEpisode = ps?.episode && psId && latestId && psId === latestId;
  const currentTime = isSameEpisode ? (ps.currentTime || 0) : (latest.lastPosition || 0);
  const duration = ps?.duration || latest.duration || 0;
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div>
      <div class="section-header">
        <span class="section-title">{t('home.resume')}</span>
        <a href="#" class="section-link" onClick={(e) => { e.preventDefault(); dispatch('open-page', { page: 'history' }); }}>{t('home.viewAll')}</a>
      </div>
      <div class="resume-card" onClick={() => dispatch('play-resume')}>
        <div class="cover-img resume-cover">
          <img src={latest.coverUrl || ''} alt="" onLoad={handleImgLoad} />
        </div>
        <div class="resume-info">
          <div class="resume-title">{escHtml(latest.title)}</div>
          <div class="resume-meta">{escHtml(latest.podcastName || latest.podcastTitle || '')}</div>
          <div class="resume-progress">
            <div class="resume-progress-fill" style={`width:${progress}%`}></div>
          </div>
          <div class="resume-time">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
        <button class="resume-play" onClick={(e) => { e.stopPropagation(); dispatch('play-resume'); }}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="white"><polygon points="5 3 19 12 5 21 5 3" /></svg>
        </button>
      </div>
    </div>
  );
}

function UpdateCard({ update }: { update: HomeUpdate }) {
  async function handleEpisodeClick(ep: Episode) {
    let episodes = update.episodes;
    const result = await sendMessage(MSG.GET_PODCAST_DETAIL, { podcastId: update.podcast.id, feedUrl: '' });
    if (result?.type === 'podcast' && result.episodes?.length > 0) {
      episodes = result.episodes;
    }
    // Row click = smart toggle; episode list enables prev/next navigation.
    handleEpisodeRowClick(ep, {
      podcast: result?.podcast || update.podcast,
      episodeList: episodes,
    });
  }

  return (
    <div class="update-card">
      <div class="update-card-header">
        <div class="cover-img update-cover">
          <img src={resolveCover(update.podcast?.id, update.podcast?.coverUrl)} alt="" onLoad={handleImgLoad} />
        </div>
        <div class="update-name">
          <div class="update-podcast-name">{escHtml(update.podcast?.title || update.podcast?.name)}</div>
          <div class="update-date">
            {update.episodes[0]?.pubDate ? formatRelativeDate(update.episodes[0].pubDate, t) : ''}
          </div>
        </div>
      </div>
      <div class="update-episodes">
        {update.episodes && Array.isArray(update.episodes) && update.episodes.slice(0, 2).map((ep) => (
          <div class="update-ep-slot">
            <div class="update-ep-row">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="var(--text-tertiary)">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              <div
                class="update-ep-title"
                onClick={() => handleEpisodeClick(ep)}
              >
                {escHtml(ep.title)}
              </div>
            </div>
            <div class="update-ep-meta">
              {formatRelativeDate(ep.pubDate, t) + (ep.duration ? ' · ' + formatDuration(ep.duration) : '')}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function UpdatesSection() {
  const updates = homeData.value;
  const hasHistory = historyData.value.length > 0;

  if (updates && updates.length > 0) {
    return (
      <div>
        <div class="section-header">
          <span class="section-title">{t('home.updates')}</span>
          <a href="#" class="section-link" onClick={(e) => { e.preventDefault(); dispatch('open-page', { page: 'subMgmt' }); }}>{t('home.manageSubs')}</a>
        </div>
        {updates.map((u) => (
          <UpdateCard update={u} />
        ))}
      </div>
    );
  }

  if (!hasHistory) {
    return <div class="empty-state">{t('home.empty')}</div>;
  }

  return (
    <div>
      <div class="section-header">
        <span class="section-title">{t('home.updates')}</span>
        <a href="#" class="section-link" onClick={(e) => { e.preventDefault(); dispatch('open-page', { page: 'subMgmt' }); }}>{t('home.manageSubs')}</a>
      </div>
      <div class="empty-state">{t('home.empty')}</div>
    </div>
  );
}

export function HomePage() {
  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (currentTab.value === 'home') {
      loadData();
    }
  }, [currentTab.value]);

  // Refresh when the background signals new home data (e.g. after fetching
  // feed updates) or when an episode was just played (history-updated).
  useMessage(MSG.HOME_DATA_UPDATE, () => {
    if (currentTab.value === 'home') loadData();
  });
  useEffect(() => {
    const onHistoryUpdated = () => {
      if (currentTab.value === 'home') loadData();
    };
    document.addEventListener('history-updated', onHistoryUpdated);
    return () => document.removeEventListener('history-updated', onHistoryUpdated);
  }, []);

  if (loading.value && !homeData.value && historyData.value.length === 0) {
    return (
      <div class="tab-panel active">
        <div class="empty-state">{t('home.empty')}</div>
      </div>
    );
  }

  return (
    <div class="tab-panel active">
      <div class="search-trigger" onClick={() => dispatch('open-page', { page: 'search' })}>
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="7" />
          <line x1="16.5" y1="16.5" x2="21" y2="21" />
        </svg>
        <span class="search-trigger-text">{t('search.placeholder')}</span>
      </div>

      <ResumeSection />
      <UpdatesSection />
    </div>
  );
}
