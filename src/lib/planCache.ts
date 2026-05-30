/**
 * Plans — offline PDF cache (IndexedDB).
 *
 * Builders use BenchLog in a hangar where Wi-Fi is often unreliable or
 * absent. We cache every PDF the user opens so that subsequent reads work
 * with zero network round-trips. The cache is cache-first: if a fileId is
 * present in IndexedDB, we return the cached bytes without hitting the
 * server. PDF plan files are content-immutable (a re-upload yields a new
 * fileId), so cache invalidation is implicit.
 *
 * Storage: one entry per `fileId`, value = ArrayBuffer + bytes + cachedAt.
 * IndexedDB transparently structured-clones on get(), so consumers can
 * freely transfer/detach the returned ArrayBuffer (react-pdf does this).
 *
 * Quota: IndexedDB quotas on modern devices are GB-scale. We expose total
 * size + a manual "clear cache" action; explicit eviction policies (LRU,
 * max-bytes) are intentionally out of v1 scope.
 *
 * This module degrades gracefully when IndexedDB is unavailable (private
 * browsing on some browsers, Safari in some contexts). All public
 * functions resolve / return undefined or empty rather than throwing.
 */

const DB_NAME    = 'benchlog-plans-cache';
const DB_VERSION = 1;
const STORE      = 'pdfs';

interface CacheEntry {
  fileId: string;
  bytes: ArrayBuffer;
  size: number;
  cachedAt: number;
}

let _dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (_dbPromise) return _dbPromise;
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  _dbPromise = new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'fileId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    // Private browsing / SecurityError → resolve null and act as no-op.
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
  return _dbPromise;
}

function tx(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(STORE, mode).objectStore(STORE);
}

/** Return cached PDF bytes for a file, or null if not cached / no IDB. */
export async function getCachedPdf(fileId: string): Promise<ArrayBuffer | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const req = tx(db, 'readonly').get(fileId);
    req.onsuccess = () => {
      const entry = req.result as CacheEntry | undefined;
      resolve(entry ? entry.bytes : null);
    };
    req.onerror = () => resolve(null);
  });
}

/** Store PDF bytes for a file. Silent no-op if IDB unavailable / quota full. */
export async function cachePdf(fileId: string, bytes: ArrayBuffer): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const entry: CacheEntry = { fileId, bytes, size: bytes.byteLength, cachedAt: Date.now() };
      const req = tx(db, 'readwrite').put(entry);
      req.onsuccess = () => resolve();
      // QuotaExceededError lands here — swallow and continue (caller has
      // already received the network response).
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** Remove a single cached PDF. */
export async function deleteCachedPdf(fileId: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    const req = tx(db, 'readwrite').delete(fileId);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
  });
}

/** Set of fileIds that have a cached copy locally. */
export async function listCachedFileIds(): Promise<Set<string>> {
  const db = await openDb();
  if (!db) return new Set();
  return new Promise((resolve) => {
    const req = tx(db, 'readonly').getAllKeys();
    req.onsuccess = () => resolve(new Set((req.result as string[]) || []));
    req.onerror = () => resolve(new Set());
  });
}

/** Total cached bytes across all PDFs. Used for the "X MB cached" footer. */
export async function getCacheBytes(): Promise<number> {
  const db = await openDb();
  if (!db) return 0;
  return new Promise((resolve) => {
    const req = tx(db, 'readonly').getAll();
    req.onsuccess = () => {
      const entries = (req.result as CacheEntry[]) || [];
      resolve(entries.reduce((sum, e) => sum + (e.size || 0), 0));
    };
    req.onerror = () => resolve(0);
  });
}

/** Wipe the entire cache. */
export async function clearPdfCache(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    const req = tx(db, 'readwrite').clear();
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
  });
}
