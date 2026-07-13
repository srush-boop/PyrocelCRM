// Phase 0 offline spike — a tiny promise-based IndexedDB wrapper.
//
// Deliberately dependency-free (native IndexedDB) so this core can later run
// unchanged inside a Capacitor WebView. Three object stores:
//   - snapshots: last-known-good server data for a call, so the engineer view
//     can repopulate offline (full offline *rendering* needs the Phase 1 shell;
//     this stores the data that layer will read).
//   - mutations: the write queue (see lib/offline/queue.ts).
//   - conflicts: writes the sync manager flagged as clashing with a newer server
//     row, kept for office review (see lib/offline/sync.ts).
//
// All access is guarded so it is a no-op on the server / where IndexedDB is
// unavailable, keeping callers simple.

const DB_NAME = 'pyrocel-offline'
const DB_VERSION = 1

export const STORE_SNAPSHOTS = 'snapshots'
export const STORE_MUTATIONS = 'mutations'
export const STORE_CONFLICTS = 'conflicts'

export function isOfflineStorageAvailable(): boolean {
  return typeof window !== 'undefined' && 'indexedDB' in window
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (!isOfflineStorageAvailable()) {
    return Promise.reject(new Error('IndexedDB unavailable'))
  }
  if (dbPromise) return dbPromise
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_SNAPSHOTS)) {
        db.createObjectStore(STORE_SNAPSHOTS, { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains(STORE_MUTATIONS)) {
        // keyPath 'key' lets us coalesce repeated writes to the same entity
        // (e.g. many checklist edits to one task_results row) into one entry.
        const store = db.createObjectStore(STORE_MUTATIONS, { keyPath: 'key' })
        store.createIndex('by_created', 'createdAt', { unique: false })
      }
      if (!db.objectStoreNames.contains(STORE_CONFLICTS)) {
        db.createObjectStore(STORE_CONFLICTS, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('Failed to open offline DB'))
  })
  return dbPromise
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(store, mode)
        const req = run(transaction.objectStore(store))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error ?? new Error('Offline DB request failed'))
      }),
  )
}

export async function idbPut<T>(store: string, value: T): Promise<void> {
  await tx(store, 'readwrite', (s) => s.put(value as unknown as Record<string, unknown>))
}

export async function idbGet<T>(store: string, key: string): Promise<T | undefined> {
  return tx<T | undefined>(store, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>)
}

export async function idbGetAll<T>(store: string): Promise<T[]> {
  const result = await tx<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>)
  return result ?? []
}

export async function idbDelete(store: string, key: string): Promise<void> {
  await tx(store, 'readwrite', (s) => s.delete(key))
}

export async function idbCount(store: string): Promise<number> {
  try {
    return await tx<number>(store, 'readonly', (s) => s.count())
  } catch {
    return 0
  }
}
