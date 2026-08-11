import type { SupabaseClient } from '@supabase/supabase-js'

// A remedial call is a task with is_remedial = true. It is "outstanding" while
// it still needs attending (pending or in progress); once completed/cancelled
// the automatic alert clears.
const OPEN_STATUSES = ['pending', 'in_progress'] as const

/**
 * Work out whether a site has any outstanding remedial calls, and which of its
 * services are affected. Used to derive the automatic "remedial works required"
 * pre-attendance alert at both site and service level.
 *
 * Accepts any Supabase client (server or admin).
 */
export async function getOpenRemedialForSite(
  supabase: SupabaseClient,
  siteId: string,
): Promise<{ siteOpen: boolean; serviceOpenIds: Set<string> }> {
  const { data } = await supabase
    .from('tasks')
    .select('site_service_id, site_service:site_services!inner(site_id)')
    .eq('is_remedial', true)
    .in('status', OPEN_STATUSES as unknown as string[])
    .eq('site_service.site_id', siteId)

  const serviceOpenIds = new Set<string>()
  for (const row of (data ?? []) as { site_service_id: string }[]) {
    if (row.site_service_id) serviceOpenIds.add(row.site_service_id)
  }
  return { siteOpen: serviceOpenIds.size > 0, serviceOpenIds }
}

// A part required for a remedial call, flattened for display.
export interface RemedialPart {
  id: string
  name: string
  sku: string | null
  unit: string | null
  quantity: number
}

// A single outstanding remedial call at a site, with everything the attending
// engineer needs to see it in one place: the works required (notes), the parts
// required, its reference, who (if anyone) currently owns it, and enough to
// link through / take ownership.
export interface OpenRemedialCall {
  id: string
  reference: string | null
  status: string
  scheduledDate: string | null
  worksDescription: string | null
  assignedEngineerId: string | null
  assignedEngineerName: string | null
  parts: RemedialPart[]
}

/**
 * Fetch the outstanding (pending / in-progress) remedial calls at a site, each
 * enriched with its works description, required parts and current owner. This
 * backs the single consolidated "Outstanding remedial" section shown on every
 * call at the site. `excludeTaskId` omits the call you're already viewing (so
 * the remedial call itself doesn't list itself).
 *
 * Accepts any Supabase client (server or admin). Never throws.
 */
export async function getOpenRemedialCallsForSite(
  supabase: SupabaseClient,
  siteId: string,
  excludeTaskId?: string,
): Promise<OpenRemedialCall[]> {
  try {
    // Remedial calls can be anchored either to a service (site_service.site_id)
    // or directly to the site (tasks.site_id) — cover both.
    const { data } = await supabase
      .from('tasks')
      .select(
        `id, reference_number, status, scheduled_date, notes, assigned_engineer_id, site_id,
         site_service:site_services(site_id),
         assigned_engineer:profiles!tasks_assigned_engineer_id_fkey(full_name),
         call_parts(quantity, part:parts(id, name, sku, unit))`,
      )
      .eq('is_remedial', true)
      .in('status', OPEN_STATUSES as unknown as string[])
      .order('scheduled_date', { ascending: true })

    type Row = {
      id: string
      reference_number: string | null
      status: string
      scheduled_date: string | null
      notes: string | null
      assigned_engineer_id: string | null
      site_id: string | null
      site_service: { site_id: string | null } | { site_id: string | null }[] | null
      assigned_engineer: { full_name: string | null } | { full_name: string | null }[] | null
      call_parts:
        | {
            quantity: number | null
            part: { id: string; name: string | null; sku: string | null; unit: string | null }
              | { id: string; name: string | null; sku: string | null; unit: string | null }[]
              | null
          }[]
        | null
    }

    const rows = (data ?? []) as Row[]
    const out: OpenRemedialCall[] = []
    for (const r of rows) {
      if (excludeTaskId && r.id === excludeTaskId) continue
      const svc = Array.isArray(r.site_service) ? r.site_service[0] : r.site_service
      const belongsToSite = r.site_id === siteId || svc?.site_id === siteId
      if (!belongsToSite) continue

      const eng = Array.isArray(r.assigned_engineer) ? r.assigned_engineer[0] : r.assigned_engineer
      const parts: RemedialPart[] = []
      for (const cp of r.call_parts ?? []) {
        const part = Array.isArray(cp.part) ? cp.part[0] : cp.part
        if (!part) continue
        parts.push({
          id: part.id,
          name: part.name ?? 'Part',
          sku: part.sku,
          unit: part.unit,
          quantity: cp.quantity ?? 1,
        })
      }

      out.push({
        id: r.id,
        reference: r.reference_number,
        status: r.status,
        scheduledDate: r.scheduled_date,
        worksDescription: r.notes,
        assignedEngineerId: r.assigned_engineer_id,
        assignedEngineerName: eng?.full_name ?? null,
        parts,
      })
    }
    return out
  } catch (err) {
    console.log(
      '[v0] getOpenRemedialCallsForSite failed:',
      err instanceof Error ? err.message : String(err),
    )
    return []
  }
}

// A quote line item, narrowed to the fields we import onto the remedial call.
interface QuoteLine {
  id: string
  catalogue_item_id: string | null
  service_type_id: string | null
  description: string | null
  detail: string | null
  quantity: number | null
  unit: string | null
  unit_price_pence: number | null
  line_total_pence: number | null
  unit_cost_pence: number | null
  product_code: string | null
  is_service: boolean | null
  is_optional: boolean | null
  client_selected: boolean | null
}

interface QuoteHeader {
  id: string
  quote_number: string | null
  reference: string | null
  title: string | null
  summary: string | null
  total_pence: number | null
}

function poundsFromPence(pence: number | null | undefined): string {
  return `£${((pence ?? 0) / 100).toFixed(2)}`
}

/**
 * Compose the remedial call's works description from the accepted quote: the
 * quote reference/title, its summary, the selected line items with their
 * charges, and the quoted total. This lands in tasks.notes so the attending
 * engineer sees exactly what was quoted and agreed.
 */
function buildRemedialNotes(quote: QuoteHeader, selected: QuoteLine[]): string {
  const ref = quote.reference || quote.quote_number || 'quote'
  const out: string[] = []
  out.push(`Remedial works from accepted quote ${ref}${quote.title ? `: ${quote.title}` : ''}.`)
  if (quote.summary?.trim()) out.push(quote.summary.trim())
  if (selected.length > 0) {
    out.push('', 'Works quoted:')
    for (const l of selected) {
      const qty = l.quantity ?? 1
      const amt = typeof l.line_total_pence === 'number' ? ` — ${poundsFromPence(l.line_total_pence)}` : ''
      out.push(`- ${qty > 1 ? `${qty}× ` : ''}${l.description ?? 'Item'}${amt}`)
    }
  }
  if (typeof quote.total_pence === 'number') {
    out.push('', `Quoted total: ${poundsFromPence(quote.total_pence)}`)
  }
  return out.join('\n')
}

/**
 * Resolve a stock `parts` row for a quoted catalogue item, creating one if none
 * exists yet. Quoted parts live in `quote_catalogue_items`, but a call attaches
 * parts from `parts`; `parts.catalogue_item_id` is UNIQUE, so we look up by it
 * first and otherwise create a stock part seeded from the catalogue item.
 */
async function resolveOrCreatePart(
  supabase: SupabaseClient,
  catalogueItemId: string,
  cat:
    | {
        name: string | null
        description: string | null
        default_unit: string | null
        unit_cost_pence: number | null
        product_code: string | null
      }
    | undefined,
  line: QuoteLine,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from('parts')
    .select('id')
    .eq('catalogue_item_id', catalogueItemId)
    .maybeSingle()
  if ((existing as { id: string } | null)?.id) return (existing as { id: string }).id

  if (!cat) return null

  const { data: created, error } = await supabase
    .from('parts')
    .insert({
      sku: cat.product_code || line.product_code || `REM-${String(catalogueItemId).slice(0, 8)}`,
      name: cat.name || line.description || 'Quoted part',
      description: cat.description ?? line.detail ?? null,
      unit: cat.default_unit || line.unit || 'each',
      unit_cost: (cat.unit_cost_pence ?? line.unit_cost_pence ?? 0) / 100,
      catalogue_item_id: catalogueItemId,
      is_active: true,
    })
    .select('id')
    .maybeSingle()

  if (error) {
    // Likely a race on the unique catalogue_item_id — re-fetch the winner.
    const { data: retry } = await supabase
      .from('parts')
      .select('id')
      .eq('catalogue_item_id', catalogueItemId)
      .maybeSingle()
    return (retry as { id: string } | null)?.id ?? null
  }
  return (created as { id: string } | null)?.id ?? null
}

/**
 * Import the quote's parts onto a remedial call as call_parts, resolving (or
 * creating) the stock part for each. Cost + sale price snapshots come straight
 * from the quote so the completed call bills at the quoted figures.
 */
async function importQuotedParts(
  supabase: SupabaseClient,
  taskId: string,
  partLines: QuoteLine[],
): Promise<void> {
  const catIds = [...new Set(partLines.map((l) => l.catalogue_item_id).filter(Boolean))] as string[]
  if (catIds.length === 0) return

  const { data: cats } = await supabase
    .from('quote_catalogue_items')
    .select('id, name, description, default_unit, unit_cost_pence, product_code')
    .in('id', catIds)
  const catById = new Map(
    ((cats ?? []) as Array<{
      id: string
      name: string | null
      description: string | null
      default_unit: string | null
      unit_cost_pence: number | null
      product_code: string | null
    }>).map((c) => [c.id, c]),
  )

  const rows: Record<string, unknown>[] = []
  for (const line of partLines) {
    if (!line.catalogue_item_id) continue
    const cat = catById.get(line.catalogue_item_id)
    const partId = await resolveOrCreatePart(supabase, line.catalogue_item_id, cat, line)
    if (!partId) continue
    rows.push({
      task_id: taskId,
      part_id: partId,
      quantity: line.quantity ?? 1,
      unit_cost_pence: line.unit_cost_pence ?? cat?.unit_cost_pence ?? null,
      sale_unit_price_pence: line.unit_price_pence ?? null,
      chargeable: true,
      charge_status: 'quoted',
      notes: 'Imported from accepted remedial quote',
      added_by: null,
    })
  }

  if (rows.length > 0) {
    const { error } = await supabase.from('call_parts').insert(rows)
    if (error) console.log('[v0] importQuotedParts insert error:', error.message)
  }
}

/**
 * When a remedial quote is accepted, raise remedial call(s) (scheduled tasks)
 * enriched from the quote:
 *  - one call per service the quote's linked defects relate to (service derived
 *    from each defect's originating inspection task), OR a single call anchored
 *    to the quote's site when there are no linked defects;
 *  - the works description + quoted charges copied into the call notes;
 *  - the call flagged chargeable, and the quoted parts imported as call_parts
 *    (creating stock parts as needed) onto the primary (first) call.
 *
 * Idempotent: it will not create a second remedial call for a service already
 * covered by this quote, nor a second fallback call. Accepts any Supabase client
 * (server or admin). Never throws — failures are logged so they don't block the
 * quote-acceptance flow.
 */
export async function createRemedialCallsForQuote(
  supabase: SupabaseClient,
  quoteId: string,
): Promise<{ created: number }> {
  try {
    const { data: quoteRow } = await supabase
      .from('quotes')
      .select('id, quote_number, reference, title, summary, total_pence, quote_type, site_id, client_id')
      .eq('id', quoteId)
      .maybeSingle()

    if (!quoteRow || quoteRow.quote_type !== 'remedial') return { created: 0 }
    const quote = quoteRow as QuoteHeader & { quote_type: string; site_id: string | null; client_id: string | null }

    // Existing remedial calls from this quote (idempotency across accept paths).
    const { data: existing } = await supabase
      .from('tasks')
      .select('id, site_service_id')
      .eq('source_quote_id', quoteId)
      .eq('is_remedial', true)
    const existingRows = (existing ?? []) as { id: string; site_service_id: string | null }[]
    const alreadyCovered = new Set(existingRows.map((t) => t.site_service_id).filter(Boolean))

    // Defects raised into this quote tell us which service(s) need remedial work.
    const { data: defects } = await supabase
      .from('defects')
      .select('id, task_id, task_result_id')
      .eq('quote_id', quoteId)

    // Resolve each defect's originating service via its task (falling back to the
    // task behind its task_result). Group defects by the service they map to.
    const serviceToDefect = new Map<string, string>()
    const taskIds = new Set<string>()
    const resultIds = new Set<string>()
    for (const d of (defects ?? []) as { id: string; task_id: string | null; task_result_id: string }[]) {
      if (d.task_id) taskIds.add(d.task_id)
      else if (d.task_result_id) resultIds.add(d.task_result_id)
    }

    const taskToService = new Map<string, string>()
    if (taskIds.size > 0) {
      const { data: taskRows } = await supabase
        .from('tasks')
        .select('id, site_service_id')
        .in('id', [...taskIds])
      for (const t of (taskRows ?? []) as { id: string; site_service_id: string }[]) {
        if (t.site_service_id) taskToService.set(t.id, t.site_service_id)
      }
    }

    const resultToService = new Map<string, string>()
    if (resultIds.size > 0) {
      const { data: resultRows } = await supabase
        .from('task_results')
        .select('id, task:tasks!inner(id, site_service_id)')
        .in('id', [...resultIds])
      for (const r of (resultRows ?? []) as {
        id: string
        task: { site_service_id: string } | { site_service_id: string }[]
      }[]) {
        const task = Array.isArray(r.task) ? r.task[0] : r.task
        if (task?.site_service_id) resultToService.set(r.id, task.site_service_id)
      }
    }

    for (const d of (defects ?? []) as { id: string; task_id: string | null; task_result_id: string }[]) {
      const serviceId = d.task_id ? taskToService.get(d.task_id) : resultToService.get(d.task_result_id)
      if (serviceId && !serviceToDefect.has(serviceId)) serviceToDefect.set(serviceId, d.id)
    }

    // Quote line items → works description + parts to import.
    const { data: lineRows } = await supabase
      .from('quote_line_items')
      .select(
        'id, catalogue_item_id, service_type_id, description, detail, quantity, unit, unit_price_pence, line_total_pence, unit_cost_pence, product_code, is_service, is_optional, client_selected',
      )
      .eq('quote_id', quoteId)
      .order('position')
    const lines = (lineRows ?? []) as QuoteLine[]
    // Include mandatory lines and any optional line the client actually selected.
    const selected = lines.filter((l) => !l.is_optional || l.client_selected)
    const partLines = selected.filter(
      (l) => l.is_service === false && !!l.catalogue_item_id && (l.quantity ?? 0) > 0,
    )
    const notes = buildRemedialNotes(quote, selected)

    const today = new Date().toISOString().slice(0, 10)
    const baseRow = {
      client_id: quote.client_id ?? null,
      scheduled_date: today,
      status: 'pending' as const,
      is_remedial: true,
      source_quote_id: quoteId,
      chargeable: true,
      charge_reason: 'manual',
      notes,
    }

    let rows: Record<string, unknown>[]
    if (serviceToDefect.size > 0) {
      // One call per affected service (skipping any already covered).
      rows = [...serviceToDefect.entries()]
        .filter(([serviceId]) => !alreadyCovered.has(serviceId))
        .map(([serviceId, defectId]) => ({
          ...baseRow,
          site_service_id: serviceId,
          source_defect_id: defectId,
        }))
    } else {
      // No linked defects → a single call anchored to the quote's site. Skip if a
      // call already exists for this quote, or the quote has no site to anchor to.
      if (existingRows.length > 0 || !quote.site_id) return { created: 0 }
      rows = [
        {
          ...baseRow,
          site_id: quote.site_id,
          service_type_id: selected.find((l) => l.service_type_id)?.service_type_id ?? null,
        },
      ]
    }

    if (rows.length === 0) return { created: 0 }

    const { data: inserted, error } = await supabase.from('tasks').insert(rows).select('id')
    if (error) {
      console.log('[v0] createRemedialCallsForQuote insert error:', error.message)
      return { created: 0 }
    }

    // Import the quoted parts onto the primary (first) created call.
    const primaryId = (inserted as { id: string }[] | null)?.[0]?.id
    if (primaryId && partLines.length > 0) {
      await importQuotedParts(supabase, primaryId, partLines)
    }

    return { created: rows.length }
  } catch (err) {
    console.log(
      '[v0] createRemedialCallsForQuote failed:',
      err instanceof Error ? err.message : String(err),
    )
    return { created: 0 }
  }
}
