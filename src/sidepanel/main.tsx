import { render } from 'preact';
import { App } from '../popup/app';
import { initLocale } from '../lib/i18n';
import '../popup/styles/popup.css';

// Same bootstrap as src/popup/main.tsx — the side panel renders the identical
// App so all pages (home/mine/search/detail/history/favorites/stats) work
// unchanged. Audio still plays in the offscreen document.
initLocale('zh').finally(() => {
  render(<App />, document.getElementById('app')!);
});
