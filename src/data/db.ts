// IndexedDB DAL: open + migrate + generic CRUD + withRecord helper.
// Domain logic lives in data/repositories/*, NOT here. This module is the single
// low-level entry point to IndexedDB; repositories build on these primitives.

const DB_NAME = 'songshu-fm-db';
const DB_VERSION = 3; // bumped from 2 — v3 adds favoritedAt index for sync merge ordering

let dbInstance: IDBDatabase | null = null;
// Guard against concurrent cold-start opens: on a fresh service-worker wake,
// getHomeData, the migration loop, and GET_PODCAST_DETAIL can all call getDB()
// before the first open resolves. Without this guard each caller spawns its
// own indexedDB.open and the losing handles leak.
let openPromise: Promise<IDBDatabase> | null = null;

export async function getDB(): Promise<IDBDatabase> {
  if (dbInstance && !(dbInstance as any).closed) return dbInstance;
  if (openPromise) return openPromise;
  openPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result as IDBDatabase;
      const oldVer = (e as IDBVersionChangeEvent).oldVersion;
      // v1: base stores
      if (oldVer < 1) {
        const epStore = db.createObjectStore('episodes', { keyPath: 'eid' });
        epStore.createIndex('podcastId', 'podcastId', { unique: false });
        epStore.createIndex('pubDate', 'pubDate', { unique: false });
        epStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        const pdStore = db.createObjectStore('podcasts', { keyPath: 'pid' });
        pdStore.createIndex('subscribedAt', 'subscribedAt', { unique: false });
        const phStore = db.createObjectStore('playHistory', { keyPath: 'eid' });
        phStore.createIndex('lastPlayedAt', 'lastPlayedAt', { unique: false });
        phStore.createIndex('podcastId', 'podcastId', { unique: false });
        db.createObjectStore('favorites', { keyPath: 'eid' });
        const auStore = db.createObjectStore('audioUrls', { keyPath: 'eid' });
        auStore.createIndex('podcastId', 'podcastId', { unique: false });
      }
      // v2: stats + meta + audio cache
      if (oldVer < 2) {
        db.createObjectStore('listenStats', { keyPath: 'monthKey' });
        db.createObjectStore('syncMeta', { keyPath: 'key' });
        const acStore = db.createObjectStore('audioCacheMeta', { keyPath: 'eid' });
        acStore.createIndex('status', 'status', { unique: false });
      }
      // v3: favorites needs favoritedAt index for sync merge ordering.
      // In onupgradeneeded the versionchange tx is implicit — do NOT call
      // db.transaction() here. Use the store object directly, guarded by
      // index existence (handles both fresh-v3 DBs and upgrades from v1/v2).
      if (oldVer < 3) {
        const favStore = req.transaction!.objectStore('favorites');
        if (!favStore.indexNames.contains('favoritedAt')) {
          favStore.createIndex('favoritedAt', 'favoritedAt', { unique: false });
        }
      }
    };
    req.onsuccess = (e) => {
      dbInstance = (e.target as IDBOpenDBRequest).result as IDBDatabase;
      resolve(dbInstance);
    };
    req.onerror = (e) => reject((e.target as IDBOpenDBRequest).error);
  }).finally(() => {
    openPromise = null;
  });
  return openPromise;
}

async function idbPut(storeName: string, data: any): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(data);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject((e.target as IDBRequest).error);
  });
}

async function idbGet(storeName: string, key: IDBValidKey): Promise<any> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = (e) => reject((e.target as IDBRequest).error);
  });
}

async function idbGetAll(storeName: string): Promise<any[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject((e.target as IDBRequest).error);
  });
}

async function idbGetByIndex(storeName: string, indexName: string, value: IDBValidKey | IDBKeyRange): Promise<any[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const idx = tx.objectStore(storeName).index(indexName);
    const req = idx.getAll(value as IDBValidKey);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject((e.target as IDBRequest).error);
  });
}

async function idbDelete(storeName: string, key: IDBValidKey): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject((e.target as IDBRequest).error);
  });
}

async function idbClear(storeName: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject((e.target as IDBRequest).error);
  });
}

async function idbCount(storeName: string): Promise<number> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).count();
    req.onsuccess = () => resolve(req.result || 0);
    req.onerror = (e) => reject((e.target as IDBRequest).error);
  });
}

// High-order helper: read-then-mutate-then-write in one transaction.
// Eliminates the duplicated get/put patterns across repositories. Returning null
// skips the write (useful for no-op updates).
export async function withRecord<T>(
  store: string,
  key: IDBValidKey,
  mutate: (existing: T | null) => T | null,
): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const s = tx.objectStore(store);
    const req = s.get(key);
    req.onsuccess = () => {
      const next = mutate((req.result as T) ?? null);
      if (next !== null) s.put(next);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(req.error);
  });
}

export { idbPut, idbGet, idbGetAll, idbGetByIndex, idbDelete, idbClear, idbCount };
