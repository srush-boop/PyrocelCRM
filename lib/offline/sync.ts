// Phase 0 offline spike — the sync manager + offline-aware persist helper.
//
// `persistTaskResult` is the single interception point the checklist flow uses
// instead of writing to Supabase directly:
//   - Online  → write live (identical to the old behaviour) and return the id.
//   - Offline / network failure → generate a client id if needed, queue a
//     coalesced `task_results.upsert`, and return that id so subsequent edits
//     target the same row.
//
// `flushQueue` replays queued writes when connectivity returns. Conflict policy
// for the spike is last-write-wins-with-logging: if the server row changed since
// we first queued (its `updated_at` is newer than our captured base), we still
// apply our write but record a conflict entry for office review.

import type { createClient } from '@/lib/supabase/client'
import {
  enqueueMutation,
  listMutations,
  deleteMutation,
  markMutationFailed,
  type QueuedMutation,
} from './queue'
import { STORE_CONFLICTS, idbPut } from './db'

type SupabaseClient = ReturnType<typeof createClient>

export function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine
}

function taskResultKey(rowId: string): string {
  return `task_results:${rowId}`
}

export interface PersistResult {
  id: string
  queued: boolean
}

/**
 * Persist a task_results row, transparently queueing when offline.
 * `rowId` is the known row id (null before the row exists).
 */
export async function persistTaskResult(
  supabase: SupabaseClient,
  args: {
    rowId: string | null
    data: Record<string, unknown>
    /** Server updated_at last seen for this row (conflict base). */
    baseUpdatedAt: string | null
  },
): Promise<PersistResult> {
  const { rowId, data, baseUpdatedAt } = args

  if (isOnline()) {
    try {
      if (rowId) {
        const { error } = await supabase.from('task_results').update(data).eq('id', rowId)
        if (error) throw error
        return { id: rowId, queued: false }
      }
      const { data: inserted, error } = await supabase
        .from('task_results')
        .insert(data)
        .select('id')
        .single()
      if (error) throw error
      const newId = (inserted as { id: string } | null)?.id
      if (!newId) throw new Error('Insert returned no id')
      return { id: newId, queued: false }
    } catch {
      // Fall through to queue — treat live-write failure as an offline event so
      // the engineer never loses work on a flaky connection.
    }
  }

  // Offline (or the live write failed): assign a stable client id so repeated
  // edits coalesce onto one row and the eventual insert is idempotent.
  const id = rowId ?? cryptoRandomId()
  await enqueueMutation({
    key: taskResultKey(id),
    kind: 'task_results.upsert',
    payload: { ...data, id },
    baseUpdatedAt,
  })
  return { id, queued: true }
}

export interface FlushSummary {
  attempted: number
  succeeded: number
  failed: number
  conflicts: number
}

/** Replay all queued mutations in creation order. */
export async function flushQueue(supabase: SupabaseClient): Promise<FlushSummary> {
  const summary: FlushSummary = { attempted: 0, succeeded: 0, failed: 0, conflicts: 0 }
  if (!isOnline()) return summary

  const mutations = await listMutations()
  for (const m of mutations) {
    summary.attempted++
    try {
      if (m.kind === 'task_results.upsert') {
        const conflicted = await applyTaskResultUpsert(supabase, m)
        if (conflicted) summary.conflicts++
      }
      await deleteMutation(m.key)
      summary.succeeded++
    } catch (err) {
      summary.failed++
      await markMutationFailed(m.key, err instanceof Error ? err.message : String(err))
    }
  }
  return summary
}

// Upsert one task_results row, detecting (and logging) a conflict where the
// server row advanced past the base we captured when queueing. Returns true if
// a conflict was recorded.
async function applyTaskResultUpsert(
  supabase: SupabaseClient,
  m: QueuedMutation,
): Promise<boolean> {
  const id = (m.payload as { id?: string }).id
  if (!id) throw new Error('Queued task_results upsert missing id')

  const { data: current } = await supabase
    .from('task_results')
    .select('id, updated_at')
    .eq('id', id)
    .maybeSingle()

  let conflicted = false
  if (current && m.baseUpdatedAt) {
    const serverUpdated = new Date((current as { updated_at: string }).updated_at).getTime()
    const base = new Date(m.baseUpdatedAt).getTime()
    if (serverUpdated > base) {
      conflicted = true
      await idbPut(STORE_CONFLICTS, {
        id: `${m.key}:${Date.now()}`,
        entity: 'task_results',
        rowId: id,
        baseUpdatedAt: m.baseUpdatedAt,
        serverUpdatedAt: (current as { updated_at: string }).updated_at,
        queuedPayload: m.payload,
        detectedAt: new Date().toISOString(),
      })
    }
  }

  // Last-write-wins: apply our write regardless (spike policy). Insert when the
  // row doesn't exist yet, otherwise update.
  if (current) {
    const { error } = await supabase.from('task_results').update(m.payload).eq('id', id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('task_results').insert(m.payload)
    if (error) throw error
  }
  return conflicted
}

function cryptoRandomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  // Fallback for older WebViews.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
