import type { SupabaseClient } from '@supabase/supabase-js'
import type { ServiceTypeChecklistEntry } from '@/components/dashboard/service-types/service-type-checklists-field'

// Persist the "Systems & checklists" entries of a non-recurring call type by
// syncing checklist_templates rows for the given service type:
// - entries without an id are inserted as new checklist stubs (empty items)
// - entries with an id have their name kept in sync
// - existing rows no longer present in `entries` are deleted
//
// Only templates scoped by system (system_type_id set) or the general fallback
// (system_type_id null) are managed here. Visit-type templates
// (visit_type_id set) belong to recurring services and are left untouched.
export async function syncServiceTypeChecklists(
  supabase: SupabaseClient,
  serviceTypeId: string,
  entries: ServiceTypeChecklistEntry[],
): Promise<{ error: string | null }> {
  // Current managed templates for this service type.
  const { data: existing, error: fetchError } = await supabase
    .from('checklist_templates')
    .select('id, system_type_id, visit_type_id')
    .eq('service_type_id', serviceTypeId)
    .is('visit_type_id', null)

  if (fetchError) return { error: fetchError.message }

  const keptIds = new Set(entries.map((e) => e.id).filter(Boolean) as string[])
  const toDelete = (existing ?? []).filter((row) => !keptIds.has(row.id)).map((row) => row.id)

  // Deletes first so a system freed up by a delete can be reused by an insert.
  if (toDelete.length > 0) {
    const { error } = await supabase.from('checklist_templates').delete().in('id', toDelete)
    if (error) return { error: error.message }
  }

  for (const entry of entries) {
    if (entry.id) {
      const { error } = await supabase
        .from('checklist_templates')
        .update({ name: entry.name, system_type_id: entry.system_type_id })
        .eq('id', entry.id)
      if (error) return { error: error.message }
    } else {
      const { error } = await supabase.from('checklist_templates').insert({
        service_type_id: serviceTypeId,
        system_type_id: entry.system_type_id,
        visit_type_id: null,
        name: entry.name,
        items: [],
      })
      if (error) return { error: error.message }
    }
  }

  return { error: null }
}
