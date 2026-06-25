import { render } from 'preact';
import { App } from './app';
import { initLocale } from '../lib/i18n';
import './styles/popup.css';

// Same bootstrap as src/sidepanel/main.tsx — the popup renders the identical
// App so all pages (home/mine/search/detail/history/favorites/stats) work
// unchanged. Audio still plays in the offscreen document.
//
// Chrome sizes a popup window from the rendered <html>/content and caps it at
// 800x600; percentage heights collapse to 0 there, so we tag <html> with
// .is-popup and let popup.css pin a fixed 360x480 for that context only.
// The side panel ignores the flag and keeps width/height: 100%.
document.documentElement.classList.add('is-popup');
initLocale('zh').finally(() => {
  render(<App />, document.getElementById('app')!);
});
