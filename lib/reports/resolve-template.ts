import type { SupabaseClient } from '@supabase/supabase-js'
import type { ReportTemplate } from '@/lib/types/database'
import { resolveTemplate } from './layout'

/**
 * Load the effective report template for a service type: the service-specific
 * row merged over the company-wide default row (service_type_id IS NULL).
 *
 * Field-by-field the service-specific value wins, else the default's, else the
 * built-in fallback the report component applies for a null field. Works with
 * any client (session or service-role), so it is shared by every report loader
 * including the public token page.
 */
export async function fetchResolvedReportTemplate(
  supabase: SupabaseClient,
  serviceTypeId: string | null | undefined,
): Promise<ReportTemplate | null> {
  let query = supabase.from('report_templates').select('*')
  query = serviceTypeId
    ? query.or(`service_type_id.eq.${serviceTypeId},service_type_id.is.null`)
    : query.is('service_type_id', null)

  const { data } = await query
  const rows = (data ?? []) as ReportTemplate[]
  const specific = serviceTypeId
    ? (rows.find((r) => r.service_type_id === serviceTypeId) ?? null)
    : null
  const globalDefault = rows.find((r) => r.service_type_id === null) ?? null
  return resolveTemplate(specific, globalDefault)
}
