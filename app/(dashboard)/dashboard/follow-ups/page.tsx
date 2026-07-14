import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Profile } from '@/lib/types/database'
import {
  FollowUpsReview,
  type FollowUpReviewRow,
  type HistoryEntry,
  type PartStock,
} from '@/components/dashboard/follow-ups/follow-ups-review'

export const dynamic = 'force-dynamic'

// The Follow-Ups review queue. Engineers raise a follow-up when a non-recurring
// call cannot be resolved on the day; office reviews it here (reserve/order the
// suggested parts, see the issue history), then approves it into a linked
// Planned Call. Office / admin only.
export default async function FollowUpsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  const role = (profile as Profile | null)?.role
  if (role !== 'admin' && role !== 'office') redirect('/dashboard')

  // Pending + recently-resolved requests (last 30 approved/rejected shown greyed).
  const { data: reqData } = await supabase
    .from('follow_up_requests')
    .select(
      `
      id, original_task_id, fix_attempt, issue_summary, ai_summary, status, proposed_date,
      assigned_engineer_id, escalated, escalated_at, resolved_at, created_at, created_task_id,
      site:sites(id, name),
      requested_by_profile:profiles!follow_up_requests_requested_by_fkey(id, full_name, email),
      original_task:tasks!follow_up_requests_original_task_id_fkey(
        id, is_emergency, completed_at, follow_up_to_id,
        service_type:service_types(name),
        task_result:task_results(reference_number, overall_status)
      ),
      parts:follow_up_parts(
        id, part_id, description, quantity, action, location_id, reservation_status, location_ref, notes,
        part:parts(id, name, sku, unit),
        location:stock_locations(id, name, kind)
      )
    `,
    )
    .order('created_at', { ascending: false })
    .limit(200)

  const requests = (reqData ?? []) as any[]

  // Engineers for assignment.
  const { data: engData } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('role', 'engineer')
    .order('full_name')
  const engineers = (engData ?? []).map((e: any) => ({
    id: e.id as string,
    name: (e.full_name as string) || (e.email as string),
  }))

  // Stock locations for the reserve picker.
  const { data: locData } = await supabase
    .from('stock_locations')
    .select('id, name, kind')
    .eq('is_active', true)
    .order('name')
  const locations = (locData ?? []).map((l: any) => ({
    id: l.id as string,
    name: l.name as string,
    kind: l.kind as string,
  }))

  // Stock availability for all suggested parts, grouped by part.
  const partIds = Array.from(
    new Set(
      requests
        .flatMap((r) => r.parts ?? [])
        .map((p: any) => p.part_id)
        .filter(Boolean),
    ),
  ) as string[]
  const stockByPart = new Map<string, PartStock[]>()
  if (partIds.length > 0) {
    const { data: stockData } = await supabase
      .from('stock_items')
      .select('part_id, quantity, location:stock_locations(id, name, kind)')
      .in('part_id', partIds)
    for (const row of (stockData ?? []) as any[]) {
      const loc = Array.isArray(row.location) ? row.location[0] : row.location
      if (!loc) continue
      const list = stockByPart.get(row.part_id) ?? []
      list.push({
        locationId: loc.id,
        locationName: loc.name,
        kind: loc.kind,
        quantity: row.quantity ?? 0,
      })
      stockByPart.set(row.part_id, list)
    }
  }

  // Build the issue-history chain for each request by walking follow_up_to_id
  // back from the original call. Cheap: batched, at most a few hops.
  const historyByRequest = new Map<string, HistoryEntry[]>()
  for (const r of requests) {
    const chain: HistoryEntry[] = []
    let currentId: string | null = r.original_task_id as string
    const seen = new Set<string>()
    let hops = 0
    while (currentId && !seen.has(currentId) && hops < 8) {
      seen.add(currentId)
      hops += 1
      const { data: tRow } = await supabase
        .from('tasks')
        .select(
          `id, scheduled_date, completed_at, follow_up_to_id, fix_attempt,
           assigned_engineer:profiles!tasks_assigned_engineer_id_fkey(full_name, email),
           service_type:service_types(name),
           task_result:task_results(reference_number, overall_status, engineer_notes)`,
        )
        .eq('id', currentId)
        .maybeSingle()
      const t = tRow as any
      if (!t) break
      const tr = Array.isArray(t.task_result) ? t.task_result[0] : t.task_result
      const eng = Array.isArray(t.assigned_engineer) ? t.assigned_engineer[0] : t.assigned_engineer
      const st = Array.isArray(t.service_type) ? t.service_type[0] : t.service_type
      chain.push({
        taskId: t.id,
        reference: tr?.reference_number ?? null,
        date: t.completed_at ?? t.scheduled_date ?? null,
        engineer: eng?.full_name || eng?.email || 'Unassigned',
        serviceName: st?.name ?? 'Call',
        outcome: tr?.overall_status ?? null,
        notes: tr?.engineer_notes ?? null,
        fixAttempt: t.fix_attempt ?? 1,
      })
      currentId = t.follow_up_to_id as string | null
    }
    historyByRequest.set(r.id, chain)
  }

  const rows: FollowUpReviewRow[] = requests.map((r) => {
    const site = Array.isArray(r.site) ? r.site[0] : r.site
    const reqBy = Array.isArray(r.requested_by_profile)
      ? r.requested_by_profile[0]
      : r.requested_by_profile
    const orig = Array.isArray(r.original_task) ? r.original_task[0] : r.original_task
    const origResult = orig
      ? Array.isArray(orig.task_result)
        ? orig.task_result[0]
        : orig.task_result
      : null
    const origService = orig
      ? Array.isArray(orig.service_type)
        ? orig.service_type[0]
        : orig.service_type
      : null

    return {
      id: r.id,
      fixAttempt: r.fix_attempt,
      issueSummary: r.issue_summary,
      aiSummary: r.ai_summary ?? null,
      status: r.status,
      escalated: r.escalated,
      resolvedAt: r.resolved_at,
      createdAt: r.created_at,
      proposedDate: r.proposed_date,
      assignedEngineerId: r.assigned_engineer_id,
      createdTaskId: r.created_task_id,
      siteName: site?.name ?? 'Unknown site',
      requestedByName: reqBy?.full_name || reqBy?.email || 'Engineer',
      originalRef: origResult?.reference_number ?? null,
      originalServiceName: origService?.name ?? 'Call',
      originalCompletedAt: orig?.completed_at ?? null,
      isEmergency: !!orig?.is_emergency,
      history: historyByRequest.get(r.id) ?? [],
      parts: (r.parts ?? []).map((p: any) => {
        const part = Array.isArray(p.part) ? p.part[0] : p.part
        const loc = Array.isArray(p.location) ? p.location[0] : p.location
        return {
          id: p.id,
          partId: p.part_id,
          name: part?.name ?? p.description ?? 'Part',
          sku: part?.sku ?? null,
          description: p.description,
          quantity: p.quantity,
          action: p.action,
          locationId: p.location_id,
          locationName: loc?.name ?? null,
          reservationStatus: p.reservation_status,
          locationRef: p.location_ref,
          stock: p.part_id ? stockByPart.get(p.part_id) ?? [] : [],
        }
      }),
    }
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Follow-ups</h1>
        <p className="text-muted-foreground">
          Review works flagged by engineers as unresolved. Reserve or order parts, then approve to
          book a linked Planned Call.
        </p>
      </div>
      <FollowUpsReview rows={rows} engineers={engineers} locations={locations} />
    </div>
  )
}
