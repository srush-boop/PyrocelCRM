import type { SupabaseClient } from '@supabase/supabase-js'
import type { InvoiceLineItem } from '@/lib/types/database'

/**
 * Resolve the site name each invoice line relates to, via its linked call.
 *
 * A line's site is taken from the task's direct site first, falling back to the
 * site behind its `site_service`. Returns a map of line id → site name for the
 * lines that resolve to one (lines with no linked call are simply omitted).
 *
 * Shared by the PDF route, the email-invoice flow, and the on-screen review view
 * so every surface shows the same per-line site — including existing records.
 */
export async function resolveInvoiceLineSites(
  supabase: SupabaseClient,
  lines: Pick<InvoiceLineItem, 'id' | 'task_id'>[],
): Promise<Record<string, string>> {
  const taskIds = [...new Set(lines.map((l) => l.task_id).filter(Boolean))] as string[]
  if (taskIds.length === 0) return {}

  const { data: taskRows } = await supabase
    .from('tasks')
    .select(
      'id, direct_site:sites!tasks_site_id_fkey(name), site_service:site_services(sites(name))',
    )
    .in('id', taskIds)

  const siteByTask = new Map<string, string>()
  for (const t of (taskRows ?? []) as any[]) {
    const directSite = Array.isArray(t.direct_site) ? t.direct_site[0] : t.direct_site
    const ss = Array.isArray(t.site_service) ? t.site_service[0] : t.site_service
    const serviceSite = Array.isArray(ss?.sites) ? ss?.sites[0] : ss?.sites
    const siteName = directSite?.name || serviceSite?.name
    if (siteName) siteByTask.set(t.id, siteName)
  }

  const byLine: Record<string, string> = {}
  for (const l of lines) {
    if (l.task_id && siteByTask.has(l.task_id)) {
      byLine[l.id] = siteByTask.get(l.task_id) as string
    }
  }
  return byLine
}
