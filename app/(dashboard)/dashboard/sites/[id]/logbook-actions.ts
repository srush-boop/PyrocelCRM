'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { LogbookEntryType } from '@/lib/types/database'

const VALID_ENTRY_TYPES: LogbookEntryType[] = [
  'weekly_alarm_test',
  'monthly_emergency_light_test',
  'fire_drill',
  'false_alarm',
  'fault_defect',
  'note',
]

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
