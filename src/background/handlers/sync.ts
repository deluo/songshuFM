import { MSG } from '../../lib/messaging';
import { performSync, getWebDAVStatus } from '../webdav-sync';

type HandlerFn = (msg: any, sender: chrome.runtime.MessageSender, ctx: any) => Promise<any>;

export const handlers: Record<string, HandlerFn> = {
  [MSG.WEBDAV_CONFIG_GET]: async () => {
    const result = await chrome.storage.local.get('webdavSettings');
    return result.webdavSettings || {};
  },
  [MSG.WEBDAV_CONFIG_SET]: async (msg) => {
    await chrome.storage.local.set({ webdavSettings: msg.config });
    return { success: true };
  },
  [MSG.WEBDAV_STATUS]: async () => {
    return await getWebDAVStatus();
  },
  [MSG.WEBDAV_SYNC_NOW]: async (msg) => {
    try {
      return await performSync(msg.mode);
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
