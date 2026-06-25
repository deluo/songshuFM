import { MSG } from '../../lib/messaging';
import { getSettings, updateSettings, getPlayingState, setPlayingState } from '../storage';
import { applyPanelMode } from '../panel-mode';

type HandlerFn = (msg: any, sender: chrome.runtime.MessageSender, ctx: any) => Promise<any>;

export const handlers: Record<string, HandlerFn> = {
  [MSG.GET_SETTINGS]: async () => getSettings(),
  [MSG.UPDATE_SETTINGS]: async (msg, sender, { forwardToOffscreen }) => {
    const updated = await updateSettings(msg.settings);
    forwardToOffscreen({ type: MSG.SETTINGS_UPDATE, settings: updated }).catch(() => {});
    if ('panelMode' in msg.settings) applyPanelMode();
    return updated;
  },
  [MSG.GET_PLAYING_STATE]: async () => getPlayingState(),
  [MSG.SET_PLAYING_STATE]: async (msg) => { await setPlayingState(msg.state); return { success: true }; },
  [MSG.POPUP_CLOSED]: async () => { return { success: true }; },
};
