// Phase 0 offline spike — the write queue.
//
// A queued mutation is a self-describing, replayable write. For the spike we
// support the checklist draft/save path (`task_results.upsert`), but the shape
// generalises to every offline action the full programme will need (defects,
// parts, photos, check-ins...).
//
// Coalescing: repeated edits to the SAME entity collapse onto one queue entry
// (keyed by e.g. `task_results:<id>`), because each save carries the full row
// snapshot — replaying stale intermediate states would be wasteful and risk
// clobbering. We keep the earliest `baseUpdatedAt` (for conflict detection) and
// the latest `payload`.

import {
  STORE_MUTATIONS,
  idbGetAll,
  idbGet,
  idbPut,
  idbDelete,
  idbCount,
  isOfflineStorageAvailable,
} from './db'

export type MutationKind = 'task_results.upsert'

export interface QueuedMutation {
  /** Coalescing key, e.g. `task_results:<rowId>`. */
  key: string
  kind: MutationKind
  /** Full row payload to upsert (includes the client-known `id`). */
  payload: Record<string, unknown>
  /** Server `updated_at` observed when the row was first queued (conflict base). */
  baseUpdatedAt: string | null
  createdAt: number
  updatedAt: number
  attempts: number
  lastError: string | null
}

export function mutationCountAvailable(): boolean {
  return isOfflineStorageAvailable()
}

/**
 * Enqueue (or coalesce into) a mutation. Returns the stored entry. Safe no-op
 * shape when storage is unavailable (throws, callers treat as best-effort).
 */
export async function enqueueMutation(input: {
  key: string
  kind: MutationKind
  payload: Record<string, unknown>
  baseUpdatedAt: string | null
}): Promise<void> {
  const now = Date.now()
  const existing = await idbGet<QueuedMutation>(STORE_MUTATIONS, input.key)
  const entry: QueuedMutation = existing
    ? {
        ...existing,
        // Keep the ORIGINAL baseUpdatedAt so conflict detection compares against
        // what the server looked like before our first offline edit.
        payload: input.payload,
        updatedAt: now,
        // Reset attempts/error whenever fresh data supersedes a failed entry.
        attempts: 0,
        lastError: null,
      }
    : {
        key: input.key,
        kind: input.kind,
        payload: input.payload,
        baseUpdatedAt: input.baseUpdatedAt,
        createdAt: now,
        updatedAt: now,
        attempts: 0,
        lastError: null,
      }
  await idbPut(STORE_MUTATIONS, entry)
}

export async function listMutations(): Promise<QueuedMutation[]> {
  const all = await idbGetAll<QueuedMutation>(STORE_MUTATIONS)
  return all.sort((a, b) => a.createdAt - b.createdAt)
}

export async function deleteMutation(key: string): Promise<void> {
  await idbDelete(STORE_MUTATIONS, key)
}

export async function markMutationFailed(key: string, error: string): Promise<void> {
  const existing = await idbGet<QueuedMutation>(STORE_MUTATIONS, key)
  if (!existing) return
  await idbPut(STORE_MUTATIONS, {
    ...existing,
    attempts: existing.attempts + 1,
    lastError: error,
    updatedAt: Date.now(),
  })
}

export async function pendingCount(): Promise<number> {
  return idbCount(STORE_MUTATIONS)
}
