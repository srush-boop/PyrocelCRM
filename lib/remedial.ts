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

/**
 * When a remedial quote is accepted, raise a remedial call (scheduled task) for
 * each service the quote's defects relate to. The service is derived from each
 * linked defect's originating inspection task. Idempotent: it will not create a
 * second remedial call for a service already covered by this quote.
 *
 * Accepts any Supabase client (server or admin). Never throws — failures are
 * logged so they don't block the quote-acceptance flow.
 */
export async function createRemedialCallsForQuote(
  supabase: SupabaseClient,
  quoteId: string,
): Promise<{ created: number }> {
  try {
    const { data: quote } = await supabase
      .from('quotes')
      .select('id, quote_type, site_id, client_id')
      .eq('id', quoteId)
      .maybeSingle()

    if (!quote || quote.quote_type !== 'remedial') return { created: 0 }

    // Defects raised into this quote tell us which service(s) need remedial work.
    const { data: defects } = await supabase
      .from('defects')
      .select('id, task_id, task_result_id, site_id, client_id')
      .eq('quote_id', quoteId)

    if (!defects || defects.length === 0) return { created: 0 }

    // Resolve each defect's originating service via its task (falling back to the
    // task behind its task_result). Group defects by the service they map to.
    const serviceToDefect = new Map<string, string>()

    // Collect task ids to look up their site_service_id in one query.
    const taskIds = new Set<string>()
    const resultIds = new Set<string>()
    for (const d of defects as { id: string; task_id: string | null; task_result_id: string }[]) {
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
        taskToService.set(t.id, t.site_service_id)
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

    for (const d of defects as { id: string; task_id: string | null; task_result_id: string }[]) {
      const serviceId = d.task_id
        ? taskToService.get(d.task_id)
        : resultToService.get(d.task_result_id)
      if (serviceId && !serviceToDefect.has(serviceId)) {
        serviceToDefect.set(serviceId, d.id)
      }
    }

    if (serviceToDefect.size === 0) return { created: 0 }

    // Skip any service that already has a remedial call from this quote so the
    // action is safe to run more than once (staff + public acceptance, retries).
    const { data: existing } = await supabase
      .from('tasks')
      .select('site_service_id')
      .eq('source_quote_id', quoteId)
      .eq('is_remedial', true)
    const alreadyCovered = new Set(
      ((existing ?? []) as { site_service_id: string }[]).map((t) => t.site_service_id),
    )

    const today = new Date().toISOString().slice(0, 10)
    const rows = [...serviceToDefect.entries()]
      .filter(([serviceId]) => !alreadyCovered.has(serviceId))
      .map(([serviceId, defectId]) => ({
        site_service_id: serviceId,
        client_id: quote.client_id ?? null,
        scheduled_date: today,
        status: 'pending' as const,
        is_remedial: true,
        source_quote_id: quoteId,
        source_defect_id: defectId,
      }))

    if (rows.length === 0) return { created: 0 }

    const { error } = await supabase.from('tasks').insert(rows)
    if (error) {
      console.log('[v0] createRemedialCallsForQuote insert error:', error.message)
      return { created: 0 }
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
