import { getSettings } from './storage';

// Apply the user's preferred panel mode: side panel or popup.
// Called on install, startup, and when the panelMode setting changes.
export async function applyPanelMode() {
  try {
    const settings = await getSettings();
    if (settings.panelMode === 'popup') {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
      await chrome.action.setPopup({ popup: 'src/popup/index.html' });
    } else {
      await chrome.action.setPopup({ popup: '' });
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    }
  } catch (e: any) {
    console.error('[panelMode] applyPanelMode failed:', e);
  }
}
