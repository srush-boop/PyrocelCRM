'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { EmergencyContact, LogbookEntryType } from '@/lib/types/database'
import { LOGBOOK_ENTRY_TYPES } from '@/lib/logbook'

// Derived from the shared catalog so occupier/staff/portal stay in sync.
const VALID_ENTRY_TYPES: LogbookEntryType[] = LOGBOOK_ENTRY_TYPES.map((t) => t.value)

/** Add a log book entry from the staff dashboard (source = 'staff'). */
export async function addStaffLogbookEntry(
  siteId: string,
  values: {
    entry_type: string
    entry_date: string
    title: string
    details: string
    performed_by: string
  },
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated.' }

  if (!VALID_ENTRY_TYPES.includes(values.entry_type as LogbookEntryType)) {
    return { ok: false, error: 'Invalid entry type.' }
  }
  if (!values.entry_date) return { ok: false, error: 'A date is required.' }

  // RLS ensures only staff can insert.
  const { error } = await supabase.from('logbook_entries').insert({
    site_id: siteId,
    entry_type: values.entry_type,
    entry_date: values.entry_date,
    title: values.title || null,
    details: values.details || null,
    performed_by: values.performed_by || null,
    source: 'staff',
    created_by: user.id,
  })

  if (error) return { ok: false, error: 'Could not save entry. Please try again.' }

  revalidatePath(`/dashboard/sites/${siteId}`)
  return { ok: true }
}

export interface BuildingInfoValues {
  responsible_person_name: string
  responsible_person_role: string
  responsible_person_phone: string
  responsible_person_email: string
  competent_person_name: string
  competent_person_company: string
  competent_person_phone: string
  competent_person_email: string
  fra_location: string
  fra_last_date: string
  fra_next_date: string
  fra_assessor: string
  fra_notes: string
  emergency_contacts: EmergencyContact[]
}

/** Create or update the General Building Information for a site (staff only). */
export async function saveSiteBuildingInfo(
  siteId: string,
  values: BuildingInfoValues,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated.' }

  // Keep only fully-blank-free contacts and normalise to the stored shape.
  const contacts = (values.emergency_contacts || [])
    .map((c) => ({
      name: (c.name || '').trim(),
      role: (c.role || '').trim(),
      phone: (c.phone || '').trim(),
    }))
    .filter((c) => c.name || c.role || c.phone)

  // RLS ensures only staff can insert/update site_building_info.
  const { error } = await supabase.from('site_building_info').upsert(
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
      updated_by: user.id,
    },
    { onConflict: 'site_id' },
  )

  if (error) return { ok: false, error: 'Could not save building information. Please try again.' }

  revalidatePath(`/dashboard/sites/${siteId}`)
  return { ok: true }
}
