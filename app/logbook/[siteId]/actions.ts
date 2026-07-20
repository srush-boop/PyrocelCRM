'use server'

import crypto from 'crypto'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { LogbookEntry, LogbookEntryType, SiteBuildingInfo } from '@/lib/types/database'
import type { BuildingInfoValues } from '@/app/(dashboard)/dashboard/sites/[id]/logbook-actions'
import { LOGBOOK_ENTRY_TYPES } from '@/lib/logbook'

const COOKIE_PREFIX = 'lb_access_'
// Access session lifetime: 8 hours.
const MAX_AGE_SECONDS = 60 * 60 * 8
// Roles that always bypass the log book password (mirrors the DB is_staff()).
const STAFF_ROLES = ['admin', 'office', 'engineer']

// Derived from the shared catalog so occupier/staff/portal stay in sync.
const VALID_ENTRY_TYPES: LogbookEntryType[] = LOGBOOK_ENTRY_TYPES.map((t) => t.value)

/** Server-only secret used to sign access cookies and hash passwords. */
function signingSecret(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'pyrocel-logbook-fallback-secret'
}

/** Hash a log book password as `salt:hash` using scrypt. Never stores plaintext. */
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

/** Verify a candidate password against a stored `salt:hash` value. */
function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const candidate = crypto.scryptSync(password, salt, 64).toString('hex')
  if (candidate.length !== hash.length) return false
  return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(hash))
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

/** Is the current visitor a logged-in Pyrocel staff member? (bypasses password) */
export async function isStaffVisitor(): Promise<boolean> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return false
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    const role = (profile as { role: string } | null)?.role
    return !!role && STAFF_ROLES.includes(role)
  } catch {
    return false
  }
}

/**
 * Can the current visitor view this site's log book?
 *  - open when the site has no password set, OR
 *  - the visitor is logged-in Pyrocel staff, OR
 *  - a valid signed unlock cookie is present.
 */
export async function hasLogbookAccess(siteId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data: site } = await admin
    .from('sites')
    .select('logbook_password_hash')
    .eq('id', siteId)
    .maybeSingle()

  // No password → open access.
  if (!site || !(site as { logbook_password_hash: string | null }).logbook_password_hash) {
    return true
  }
  // Staff always bypass.
  if (await isStaffVisitor()) return true
  // Otherwise require a valid unlock cookie.
  const cookieStore = await cookies()
  const token = cookieStore.get(`${COOKIE_PREFIX}${siteId}`)?.value
  return verifyToken(siteId, token)
}

/** Does this site require a password to view its log book? */
export async function logbookRequiresPassword(siteId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data: site } = await admin
    .from('sites')
    .select('logbook_password_hash')
    .eq('id', siteId)
    .maybeSingle()
  return !!(site as { logbook_password_hash: string | null } | null)?.logbook_password_hash
}

/** Verify a submitted password and, on success, set a signed access cookie. */
export async function unlockLogbook(
  siteId: string,
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient()
  const { data: site, error } = await admin
    .from('sites')
    .select('id, logbook_password_hash')
    .eq('id', siteId)
    .single()

  if (error || !site) return { ok: false, error: 'Site not found.' }
  const stored = (site as { logbook_password_hash: string | null }).logbook_password_hash
  if (!stored) return { ok: true } // no password → already open
  if (!verifyPassword(password, stored)) {
    return { ok: false, error: 'Incorrect password. Please try again.' }
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

/**
 * Set (or clear, when password is null/empty) the log book password. Allowed for
 * Pyrocel staff, or a client who already has access to this log book (open site
 * or valid unlock cookie). Passwords are hashed, never stored in plaintext.
 */
export async function setLogbookPassword(
  siteId: string,
  password: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const staff = await isStaffVisitor()
  if (!staff) {
    // Non-staff must already be able to see the log book to change protection.
    const cookieStore = await cookies()
    const token = cookieStore.get(`${COOKIE_PREFIX}${siteId}`)?.value
    const open = !(await logbookRequiresPassword(siteId))
    if (!open && !verifyToken(siteId, token)) {
      return { ok: false, error: 'You do not have permission to change this.' }
    }
  }

  const trimmed = (password ?? '').trim()
  if (trimmed && trimmed.length < 4) {
    return { ok: false, error: 'Password must be at least 4 characters.' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('sites')
    .update({
      logbook_password_hash: trimmed ? hashPassword(trimmed) : null,
      logbook_password_set_by: staff ? 'staff' : 'client',
      logbook_password_updated_at: new Date().toISOString(),
    })
    .eq('id', siteId)

  if (error) return { ok: false, error: 'Could not update the password. Please try again.' }

  // When removing the password, drop any stale unlock cookie so state is clean.
  if (!trimmed) {
    const cookieStore = await cookies()
    cookieStore.delete(`${COOKIE_PREFIX}${siteId}`)
  }
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
    return { ok: false, error: 'Your session has expired. Please re-enter the password.' }
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
    return { ok: false, error: 'Your session has expired. Please re-enter the password.' }
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
