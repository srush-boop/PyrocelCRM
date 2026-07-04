import type { SupabaseClient } from '@supabase/supabase-js'
import type { QuoteLineItem, QuoteSystem } from '@/lib/types/database'

// A catalogue item carries the official standard description and full spec text.
export interface SpecCatalogueItem {
  id: string
  product_code: string | null
  name: string
  description: string | null
}

export interface EquipmentSpecRow {
  id: string
  partNumber: string
  standardDescription: string
  specDetail: string
  quantity: number
  unit: string | null
}

export interface EquipmentSpecSection {
  system: QuoteSystem
  rows: EquipmentSpecRow[]
}

// Build the equipment specification sections for a quote: one section per
// system, listing its equipment (non-service) lines that map to a catalogue
// product. The official standard description + full spec text come from the
// catalogue, falling back to the quote line's own values when unmatched.
export function buildEquipmentSpecSections(
  systems: QuoteSystem[],
  lines: QuoteLineItem[],
  catalogue: SpecCatalogueItem[],
): EquipmentSpecSection[] {
  const byId = new Map(catalogue.map((c) => [c.id, c]))
  const byCode = new Map(
    catalogue.filter((c) => c.product_code).map((c) => [c.product_code as string, c]),
  )

  function resolveCatalogue(line: QuoteLineItem): SpecCatalogueItem | null {
    if (line.catalogue_item_id && byId.has(line.catalogue_item_id)) {
      return byId.get(line.catalogue_item_id) as SpecCatalogueItem
    }
    if (line.product_code && byCode.has(line.product_code)) {
      return byCode.get(line.product_code) as SpecCatalogueItem
    }
    return null
  }

  return systems
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((system) => {
      const rows = lines
        .filter((l) => l.system_id === system.id && !l.is_service)
        .filter((l) => l.product_code || l.catalogue_item_id)
        .sort((a, b) => a.position - b.position)
        .map((line) => {
          const cat = resolveCatalogue(line)
          return {
            id: line.id,
            partNumber: line.product_code || cat?.product_code || '—',
            standardDescription: cat?.name || line.description,
            specDetail: cat?.description ?? '',
            quantity: line.quantity,
            unit: line.unit,
          }
        })
      return { system, rows }
    })
    .filter((s) => s.rows.length > 0)
}

// Server-side: load the catalogue rows referenced by a quote's line items so
// their official part numbers + spec text can be surfaced. Accepts any Supabase
// client (server or admin). Returns an empty list when nothing matches.
export async function loadQuoteCatalogue(
  // Works with both the server and admin Supabase clients.
  supabase: SupabaseClient,
  lines: QuoteLineItem[],
): Promise<SpecCatalogueItem[]> {
  const catalogueIds = Array.from(
    new Set(lines.map((l) => l.catalogue_item_id).filter(Boolean) as string[]),
  )
  const productCodes = Array.from(
    new Set(lines.map((l) => l.product_code).filter(Boolean) as string[]),
  )
  if (catalogueIds.length === 0 && productCodes.length === 0) return []

  const filters: string[] = []
  if (catalogueIds.length > 0) filters.push(`id.in.(${catalogueIds.join(',')})`)
  if (productCodes.length > 0) {
    const quoted = productCodes.map((c) => `"${c.replace(/"/g, '')}"`).join(',')
    filters.push(`product_code.in.(${quoted})`)
  }

  const { data } = await supabase
    .from('quote_catalogue_items')
    .select('id, product_code, name, description')
    .or(filters.join(','))
  return (data ?? []) as SpecCatalogueItem[]
}
