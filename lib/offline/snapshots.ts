// Phase 0 offline spike — the "local data store" pillar.
//
// Caches the last-known-good server data for a call so the engineer surface can
// repopulate it offline. In the spike we cache the checklist-relevant props the
// server RSC already assembled; full offline *rendering* of the route needs the
// Phase 1 shell (service worker / Capacitor), which will read from here.

import { STORE_SNAPSHOTS, idbPut, idbGet } from './db'

export interface CallSnapshot<T = unknown> {
  key: string // `call:<taskId>`
  taskId: string
  data: T
  cachedAt: string
}

export async function cacheCallSnapshot<T>(taskId: string, data: T): Promise<void> {
  try {
    await idbPut<CallSnapshot<T>>(STORE_SNAPSHOTS, {
      key: `call:${taskId}`,
      taskId,
      data,
      cachedAt: new Date().toISOString(),
    })
  } catch {
    /* best-effort: storage unavailable */
  }
}

export async function readCallSnapshot<T>(taskId: string): Promise<CallSnapshot<T> | undefined> {
  try {
    return await idbGet<CallSnapshot<T>>(STORE_SNAPSHOTS, `call:${taskId}`)
  } catch {
    return undefined
  }
}
