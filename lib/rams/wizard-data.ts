import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type {
  RamsMasterTemplate,
  RamsHazard,
  RamsSystemHazard,
  RamsEquipmentItem,
  SiteOption,
} from './types'

/**
 * Load the reference data the RAMS wizard needs (templates, hazard library,
 * system-specific hazards, and CRM clients/sites for linking). Shared by the
 * "new" and "edit" pages.
 */
export async function loadWizardData(): Promise<{
  templates: RamsMasterTemplate[]
  hazards: RamsHazard[]
  systemHazards: RamsSystemHazard[]
  equipmentLibrary: RamsEquipmentItem[]
  clients: { id: string; name: string }[]
  sites: SiteOption[]
}> {
  const supabase = await createClient()

  const [
    templatesRes,
    hazardsRes,
    systemHazardsRes,
    equipmentRes,
    clientsRes,
    sitesRes,
  ] = await Promise.all([
    supabase
      .from('rams_master_templates')
      .select('*')
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('rams_hazards')
      .select('*')
      .eq('is_active', true)
      .order('category'),
    supabase.from('rams_system_hazards').select('*'),
    supabase
      .from('rams_equipment_library')
      .select('*')
      .eq('is_active', true)
      .order('category')
      .order('name'),
    supabase.from('clients').select('id, name').order('name'),
    supabase
      .from('sites')
      .select('id, name, address, client_id, contact_email')
      .eq('status', 'live')
      .order('name'),
  ])

  return {
    templates: (templatesRes.data as RamsMasterTemplate[]) ?? [],
    hazards: (hazardsRes.data as RamsHazard[]) ?? [],
    systemHazards: (systemHazardsRes.data as RamsSystemHazard[]) ?? [],
    equipmentLibrary: (equipmentRes.data as RamsEquipmentItem[]) ?? [],
    clients: (clientsRes.data as { id: string; name: string }[]) ?? [],
    sites: (sitesRes.data as SiteOption[]) ?? [],
  }
}
