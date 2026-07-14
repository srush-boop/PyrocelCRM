import type { SupabaseClient } from '@supabase/supabase-js'
import {
  deriveQuoteTypeFromSystems,
  isRoutineMaintenanceOnly,
  type SystemClassification,
} from '@/lib/sales'

export type AcceptedQuoteRoute = 'contract_review' | 'job'

/**
 * Decide whether an accepted quote should spawn a Contract Review draft
 * (Routine Maintenance) or a delivery Job (everything else), based on its
 * systems and their line-item content — NOT on the persisted quote_type, which
 * can be stale/wrong when a quote has a stray empty system.
 *
 * A quote routes to Contract Review only when every *meaningful* system (one
 * with at least one line item) is Routine Maintenance (SVC). This self-heals
 * quotes.quote_type to the correctly derived value so downstream display and
 * guards stay consistent.
 */
export async function classifyAcceptedQuote(
  supabase: SupabaseClient,
  quoteId: string,
): Promise<AcceptedQuoteRoute> {
  const { data: systems } = await supabase
    .from('quote_systems')
    .select('id, work_type')
    .eq('quote_id', quoteId)

  const systemRows = (systems ?? []) as { id: string; work_type: string | null }[]

  let classifications: SystemClassification[] = []
  if (systemRows.length > 0) {
    const { data: lines } = await supabase
      .from('quote_line_items')
      .select('system_id')
      .eq('quote_id', quoteId)

    const contentBySystem = new Set(
      ((lines ?? []) as { system_id: string | null }[])
        .map((l) => l.system_id)
        .filter((id): id is string => Boolean(id)),
    )

    classifications = systemRows.map((s) => ({
      work_type: s.work_type,
      hasContent: contentBySystem.has(s.id),
    }))
  }

  // Self-heal the persisted quote_type so the quote reads correctly everywhere.
  const derivedType = deriveQuoteTypeFromSystems(classifications)
  await supabase.from('quotes').update({ quote_type: derivedType }).eq('id', quoteId)

  return isRoutineMaintenanceOnly(classifications) ? 'contract_review' : 'job'
}
