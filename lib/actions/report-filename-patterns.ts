'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { ReportFilenamePattern } from '@/lib/types/database'

// Admin/office management of report PDF filename conventions. A row scopes to a
// (client, service) slot: client_id NULL = company scope, service_type_id NULL =
// that scope's default. Resolution precedence lives in lib/reports/pdf-filename.

async function requireStaff() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' as const }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const role = (profile as { role?: string } | null)?.role
  if (role !== 'admin' && role !== 'office') {
    return { error: 'Only admins and office staff can set filename conventions.' as const }
  }
  return { supabase }
}

export interface SaveFilenamePatternInput {
  // null = company scope.
  clientId: string | null
  // null = the scope's default across every service.
  serviceTypeId: string | null
  pattern: string
}

/**
 * Save (or clear) a filename pattern for a scope slot. A blank pattern deletes
 * the row so the slot falls back to the next tier. NULLs make the partial unique
 * indexes non-trivial to use as upsert targets, so match-then-update/insert.
 */
export async function saveFilenamePattern(
  input: SaveFilenamePatternInput,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireStaff()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { supabase } = auth

  const clientId = input.clientId ?? null
  const serviceTypeId = input.serviceTypeId ?? null
  const pattern = (input.pattern ?? '').trim()

  // Locate the existing row for this exact scope slot (null-safe matching).
  let findQuery = supabase.from('report_filename_patterns').select('id')
  findQuery = clientId
    ? findQuery.eq('client_id', clientId)
    : findQuery.is('client_id', null)
  findQuery = serviceTypeId
    ? findQuery.eq('service_type_id', serviceTypeId)
    : findQuery.is('service_type_id', null)
  const { data: existing } = await findQuery.maybeSingle()
  const existingId = (existing as { id?: string } | null)?.id ?? null

  // Blank = inherit: remove any existing row.
  if (!pattern) {
    if (existingId) {
      const { error } = await supabase
        .from('report_filename_patterns')
        .delete()
        .eq('id', existingId)
      if (error) return { ok: false, error: error.message }
    }
    revalidatePath('/dashboard/settings')
    revalidatePath('/dashboard/clients')
    return { ok: true }
  }

  if (existingId) {
    const { error } = await supabase
      .from('report_filename_patterns')
      .update({ pattern, updated_at: new Date().toISOString() })
      .eq('id', existingId)
    if (error) return { ok: false, error: error.message }
  } else {
    const { error } = await supabase.from('report_filename_patterns').insert({
      client_id: clientId,
      service_type_id: serviceTypeId,
      pattern,
    })
    if (error) return { ok: false, error: error.message }
  }

  revalidatePath('/dashboard/settings')
  revalidatePath('/dashboard/clients')
  return { ok: true }
}

/** All filename patterns for a given client (for the client dialog). */
export async function getClientFilenamePatterns(
  clientId: string,
): Promise<ReportFilenamePattern[]> {
  const auth = await requireStaff()
  if ('error' in auth) return []
  const { supabase } = auth
  const { data } = await supabase
    .from('report_filename_patterns')
    .select('*')
    .eq('client_id', clientId)
  return (data ?? []) as ReportFilenamePattern[]
}

/**
 * Load both the client's own patterns and the company-scope patterns, so the
 * client dialog can show inherited defaults as placeholders.
 */
export async function getClientFilenameContext(clientId: string): Promise<{
  client: ReportFilenamePattern[]
  company: ReportFilenamePattern[]
}> {
  const auth = await requireStaff()
  if ('error' in auth) return { client: [], company: [] }
  const { supabase } = auth
  const { data } = await supabase
    .from('report_filename_patterns')
    .select('*')
    .or(`client_id.eq.${clientId},client_id.is.null`)
  const rows = (data ?? []) as ReportFilenamePattern[]
  return {
    client: rows.filter((r) => r.client_id === clientId),
    company: rows.filter((r) => r.client_id === null),
  }
}
