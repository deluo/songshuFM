import { useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';
import { MSG, sendMessage } from '../../lib/messaging';
import { t } from '../../lib/i18n';
import { handleImgLoad } from '../lib/cover';
import { BackButton } from '../components/BackButton';
import { currentPage, subscriptions } from '../state';
import type { Podcast } from '../state';
import { dispatchOpenPodcast, dispatchClosePage } from '../lib/dom-events';
import { resolveCover } from '../lib/cover-cache';
import {
  sortKey,
  sortDir,
  saveSortPref,
  sortSubs,
  type SortKey,
} from '../lib/sub-sort';

const confirmUnsubId = signal<string | null>(null);


function handleSortClick(key: SortKey) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = key;
    sortDir.value = key === 'name' ? 'asc' : 'desc';
  }
  saveSortPref();
}

function handleOpenPodcast(sub: Podcast) {
  dispatchOpenPodcast({ id: sub.id || sub.pid || '', feedUrl: sub.feedUrl });
}

function handleUnsubscribe(sub: Podcast) {
  const id = sub.id || sub.pid || '';
  if (confirmUnsubId.value === id) {
    sendMessage(MSG.UNSUBSCRIBE, { podcastId: id });
    subscriptions.value = subscriptions.value.filter(
      (s) => (s.id || s.pid) !== id,
    );
    confirmUnsubId.value = null;
  } else {
    confirmUnsubId.value = id;
    setTimeout(() => {
      if (confirmUnsubId.value === id) confirmUnsubId.value = null;
    }, 3000);
  }
}

const sortOptions: { key: SortKey; labelKey: string }[] = [
  { key: 'subscribedAt', labelKey: 'submgmt.sort.subscribedAt' },
  { key: 'name', labelKey: 'submgmt.sort.name' },
  { key: 'episodeCount', labelKey: 'submgmt.sort.episodeCount' },
  { key: 'updatedAt', labelKey: 'submgmt.sort.updatedAt' },
];

export function SubMgmtPage() {
  const visible = currentPage.value === 'subMgmt';

  useEffect(() => {
    if (!visible) return;
    sendMessage(MSG.GET_SUBSCRIPTIONS).then((subs) => {
      if (subs) subscriptions.value = subs;
    });
  }, [visible]);

  const sorted = sortSubs(subscriptions.value);

  return (
    <div class={`secondary-page${visible ? ' visible' : ''}`}>
      <div class="secondary-header">
        <BackButton onBack={dispatchClosePage} />
        <div class="secondary-title">{t('submgmt.title')}</div>
      </div>
      <div class="sort-toolbar">
        {sortOptions.map((opt) => (
          <button
            class={`sort-chip${sortKey.value === opt.key ? ' active' : ''}`}
            onClick={() => handleSortClick(opt.key)}
          >
            {t(opt.labelKey)}
            {sortKey.value === opt.key && (
              <span class={`sort-arrow${sortDir.value === 'desc' ? ' desc' : ''}`}>▲</span>
            )}
          </button>
        ))}
      </div>
      <div class="secondary-content">
        {sorted.length === 0 ? (
          <div class="empty-state">{t('submgmt.empty')}</div>
        ) : (
          sorted.map((sub) => {
            const id = sub.id || sub.pid || '';
            const name = sub.title || sub.name || '';
            const coverUrl = resolveCover(id, sub.coverUrl);
            const epCount = sub.episodeCount || 0;
            const isConfirming = confirmUnsubId.value === id;

            return (
              <div class="sub-mgmt-item" onClick={() => handleOpenPodcast(sub)}>
                <div class="sub-mgmt-cover cover-img">
                  {coverUrl && <img src={coverUrl} onLoad={handleImgLoad} />}
                </div>
                <div class="sub-mgmt-info">
                  <div class="sub-mgmt-name">{name}</div>
                  <div class="sub-mgmt-meta">{epCount} {t('detail.episodeCount')}</div>
                </div>
                <button class="sub-mgmt-unsub" onClick={(e) => { e.stopPropagation(); handleUnsubscribe(sub); }}>
                  {isConfirming ? (
                    <span class="sub-mgmt-unsub-label">{t('common.confirmRemove')}</span>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  )}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
