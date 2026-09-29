import type { SupabaseClient } from '@supabase/supabase-js'
import type { InvoiceLineItem } from '@/lib/types/database'

type LineForSite = Pick<InvoiceLineItem, 'id' | 'task_id' | 'job_id'> & {
  site_service_id?: string | null
}

const one = <T>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null)

/**
 * Resolve the site name each invoice line relates to.
 *
 * Resolution order per line: linked call (direct site, else its service's site)
 * → the line's recurring site_service → the line's job → the invoice's own
 * site. Returns line id → site name for every line that resolves.
 *
 * Shared by the PDF route, the email-invoice flow, and the on-screen review view
 * so every surface shows the same per-line site — including existing records.
 */
export async function resolveInvoiceLineSites(
  supabase: SupabaseClient,
  lines: LineForSite[],
  invoiceSiteId?: string | null,
): Promise<Record<string, string>> {
  const uniq = (ids: (string | null | undefined)[]) =>
    [...new Set(ids.filter(Boolean))] as string[]
  const taskIds = uniq(lines.map((l) => l.task_id))
  const serviceIds = uniq(lines.map((l) => l.site_service_id))
  const jobIds = uniq(lines.map((l) => l.job_id))

  const [taskRes, serviceRes, jobRes, invoiceSiteRes] = await Promise.all([
    taskIds.length
      ? supabase
          .from('tasks')
          .select(
            'id, direct_site:sites!tasks_site_id_fkey(name), site_service:site_services(sites(name))',
          )
          .in('id', taskIds)
      : Promise.resolve({ data: [] as any[] }),
    serviceIds.length
      ? supabase.from('site_services').select('id, sites(name)').in('id', serviceIds)
      : Promise.resolve({ data: [] as any[] }),
    jobIds.length
      ? supabase.from('jobs').select('id, site:sites(name)').in('id', jobIds)
      : Promise.resolve({ data: [] as any[] }),
    invoiceSiteId
      ? supabase.from('sites').select('name').eq('id', invoiceSiteId).maybeSingle()
      : Promise.resolve({ data: null as { name: string } | null }),
  ])

  const siteByTask = new Map<string, string>()
  for (const t of (taskRes.data ?? []) as any[]) {
    const ss = one(t.site_service) as any
    const name = one<any>(t.direct_site)?.name || one<any>(ss?.sites)?.name
    if (name) siteByTask.set(t.id, name)
  }
  const siteByService = new Map<string, string>()
  for (const s of (serviceRes.data ?? []) as any[]) {
    const name = one<any>(s.sites)?.name
    if (name) siteByService.set(s.id, name)
  }
  const siteByJob = new Map<string, string>()
  for (const j of (jobRes.data ?? []) as any[]) {
    const name = one<any>(j.site)?.name
    if (name) siteByJob.set(j.id, name)
  }
  const invoiceSiteName = (invoiceSiteRes.data as { name?: string } | null)?.name ?? null

  const byLine: Record<string, string> = {}
  for (const l of lines) {
    const name =
      (l.task_id && siteByTask.get(l.task_id)) ||
      (l.site_service_id && siteByService.get(l.site_service_id)) ||
      (l.job_id && siteByJob.get(l.job_id)) ||
      invoiceSiteName
    if (name) byLine[l.id] = name
  }
  return byLine
}
