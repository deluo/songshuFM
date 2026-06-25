import { MSG, broadcast } from '../../lib/messaging';
import { getAudioCacheMeta, setAudioCacheMeta, deleteAudioCacheMeta, getAllAudioCacheMeta, clearAudioCacheMeta } from '../storage';

function sanitizeFilename(title: string): string {
  if (!title) return 'episode';
  let name = title.replace(/[\\/:*?"<>|]/g, '');
  name = name.replace(/\s+/g, ' ').trim();
  if (name.length > 100) name = name.slice(0, 100).trim();
  return name || 'episode';
}

async function findEidByDownloadId(downloadId: number): Promise<string | null> {
  const allMeta = await getAllAudioCacheMeta();
  const entry = Object.values(allMeta).find((m: any) => m.downloadId === downloadId);
  return (entry as any)?.eid || null;
}

chrome.downloads.onChanged.addListener(async (delta: any) => {
  const eid = await findEidByDownloadId(delta.id);
  if (!eid) return;

  if (delta.bytesReceived || delta.totalBytes || delta.state?.current === 'in_progress') {
    const items = await chrome.downloads.search({ id: delta.id });
    const item = items?.[0];
    if (item && item.totalBytes > 0) {
      const progress = Math.min(99, Math.round((item.bytesReceived / item.totalBytes) * 100));
      const meta = await getAudioCacheMeta(eid);
      if (meta && meta.status === 'downloading') {
        await setAudioCacheMeta({ ...meta, progress });
        broadcast(MSG.AUDIO_DOWNLOAD_PROGRESS, { eid, progress });
      }
    }
  }

  if (delta.state?.current === 'complete') {
    const meta = await getAudioCacheMeta(eid);
    if (!meta) return;
    const items = await chrome.downloads.search({ id: delta.id });
    const item = items?.[0];
    await setAudioCacheMeta({
      ...meta,
      status: 'cached',
      progress: 100,
      filename: item?.filename || '',
      fileSize: item?.fileSize || 0,
      cachedAt: Date.now(),
    });
    broadcast(MSG.AUDIO_DOWNLOAD_COMPLETE, { eid });
  }

  if (delta.state?.current === 'interrupted') {
    const meta = await getAudioCacheMeta(eid);
    if (!meta) return;
    await setAudioCacheMeta({
      ...meta,
      status: 'error',
      errorMessage: delta.error?.current || 'interrupted',
    });
  }
});

type HandlerFn = (msg: any, sender: chrome.runtime.MessageSender, ctx: any) => Promise<any>;

export const handlers: Record<string, HandlerFn> = {
  [MSG.AUDIO_DOWNLOAD_START]: async (msg) => {
    const { episodeId, audioUrl, episodeTitle } = msg;
    const meta = await getAudioCacheMeta(episodeId);
    if (meta?.status === 'cached') return { success: false, error: 'Already downloaded' };
    if (meta?.status === 'downloading') return { success: false, error: 'Already downloading' };

    const filename = sanitizeFilename(episodeTitle) + '.mp3';

    try {
      const downloadId = await chrome.downloads.download({
        url: audioUrl,
        filename: `songshuFM/${filename}`,
        conflictAction: 'uniquify',
        saveAs: false,
      });

      await setAudioCacheMeta({
        eid: episodeId,
        audioUrl,
        downloadId,
        filename: '',
        fileSize: 0,
        cachedAt: Date.now(),
        status: 'downloading',
        progress: 0,
      });

      return { success: true, downloadId };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  [MSG.AUDIO_DOWNLOAD_CANCEL]: async (msg) => {
    const meta = await getAudioCacheMeta(msg.episodeId);
    if (meta?.downloadId) {
      try { await chrome.downloads.cancel(meta.downloadId); } catch (_) {}
      try { await chrome.downloads.erase({ id: meta.downloadId }); } catch (_) {}
    }
    await deleteAudioCacheMeta(msg.episodeId);
    return { success: true };
  },

  [MSG.AUDIO_CACHE_DELETE]: async (msg) => {
    const meta = await getAudioCacheMeta(msg.episodeId);
    if (meta?.downloadId) {
      try { await chrome.downloads.removeFile(meta.downloadId); } catch (_) {}
      try { await chrome.downloads.erase({ id: meta.downloadId }); } catch (_) {}
    }
    await deleteAudioCacheMeta(msg.episodeId);
    return { success: true };
  },

  [MSG.AUDIO_CACHE_CHECK]: async (msg) => {
    const meta = await getAudioCacheMeta(msg.episodeId);
    return { cached: meta?.status === 'cached', meta };
  },

  [MSG.AUDIO_DOWNLOAD_PROGRESS]: async (msg) => {
    const meta = await getAudioCacheMeta(msg.episodeId);
    if (!meta || meta.status !== 'downloading' || !meta.downloadId) {
      return { progress: meta?.status === 'cached' ? 100 : 0, state: meta?.status || 'idle' };
    }
    const items = await chrome.downloads.search({ id: meta.downloadId });
    const item = items?.[0];
    if (!item) return { progress: meta.progress || 0, state: 'downloading' };
    if (item.state === 'complete') {
      await setAudioCacheMeta({
        ...meta,
        status: 'cached',
        progress: 100,
        filename: item.filename || '',
        fileSize: item.fileSize || 0,
        cachedAt: Date.now(),
      });
      return { progress: 100, state: 'complete' };
    }
    const progress = item.totalBytes > 0 ? Math.round((item.bytesReceived / item.totalBytes) * 100) : 0;
    await setAudioCacheMeta({ ...meta, progress });
    return { progress, state: item.state };
  },

  [MSG.AUDIO_CACHE_GET_ALL]: async () => getAllAudioCacheMeta(),

  [MSG.AUDIO_CACHE_CLEAR]: async () => {
    const allMeta = await getAllAudioCacheMeta();
    for (const meta of Object.values(allMeta)) {
      if ((meta as any).downloadId) {
        try { await chrome.downloads.removeFile((meta as any).downloadId); } catch (_) {}
        try { await chrome.downloads.erase({ id: (meta as any).downloadId }); } catch (_) {}
      }
    }
    await clearAudioCacheMeta();
    return { success: true };
  },

  [MSG.AUDIO_OPEN_FOLDER]: async (msg) => {
    const meta = await getAudioCacheMeta(msg.episodeId);
    if (meta?.downloadId) {
      chrome.downloads.show(meta.downloadId);
      return { success: true };
    }
    return { success: false, error: 'No download found' };
  },
};
