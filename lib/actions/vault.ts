'use server'

import { createClient } from '@/lib/supabase/server'
import { notifyUsers } from '@/lib/notifications'

export type VaultUpdateAudience = 'all' | 'departments' | 'staff'

export interface SendVaultUpdateInput {
  audience: VaultUpdateAudience
  /** Selected department ids when audience === 'departments'. */
  departmentIds?: string[]
  /** Selected profile ids when audience === 'staff'. */
  userIds?: string[]
  /** Admin-editable notification title and message. */
  title: string
  message: string
  /** Optional deep link (e.g. to the relevant vault section). */
  url?: string | null
}

export interface SendVaultUpdateResult {
  ok: boolean
  error?: string
  recipients?: number
}

// Sends an editable "vault updated" notification to the chosen audience.
// ADMIN ONLY. Recipients are always staff (clients are never included).
export async function sendVaultUpdate(
  input: SendVaultUpdateInput,
): Promise<SendVaultUpdateResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in' }

  const { data: me } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single()
  if (!me || me.role !== 'admin') {
    return { ok: false, error: 'Only admins can send vault updates.' }
  }

  const title = input.title.trim()
  const message = input.message.trim()
  if (!title) return { ok: false, error: 'A title is required.' }
  if (message.length < 3) return { ok: false, error: 'A message is required.' }

  // Resolve recipient profile ids. Only active, non-client staff are eligible.
  let query = supabase
    .from('profiles')
    .select('id')
    .neq('role', 'client')
    .eq('status', 'active')

  if (input.audience === 'departments') {
    const depts = (input.departmentIds ?? []).filter(Boolean)
    if (depts.length === 0) {
      return { ok: false, error: 'Select at least one department.' }
    }
    query = query.in('department_id', depts)
  } else if (input.audience === 'staff') {
    const ids = (input.userIds ?? []).filter(Boolean)
    if (ids.length === 0) {
      return { ok: false, error: 'Select at least one person.' }
    }
    query = query.in('id', ids)
  }
  // audience === 'all' → no extra filter (all active non-client staff).

  const { data: recipients, error: recErr } = await query
  if (recErr) return { ok: false, error: recErr.message }

  const userIds = (recipients ?? []).map((r) => r.id as string)
  if (userIds.length === 0) {
    return { ok: false, error: 'No matching recipients found.' }
  }

  await notifyUsers({
    userIds,
    title,
    body: message,
    url: input.url ?? '/dashboard/vault',
    category: 'vault',
    data: { kind: 'vault_update' },
    createdBy: me.id as string,
  })

  return { ok: true, recipients: userIds.length }
}
