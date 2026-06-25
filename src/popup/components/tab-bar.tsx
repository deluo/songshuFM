import { currentTab } from '../state';
import { t, localeLoaded } from '../../lib/i18n';

export function TabBar() {
  localeLoaded.value; // subscribe so TabBar re-renders when translations load
  return (
    <div class="tab-bar">
      <button
        class={`tab${currentTab.value === 'home' ? ' active' : ''}`}
        onClick={() => { currentTab.value = 'home'; }}
      >
        {t('tab.home')}
      </button>
      <button
        class={`tab${currentTab.value === 'mine' ? ' active' : ''}`}
        onClick={() => { currentTab.value = 'mine'; }}
      >
        {t('tab.mine')}
      </button>
    </div>
  );
}
