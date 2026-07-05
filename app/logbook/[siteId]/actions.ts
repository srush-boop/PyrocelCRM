'use server'

import crypto from 'crypto'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import type { LogbookEntry, LogbookEntryType, SiteBuildingInfo } from '@/lib/types/database'
import type { BuildingInfoValues } from '@/app/(dashboard)/dashboard/sites/[id]/logbook-actions'
import { LOGBOOK_ENTRY_TYPES } from '@/lib/logbook'

const COOKIE_PREFIX = 'lb_access_'
// Access session lifetime: 8 hours.
const MAX_AGE_SECONDS = 60 * 60 * 8

// Derived from the shared catalog so occupier/staff/portal stay in sync.
const VALID_ENTRY_TYPES: LogbookEntryType[] = LOGBOOK_ENTRY_TYPES.map((t) => t.value)

/** Server-only secret used to sign access cookies. */
function signingSecret(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'pyrocel-logbook-fallback-secret'
}

/** Normalise a postcode for comparison: uppercase, no spaces. */
function normalisePostcode(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase()
}

/** Create an HMAC token proving access to a given site was granted. */
function signToken(siteId: string, expires: number): string {
  const payload = `${siteId}.${expires}`
  const sig = crypto.createHmac('sha256', signingSecret()).update(payload).digest('hex')
  return `${expires}.${sig}`
}

function verifyToken(siteId: string, token: string | undefined): boolean {
  if (!token) return false
  const [expiresStr, sig] = token.split('.')
  const expires = Number(expiresStr)
  if (!expires || Number.isNaN(expires) || expires < Date.now()) return false
  const expected = crypto
    .createHmac('sha256', signingSecret())
    .update(`${siteId}.${expires}`)
    .digest('hex')
  if (!sig || sig.length !== expected.length) return false
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
}

/** Has the current visitor already unlocked this site in this session? */
export async function hasLogbookAccess(siteId: string): Promise<boolean> {
  const cookieStore = await cookies()
  const token = cookieStore.get(`${COOKIE_PREFIX}${siteId}`)?.value
  return verifyToken(siteId, token)
}

/** Verify a submitted postcode and, on success, set a signed access cookie. */
export async function unlockLogbook(
  siteId: string,
  postcode: string,
): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient()
  const { data: site, error } = await admin
    .from('sites')
    .select('id, postcode')
    .eq('id', siteId)
    .single()

  if (error || !site) return { ok: false, error: 'Site not found.' }
  if (!site.postcode) {
    return { ok: false, error: 'This log book is not yet available. Please contact Pyrocel.' }
  }
  if (normalisePostcode(site.postcode) !== normalisePostcode(postcode)) {
    return { ok: false, error: 'Incorrect postcode. Please try again.' }
  }

  const expires = Date.now() + MAX_AGE_SECONDS * 1000
  const cookieStore = await cookies()
  cookieStore.set(`${COOKIE_PREFIX}${siteId}`, signToken(siteId, expires), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: MAX_AGE_SECONDS,
    path: `/logbook/${siteId}`,
  })
  return { ok: true }
}

export interface PublicLogbookData {
  site: { id: string; name: string; address: string }
  buildingInfo: SiteBuildingInfo | null
  reports: {
    id: string
    date: string
    serviceName: string
    engineerName: string | null
    status: 'pass' | 'partial' | 'fail' | null
  }[]
  entries: LogbookEntry[]
}

/** Fetch the combined log book data for a site after re-verifying access. */
export async function getPublicLogbook(siteId: string): Promise<PublicLogbookData | null> {
  if (!(await hasLogbookAccess(siteId))) return null

  const admin = createAdminClient()

  const { data: site } = await admin
    .from('sites')
    .select('id, name, address')
    .eq('id', siteId)
    .single()
  if (!site) return null

  const { data: buildingInfo } = await admin
    .from('site_building_info')
    .select('*')
    .eq('site_id', siteId)
    .maybeSingle()

  // Professional service history: completed tasks for this site.
  const { data: tasks } = await admin
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
  }))

  const { data: entries } = await admin
    .from('logbook_entries')
    .select('*')
    .eq('site_id', siteId)
    .order('entry_date', { ascending: false })

  return {
    site,
    buildingInfo: (buildingInfo as SiteBuildingInfo | null) ?? null,
    reports,
    entries: (entries ?? []) as LogbookEntry[],
  }
}

/** Add an occupier log book entry after re-verifying access. */
export async function addOccupierEntry(
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
  if (!(await hasLogbookAccess(siteId))) {
    return { ok: false, error: 'Your session has expired. Please re-enter the postcode.' }
  }

  if (!VALID_ENTRY_TYPES.includes(values.entry_type as LogbookEntryType)) {
    return { ok: false, error: 'Invalid entry type.' }
  }
  if (!values.entry_date) {
    return { ok: false, error: 'A date is required.' }
  }

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
  })

  if (error) return { ok: false, error: 'Could not save entry. Please try again.' }
  return { ok: true }
}

/** Update the General Building Information after re-verifying occupier access. */
export async function saveOccupierBuildingInfo(
  siteId: string,
  values: BuildingInfoValues,
): Promise<{ ok: boolean; error?: string }> {
  if (!(await hasLogbookAccess(siteId))) {
    return { ok: false, error: 'Your session has expired. Please re-enter the postcode.' }
  }

  // Keep only non-empty contacts and normalise to the stored shape.
  const contacts = (values.emergency_contacts || [])
    .map((c) => ({
      name: (c.name || '').trim(),
      role: (c.role || '').trim(),
      phone: (c.phone || '').trim(),
    }))
    .filter((c) => c.name || c.role || c.phone)

  const admin = createAdminClient()
  const { error } = await admin.from('site_building_info').upsert(
    {
      site_id: siteId,
      responsible_person_name: values.responsible_person_name.trim() || null,
      responsible_person_role: values.responsible_person_role.trim() || null,
      responsible_person_phone: values.responsible_person_phone.trim() || null,
      responsible_person_email: values.responsible_person_email.trim() || null,
      competent_person_name: values.competent_person_name.trim() || null,
      competent_person_company: values.competent_person_company.trim() || null,
      competent_person_phone: values.competent_person_phone.trim() || null,
      competent_person_email: values.competent_person_email.trim() || null,
      fra_location: values.fra_location.trim() || null,
      fra_last_date: values.fra_last_date || null,
      fra_next_date: values.fra_next_date || null,
      fra_assessor: values.fra_assessor.trim() || null,
      fra_notes: values.fra_notes.trim() || null,
      emergency_contacts: contacts,
      updated_at: new Date().toISOString(),
      // Occupier edits are not tied to a staff profile.
      updated_by: null,
    },
    { onConflict: 'site_id' },
  )

  if (error) {
    return { ok: false, error: 'Could not save building information. Please try again.' }
  }
  return { ok: true }
}
