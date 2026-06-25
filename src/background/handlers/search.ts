import { MSG } from '../../lib/messaging';
import { getSearchHistory, addSearchHistory, clearSearchHistory } from '../storage';

type HandlerFn = (msg: any, sender: chrome.runtime.MessageSender, ctx: any) => Promise<any>;

export const handlers: Record<string, HandlerFn> = {
  [MSG.SEARCH_HISTORY_GET]: async () => getSearchHistory(),
  [MSG.SEARCH_HISTORY_ADD]: async (msg) => { await addSearchHistory(msg.query); return { success: true }; },
  [MSG.SEARCH_HISTORY_CLEAR]: async () => { await clearSearchHistory(); return { success: true }; },
};
