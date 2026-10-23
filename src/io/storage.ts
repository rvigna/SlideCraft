/* Minimal IndexedDB key-value store. Holds far more than localStorage (images included)
   and stores objects as-is, without JSON.stringify on the main thread. */
const DB_NAME = 'slidecraft';
const STORE = 'kv';

let opening: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (!opening) {
    opening = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB is not available')); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('Could not open storage'));
      req.onblocked = () => reject(new Error('Storage is blocked by another tab'));
    });
    opening.catch(() => { opening = null; });
  }
  return opening;
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(d => new Promise<T>((resolve, reject) => {
    const tx = d.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = tx.onabort = () => reject(tx.error ?? req.error ?? new Error('Storage failed'));
  }));
}

export const idbGet = <T>(key: string) => run<T | undefined>('readonly', s => s.get(key) as IDBRequest<T | undefined>);
export const idbSet = (key: string, value: unknown) => run('readwrite', s => s.put(value, key)).then(() => undefined);
export const idbDelete = (key: string) => run('readwrite', s => s.delete(key)).then(() => undefined);
