'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { LOGBOOK_ENTRY_TYPES } from '@/lib/logbook'
import type {
  LogbookEntry,
  LogbookEntryType,
  SiteBuildingInfo,
} from '@/lib/types/database'

// Derived from the shared catalog so occupier/staff/portal stay in sync.
const VALID_ENTRY_TYPES: LogbookEntryType[] = LOGBOOK_ENTRY_TYPES.map((t) => t.value)

export interface ClientSiteSummary {
  id: string
  name: string
  address: string
}

/**
 * Sites the logged-in client may access. RLS on `sites` already restricts the
 * result to the client's permitted sites, so no extra filtering is required.
 */
export async function getClientSites(): Promise<ClientSiteSummary[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('sites')
    .select('id, name, address')
    .order('name', { ascending: true })

  return (data ?? []) as ClientSiteSummary[]
}

export interface ClientLogbookData {
  site: { id: string; name: string; address: string }
  buildingInfo: SiteBuildingInfo | null
  reports: {
    id: string
    date: string
    serviceName: string
    engineerName: string | null
    status: 'pass' | 'partial' | 'fail' | null
    href: string
  }[]
  entries: LogbookEntry[]
}

/**
 * Fetch the full log book for one site, scoped to the logged-in client. All
 * queries run through the RLS-bound server client, so a client requesting a
 * site they cannot access simply gets `null`.
 */
export async function getClientLogbook(
  siteId: string,
): Promise<ClientLogbookData | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  // RLS returns the row only if this client may access the site.
  const { data: site } = await supabase
    .from('sites')
    .select('id, name, address')
    .eq('id', siteId)
    .single()
  if (!site) return null

  const { data: buildingInfo } = await supabase
    .from('site_building_info')
    .select('*')
    .eq('site_id', siteId)
    .maybeSingle()

  const { data: tasks } = await supabase
    .from('tasks')
    .select(
      `id, status, completed_at, scheduled_date,
       site_service:site_services!inner(site_id, service_type:service_types(name)),
       engineer:profiles!tasks_assigned_engineer_id_fkey(full_name)`,
    )
    .eq('site_service.site_id', siteId)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })

  const reports = (tasks ?? []).map((t: any) => ({
    id: t.id as string,
    date: (t.completed_at || t.scheduled_date) as string,
    serviceName: (t.site_service?.service_type?.name as string) || 'Service',
    engineerName: (t.engineer?.full_name as string) || null,
    status: null,
    // Login-safe report route for portal users.
    href: `/portal/reports/${t.id}`,
  }))

  const { data: entries } = await supabase
    .from('logbook_entries')
    .select('*')
    .eq('site_id', siteId)
    .order('entry_date', { ascending: false })

  return {
    site: site as ClientLogbookData['site'],
    buildingInfo: (buildingInfo as SiteBuildingInfo | null) ?? null,
    reports,
    entries: (entries ?? []) as LogbookEntry[],
  }
}

/**
 * Add an occupier log book entry from the client portal. Inserts into
 * `logbook_entries` are staff-only under RLS, so we first re-verify the client
 * may access the site (via the RLS-bound client) and then write through the
 * admin client with `source = 'occupier'`.
 */
export async function addClientLogbookEntry(
  siteId: string,
  values: {
    entry_type: string
    entry_date: string
    title: string
    details: string
    result: string
    call_point_ref: string
    call_point_location: string
    performed_by: string
  },
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated.' }

  // Ownership check: RLS returns the row only if this client may access it.
  const { data: site } = await supabase
    .from('sites')
    .select('id')
    .eq('id', siteId)
    .single()
  if (!site) return { ok: false, error: 'You do not have access to this site.' }

  if (!VALID_ENTRY_TYPES.includes(values.entry_type as LogbookEntryType)) {
    return { ok: false, error: 'Invalid entry type.' }
  }
  if (!values.entry_date) return { ok: false, error: 'A date is required.' }

  const admin = createAdminClient()
  const { error } = await admin.from('logbook_entries').insert({
    site_id: siteId,
    entry_type: values.entry_type,
    entry_date: values.entry_date,
    title: values.title || null,
    details: values.details || null,
    result: values.result || null,
    call_point_ref: values.call_point_ref || null,
    call_point_location: values.call_point_location || null,
    performed_by: values.performed_by || null,
    source: 'occupier',
    created_by: user.id,
  })

  if (error) return { ok: false, error: 'Could not save entry. Please try again.' }

  revalidatePath(`/portal/logbook/${siteId}`)
  return { ok: true }
}
