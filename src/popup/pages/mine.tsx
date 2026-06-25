import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { MSG, sendMessage } from '../../lib/messaging';
import { t, setLocale, getLocale } from '../../lib/i18n';
import { handleImgLoad } from '../lib/cover';
import { applyTheme } from '../../lib/theme';
import { currentTab, settings, subscriptions, mineRefreshTick, webdavSyncTick, PLAYBACK_SPEEDS } from '../state';
import type { Podcast, Settings } from '../state';
import { CustomSelect } from '../components/custom-select';
import { sortSubs } from '../lib/sub-sort';

const historyCount = signal(0);
const favCount = signal(0);
const webdavConfig = signal({ enabled: false, serverUrl: '', username: '', password: '' });
const webdavStatus = signal('');
const webdavError = signal(false);
const syncing = signal(false);
const conflictVisible = signal(false);
const syncMode = signal<'merge' | 'download' | 'upload'>('merge');

function dispatch(name: string, detail?: any) {
  document.dispatchEvent(new CustomEvent(name, { bubbles: true, detail }));
}



async function loadData() {
  try {
    const [subs, history, favorites] = await Promise.all([
      sendMessage<Podcast[]>(MSG.GET_SUBSCRIPTIONS),
      sendMessage(MSG.GET_PLAY_HISTORY),
      sendMessage(MSG.FAVORITE_GET_ALL),
    ]);
    if (subs) subscriptions.value = Array.isArray(subs) ? subs : [];
    historyCount.value = Array.isArray(history) ? history.length : 0;
    favCount.value = Array.isArray(favorites) ? favorites.length : 0;

    await loadWebDAVConfig();
  } catch {
    // ignore
  }
}

async function loadWebDAVConfig() {
  const config = await sendMessage(MSG.WEBDAV_CONFIG_GET, {});
  webdavConfig.value = {
    enabled: !!config.enabled,
    serverUrl: config.serverUrl || '',
    username: config.username || '',
    password: config.password || '',
  };
  await updateWebDAVStatus();
}

async function updateWebDAVStatus() {
  const status = await sendMessage(MSG.WEBDAV_STATUS, {});
  if (!status || status.error) {
    webdavStatus.value = status?.error || '\u2014';
    webdavError.value = true;
    return;
  }
  if (status.lastSyncStatus === 'error') {
    const time = status.lastFailedAt ? new Date(status.lastFailedAt).toLocaleString() : '';
    const reason = status.lastSyncError || '';
    webdavStatus.value = time + (time && reason ? ' ' : '') + reason;
    webdavError.value = true;
  } else if (status.lastSyncAt) {
    webdavStatus.value = new Date(status.lastSyncAt).toLocaleString();
    webdavError.value = false;
  } else {
    webdavStatus.value = '\u2014';
    webdavError.value = false;
  }
}

function saveWebDAVConfig() {
  sendMessage(MSG.WEBDAV_CONFIG_SET, { config: webdavConfig.value });
}

function handleSettingChange(key: keyof Settings, value: any) {
  const s = { ...settings.value, [key]: value };
  settings.value = s;
  sendMessage(MSG.UPDATE_SETTINGS, { settings: { [key]: value } });
}

async function handleSyncClick() {
  if (syncing.value) return;
  saveWebDAVConfig();

  syncing.value = true;
  const checkResult = await sendMessage(MSG.WEBDAV_SYNC_NOW, { mode: 'check' });
  syncing.value = false;

  if (checkResult?.error) {
    webdavStatus.value = t('settings.syncFailed') + ': ' + checkResult.error;
    webdavError.value = true;
    return;
  }

  if (checkResult?.conflict) {
    conflictVisible.value = true;
    return;
  }

  await executeSync(checkResult?.autoMode || 'merge');
}

async function executeSync(mode: 'merge' | 'download' | 'upload') {
  if (syncing.value) return;
  conflictVisible.value = false;

  syncing.value = true;
  const result = await sendMessage(MSG.WEBDAV_SYNC_NOW, { mode });
  syncing.value = false;

  if (result?.success) {
    webdavStatus.value = t('settings.syncSuccess') + ' ' + new Date().toLocaleString();
    webdavError.value = false;
  } else {
    webdavStatus.value = t('settings.syncFailed') + (result?.error ? ': ' + result.error : '');
    webdavError.value = true;
  }
}

function QuickGrid() {
  return (
    <div class="quick-grid">
      <div class="quick-cell" onClick={() => dispatch('open-page', { page: 'history' })}>
        <div class="quick-cell-icon purple">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
        </div>
        <div class="quick-cell-text">
          <div class="quick-cell-title">{t('mine.history')}</div>
          <div class="quick-cell-count">{t('mine.historyCount', { count: historyCount.value })}</div>
        </div>
      </div>
      <div class="quick-cell" onClick={() => dispatch('open-page', { page: 'favorites' })}>
        <div class="quick-cell-icon red">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
        </div>
        <div class="quick-cell-text">
          <div class="quick-cell-title">{t('mine.favorites')}</div>
          <div class="quick-cell-count">{t('mine.favCount', { count: favCount.value })}</div>
        </div>
      </div>
      <div class="quick-cell" onClick={() => dispatch('open-page', { page: 'subMgmt' })}>
        <div class="quick-cell-icon green">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
        </div>
        <div class="quick-cell-text">
          <div class="quick-cell-title">{t('mine.subscriptions')}</div>
          <div class="quick-cell-count">{t('mine.subCount', { count: subscriptions.value.length })}</div>
        </div>
      </div>
      <div class="quick-cell" onClick={() => dispatch('open-page', { page: 'stats' })}>
        <div class="quick-cell-icon blue">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 20V10" /><path d="M12 20V4" /><path d="M6 20v-6" /></svg>
        </div>
        <div class="quick-cell-text">
          <div class="quick-cell-title">{t('mine.stats')}</div>
        </div>
      </div>
    </div>
  );
}

function SubList() {
  const subs = sortSubs(subscriptions.value).slice(0, 6);
  if (subs.length === 0) {
    return <div class="empty-state">{t('mine.empty')}</div>;
  }
  return (
    <div>
      {subs.map((sub, i) => (
        <div
          class="mine-sub-item"
          style={`animation-delay:${Math.min(i, 8) * 30}ms`}
          onClick={() => dispatch('open-podcast', { id: sub.id, title: sub.name || sub.title, coverUrl: sub.coverUrl || null, feedUrl: sub.feedUrl || null })}
        >
          <div class="cover-img mine-sub-cover">
            <img src={sub.coverUrl || ''} alt="" onLoad={handleImgLoad} />
          </div>
          <div class="mine-sub-info">
            <div class="mine-sub-name">{sub.name || sub.title}</div>
            <div class="mine-sub-meta">{sub.episodeCount ? sub.episodeCount + ' ' + t('detail.episodeCount') : ''}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SettingsCard() {
  const s = settings.value;
  const currentTheme = s.theme || 'system';
  const currentLocale = getLocale();
  const currentSpeed = s.defaultSpeed || 1;
  const currentPanelMode = s.panelMode || 'sidepanel';

  return (
    <div class="settings-card">
      <div class="setting-row">
        <div class="setting-icon">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="15" y1="3" x2="15" y2="21" /></svg>
        </div>
        <span class="setting-label">{t('settings.panelMode')}</span>
        <CustomSelect
          value={currentPanelMode}
          onChange={(val) => { handleSettingChange('panelMode', val); }}
          options={[
            { value: 'sidepanel', label: t('settings.panelMode.sidepanel') },
            { value: 'popup', label: t('settings.panelMode.popup') },
          ]}
        />
      </div>

      <div class="setting-row">
        <div class="setting-icon">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>
        </div>
        <span class="setting-label">{t('settings.theme')}</span>
        <CustomSelect
          value={currentTheme}
          onChange={(val) => { handleSettingChange('theme', val); applyTheme(val); }}
          options={[
            { value: 'light', label: t('settings.theme.light') },
            { value: 'dark', label: t('settings.theme.dark') },
            { value: 'system', label: t('settings.theme.system') },
          ]}
        />
      </div>

      <div class="setting-row">
        <div class="setting-icon">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5h7l2 3h11v11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5z" /></svg>
        </div>
        <span class="setting-label">{t('settings.language')}</span>
        <CustomSelect
          value={currentLocale}
          onChange={async (val) => {
            handleSettingChange('locale', val);
            await setLocale(val);
          }}
          options={[
            { value: 'zh', label: t('settings.language.zh') },
            { value: 'en', label: t('settings.language.en') },
          ]}
        />
      </div>

      <div class="setting-row">
        <div class="setting-icon">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V10" /><path d="M18 20V4" /><path d="M6 20v-4" /></svg>
        </div>
        <span class="setting-label">{t('settings.defaultSpeed')}</span>
        <CustomSelect
          value={String(currentSpeed)}
          onChange={(val) => { handleSettingChange('defaultSpeed', parseFloat(val)); }}
          options={PLAYBACK_SPEEDS.map(s => ({ value: String(s), label: s + 'x' }))}
        />
      </div>

      <div class="setting-row">
        <div class="setting-icon">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
        </div>
        <span class="setting-label">{t('settings.notifications')}</span>
        <label class="toggle">
          <input
            type="checkbox"
            checked={s.notificationsEnabled !== false}
            onChange={(e) => {
              handleSettingChange('notificationsEnabled', (e.target as HTMLInputElement).checked);
            }}
          />
          <span class="toggle-slider"></span>
        </label>
      </div>

      <div class="setting-row">
        <div class="setting-icon">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3" /></svg>
        </div>
        <span class="setting-label">{t('settings.autoPlay')}</span>
        <label class="toggle">
          <input
            type="checkbox"
            checked={s.autoPlayNext !== false}
            onChange={(e) => {
              handleSettingChange('autoPlayNext', (e.target as HTMLInputElement).checked);
            }}
          />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>
  );
}

function WebDAVSection() {
  const cfg = webdavConfig.value;

  return (
    <div class="settings-card" id="webdavSettingsCard">
      <div class="setting-row">
        <span>{t('settings.enableSync')}</span>
        <label class="toggle">
          <input
            type="checkbox"
            checked={cfg.enabled}
            onChange={(e) => {
              webdavConfig.value = { ...cfg, enabled: (e.target as HTMLInputElement).checked };
              saveWebDAVConfig();
            }}
          />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="setting-row" style="flex-direction:column;align-items:stretch;gap:4px;">
        <input
          type="text"
          placeholder="https://dav.jianguoyun.com/dav/"
          class="webdav-input"
          value={cfg.serverUrl}
          onInput={(e) => {
            webdavConfig.value = { ...cfg, serverUrl: (e.target as HTMLInputElement).value };
            saveWebDAVConfig();
          }}
        />
        <input
          type="text"
          placeholder={t('settings.webdavUsername') || '\u7528\u6237\u540d'}
          class="webdav-input"
          value={cfg.username}
          onInput={(e) => {
            webdavConfig.value = { ...cfg, username: (e.target as HTMLInputElement).value };
            saveWebDAVConfig();
          }}
        />
        <input
          type="password"
          placeholder={t('settings.webdavPassword') || '\u5e94\u7528\u5bc6\u7801'}
          class="webdav-input"
          value={cfg.password}
          onInput={(e) => {
            webdavConfig.value = { ...cfg, password: (e.target as HTMLInputElement).value };
            saveWebDAVConfig();
          }}
        />
      </div>
      <div class="sync-now-row">
        <button
          class={`sync-now-btn${syncing.value ? ' syncing' : ''}`}
          disabled={syncing.value}
          onClick={handleSyncClick}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6" /><path d="M2.5 22v-6h6" /><path d="M2 11.5a10 10 0 0 1 18.8-4.3L21.5 8" /><path d="M22 12.5a10 10 0 0 1-18.8 4.2L2.5 16" /></svg>
          <span>{syncing.value ? t('settings.syncing') : t('settings.syncNow')}</span>
        </button>
        <span class={`sync-now-status${webdavError.value ? ' sync-error' : ''}`}>
          {webdavStatus.value}
        </span>
      </div>

      {conflictVisible.value && (
        <div class="conflict-panel">
          <div class="conflict-title">{t('settings.conflict.title')}</div>
          <div class="conflict-desc">{t('settings.conflict.desc')}</div>
          <div class="conflict-actions">
            <button class="conflict-btn conflict-remote" onClick={() => executeSync('download')}>
              <span class="conflict-btn-label">{t('settings.conflict.useRemote')}</span>
              <span class="conflict-btn-hint">{t('settings.conflict.useRemoteHint')}</span>
            </button>
            <button class="conflict-btn conflict-local" onClick={() => executeSync('upload')}>
              <span class="conflict-btn-label">{t('settings.conflict.useLocal')}</span>
              <span class="conflict-btn-hint">{t('settings.conflict.useLocalHint')}</span>
            </button>
            <button class="conflict-btn conflict-cancel" onClick={() => { conflictVisible.value = false; }}>
              {t('settings.conflict.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function MinePage() {
  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (currentTab.value === 'mine') {
      loadData();
    }
  }, [currentTab.value]);

  // Another component (e.g. ImportPage) requested a refresh of the
  // subscription list — reload when it happens, regardless of active tab,
  // so the data is fresh by the time the user switches back.
  useEffect(() => {
    if (mineRefreshTick.value === 0) return;
    loadData();
  }, [mineRefreshTick.value]);

  // Background reported that a WebDAV sync just finished — refresh the badge.
  useEffect(() => {
    if (webdavSyncTick.value === 0) return;
    updateWebDAVStatus();
  }, [webdavSyncTick.value]);

  return (
    <div class="tab-panel active">
      <QuickGrid />

      <div class="section-header">
        <span class="section-title">{t('mine.mySubscriptions')}</span>
        <a href="#" class="section-link" onClick={(e) => { e.preventDefault(); dispatch('open-page', { page: 'subMgmt' }); }}>{t('mine.viewAll')}</a>
      </div>
      <SubList />

      <div class="section-header" style="margin-top:12px;">
        <span class="section-title">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" style="vertical-align:-2px;margin-right:4px;"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
          <span>{t('mine.settings')}</span>
        </span>
      </div>
      <SettingsCard />

      <div class="section-header" style="margin-top:12px;">
        <span class="section-title">{t('settings.dataManagement')}</span>
      </div>
      <div class="settings-card">
        <div class="setting-row" style="cursor:pointer;" onClick={() => dispatch('open-page', { page: 'import' })}>
          <span>{t('settings.importSubscriptions')}</span>
          <span class="setting-row-arrow">&#x2197;</span>
        </div>
      </div>

      <div class="section-header" style="margin-top:12px;">
        <span class="section-title">{t('settings.webdavSync')}</span>
      </div>
      <WebDAVSection />
    </div>
  );
}
