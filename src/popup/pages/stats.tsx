import { useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';
import { MSG, sendMessage } from '../../lib/messaging';
import { t } from '../../lib/i18n';
import { handleImgLoad } from '../lib/cover';
import { BackButton } from '../components/BackButton';
import { dispatchClosePage } from '../lib/dom-events';
import { formatHoursMinutes } from '../../lib/utils';
import { currentPage } from '../state';

interface StatsData {
  monthlyListenTime?: number;
  activeDays?: number;
  episodeCount?: number;
  podcastRanking?: PodcastRank[];
  monthlyData?: Record<string, number>;
}

interface PodcastRank {
  podcastId?: string;
  podcastName?: string;
  coverUrl?: string;
  duration?: number;
}

// Raw shape returned by STATS_GET / STATS_REBUILD: a map of "YYYY-MM" -> month stats.
type AllStats = Record<string, {
  monthKey?: string;
  totalDuration?: number;
  activeDays?: number;
  episodeCount?: number;
  byPodcast?: Record<string, { name?: string; duration?: number; coverUrl?: string }>;
}>;

const stats = signal<StatsData | null>(null);
// Cache the full month map so the year/month selector can derive any month
// without re-fetching. Mirrors the old popup/pages/stats.js behavior.
const allStats = signal<AllStats>({});
const loading = signal(true);
const selectedYear = signal(new Date().getFullYear());
const selectedMonth = signal(new Date().getMonth() + 1);
const monthGridOpen = signal(false);
const contentFading = signal(false);


const pad2 = (n: number) => String(n).padStart(2, '0');

// Project the cached allStats map into the StatsData view-model for the
// currently selected year/month.
function projectSelected(all: AllStats, year: number, month: number): StatsData {
  const monthKey = `${year}-${pad2(month)}`;
  const entry = all[monthKey] || {};
  const ranking: PodcastRank[] = Object.entries(entry.byPodcast || {})
    .map(([id, data]) => ({
      podcastId: id,
      podcastName: data?.name,
      coverUrl: data?.coverUrl,
      duration: data?.duration || 0,
    }))
    .sort((a, b) => (b.duration || 0) - (a.duration || 0))
    .slice(0, 5);

  // Build a per-month (1..12) presence map for the selected year's grid dots.
  const monthlyData: Record<string, number> = {};
  for (let m = 1; m <= 12; m++) {
    const mk = `${year}-${pad2(m)}`;
    const total = all[mk]?.totalDuration || 0;
    if (total > 0) monthlyData[String(m)] = total;
  }

  return {
    monthlyListenTime: entry.totalDuration || 0,
    activeDays: entry.activeDays || 0,
    episodeCount: entry.episodeCount || 0,
    podcastRanking: ranking,
    monthlyData,
  };
}

async function fetchStats() {
  loading.value = true;
  // STATS_GET takes no args and returns the full month map; rebuild if empty
  // or missing the current month (matches the background contract).
  let all = await sendMessage<AllStats>(MSG.STATS_GET);
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
  if (!all || Object.keys(all).length === 0 || !all[currentMonthKey]) {
    all = await sendMessage<AllStats>(MSG.STATS_REBUILD);
  }
  allStats.value = all || {};
  stats.value = projectSelected(allStats.value, selectedYear.value, selectedMonth.value);
  loading.value = false;
}

// Re-project from cache when only the selection changes (no refetch).
function refreshView() {
  stats.value = projectSelected(allStats.value, selectedYear.value, selectedMonth.value);
}

function handleYearChange(delta: number) {
  contentFading.value = true;
  selectedYear.value += delta;
  monthGridOpen.value = false;
  setTimeout(() => {
    refreshView();
    contentFading.value = false;
  }, 200);
}

function handleMonthClick(month: number) {
  contentFading.value = true;
  selectedMonth.value = month;
  monthGridOpen.value = false;
  setTimeout(() => {
    refreshView();
    contentFading.value = false;
  }, 200);
}

function toggleMonthGrid() {
  monthGridOpen.value = !monthGridOpen.value;
}

function getMedalClass(index: number): string {
  if (index === 0) return 'gold';
  if (index === 1) return 'silver';
  if (index === 2) return 'bronze';
  return '';
}

export function StatsPage() {
  const visible = currentPage.value === 'stats';

  useEffect(() => {
    if (!visible) return;
    fetchStats();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const handler = (e: Event) => {
      if ((e as CustomEvent).detail?.page !== 'stats') return;
    };
    return () => {};
  }, [visible]);

  const ranking = stats.value?.podcastRanking || [];
  const maxDuration = ranking.length > 0 ? Math.max(...ranking.map((r) => r.duration || 0)) : 1;

  return (
    <div class={`secondary-page${visible ? ' visible' : ''}`}>
      <div class="secondary-header">
        <BackButton onBack={dispatchClosePage} />
        <div class="secondary-title">{t('stats.title')}</div>
      </div>

      <div class="stats-date-selector">
        <div class="stats-date-header">
          <button class="year-arrow" onClick={() => handleYearChange(-1)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <div class="stats-date-label" onClick={toggleMonthGrid}>
            {selectedYear.value} {t(`time.month.${selectedMonth.value}`)}
            <span class={`stats-date-toggle${monthGridOpen.value ? ' open' : ''}`}>▼</span>
          </div>
          <button class="year-arrow" onClick={() => handleYearChange(1)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </div>
        <div class={`stats-month-grid-wrap${monthGridOpen.value ? ' open' : ''}`}>
          <div class="stats-month-grid">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
              const hasData = stats.value?.monthlyData?.[`${m}`] != null;
              return (
                <button
                  class={`month-cell${selectedMonth.value === m ? ' active' : ''}`}
                  onClick={() => handleMonthClick(m)}
                >
                  {t(`time.month.${m}`)}
                  {hasData && <span class="data-dot" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div class="secondary-content">
        {loading.value ? (
          <div class="loading">...</div>
        ) : (
          <div class={`stats-content-fade${contentFading.value ? ' fading' : ''}`}>
            <div class="stats-numbers">
              <div class="stats-number-card">
                <div class="stats-number-value">{formatHoursMinutes(stats.value?.monthlyListenTime)}</div>
                <div class="stats-number-label">{t('stats.monthlyListen')}</div>
              </div>
              <div class="stats-number-card">
                <div class="stats-number-value">{stats.value?.activeDays || 0}</div>
                <div class="stats-number-label">{t('stats.activeDays')}</div>
              </div>
              <div class="stats-number-card">
                <div class="stats-number-value">{stats.value?.episodeCount || 0}</div>
                <div class="stats-number-label">{t('stats.episodeCount')}</div>
              </div>
            </div>

            {ranking.length > 0 && (
              <div class="stats-ranking">
                <div class="stats-ranking-title">{t('stats.ranking')}</div>
                {ranking.slice(0, 5).map((item, index) => {
                  const barWidth = maxDuration > 0 ? ((item.duration || 0) / maxDuration) * 100 : 0;
                  return (
                    <div class="stats-rank-item">
                      <div class={`stats-rank-number${getMedalClass(index) ? ' ' + getMedalClass(index) : ''}`}>
                        {index + 1}
                      </div>
                      <div class="stats-rank-cover cover-img">
                        {item.coverUrl && <img src={item.coverUrl} onLoad={handleImgLoad} />}
                      </div>
                      <div class="stats-rank-info">
                        <div class="stats-rank-name">{item.podcastName}</div>
                        <div class="stats-rank-bar-wrap">
                          <div class="stats-rank-bar" style={`width:${barWidth}%`} />
                        </div>
                      </div>
                      <div class="stats-rank-duration">{formatHoursMinutes(item.duration)}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
