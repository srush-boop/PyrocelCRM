import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ChargeableCallsTable, type ChargeableCall } from '@/components/dashboard/chargeable/chargeable-calls-table'
import { getGlobalConfig } from '@/lib/actions/global-config'
import { getSavedGridViews, getSharedGridViews } from '@/lib/actions/grid-views'
import type { Profile, PurchaseOrderRequest } from '@/lib/types/database'

export const dynamic = 'force-dynamic'

// The Chargeable Calls review queue. Completed calls become chargeable
// automatically (service-type default OR parts used) and land here for office/
// admin to review before they are passed for invoicing. Managers only.
export default async function ChargeableCallsPage({
  searchParams,
}: {
  searchParams: Promise<{ review?: string }>
}) {
  const { review: reviewTaskId } = await searchParams
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
  if (role !== 'admin' && role !== 'office') {
    redirect('/dashboard')
  }

  // Load the configurable overdue threshold (default 14 days).
  const overdueAfterDays =
    (await getGlobalConfig<number>('po_request_overdue_days')) ?? 14

  const { data } = await supabase
    .from('tasks')
    .select(
      `
      id,
      completed_at,
      respond_by,
      chargeable,
      charge_review_status,
      charge_reason,
      charge_reviewed_at,
      charge_invoiced_at,
      client_ref,
      deadline_failed_reason,
      deadline_failed_note,
      po_not_required,
      po_auto_authorised,
      task_result:task_results(reference_number, engineer_notes),
      assigned_engineer:profiles!tasks_assigned_engineer_id_fkey(id, full_name, email),
      reviewer:profiles!tasks_charge_reviewed_by_fkey(id, full_name, email),
      direct_site:sites!tasks_site_id_fkey(id, name, contact_email, client_id, clients(id, name, contact_email, requires_po)),
      site_service:site_services(
        id,
        sites(id, name, contact_email, client_id, clients(id, name, contact_email, requires_po)),
        service_type:service_types(id, name),
        site_system:site_systems(id, name, panels:system_panels(name))
      ),
      call_parts(quantity, unit_cost_pence, sale_unit_price_pence),
      follow_ups:follow_up_requests!follow_up_requests_original_task_id_fkey(id, status),
      po_requests(
        id, task_id, requested_by, note, email_sent_at, email_sent_to,
        special_note, po_number, authorised_by_name, authorised_at,
        authorisation_token, created_at, updated_at,
        requester:profiles!po_requests_requested_by_fkey(full_name, email)
      )
    `,
    )
    .eq('status', 'completed')
    .eq('chargeable', true)
    .order('completed_at', { ascending: false })
    .limit(500)

  const rows: ChargeableCall[] = (data ?? []).map((t: any) => {
    // site_service is a one-to-many embed — Supabase returns an array
    const siteServiceRow = Array.isArray(t.site_service) ? t.site_service[0] : t.site_service
    const site = siteServiceRow?.sites || t.direct_site
    const client = site?.clients
    // "Total to be invoiced" uses the sale price where set, falling back to cost.
    const partsTotalPence = (t.call_parts ?? []).reduce(
      (sum: number, p: { quantity: number | null; unit_cost_pence: number | null; sale_unit_price_pence: number | null }) =>
        sum + (p.quantity ?? 0) * (p.sale_unit_price_pence ?? p.unit_cost_pence ?? 0),
      0,
    )

    const hasContactEmail = !!(site?.contact_email || client?.contact_email)

    // Sort PO requests oldest → newest for display
    const poRequests: PurchaseOrderRequest[] = (t.po_requests ?? []).sort(
      (a: PurchaseOrderRequest, b: PurchaseOrderRequest) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    )

    // ---- Derived review facts (mirror computeGates on the server) ----
    const missedDeadline =
      !!t.respond_by && !!t.completed_at && new Date(t.completed_at) > new Date(t.respond_by)
    const clientRequiresPo = !!client?.requires_po
    const poRequired = clientRequiresPo && !t.po_not_required
    const hasAuthorisedPo = poRequests.some((r) => !!r.authorised_at)
    // A PO arrived (client authorised the link) but hasn't been applied/invoiced yet.
    const poReadyToReview =
      !t.charge_invoiced_at &&
      !(t.client_ref && String(t.client_ref).trim()) &&
      poRequests.some((r) => !!r.authorised_at)
    const followUpLogged = (t.follow_ups ?? []).length > 0

    const systemRow = siteServiceRow?.site_system
    const panelNames = ((systemRow?.panels ?? []) as { name: string }[])
      .map((p) => p.name)
      .filter(Boolean)

    return {
      id: t.id,
      referenceNumber:
        (Array.isArray(t.task_result)
          ? t.task_result[0]?.reference_number
          : t.task_result?.reference_number) || '-',
      completedAt: t.completed_at,
      respondBy: t.respond_by ?? null,
      chargeReviewStatus: t.charge_review_status,
      chargeReason: t.charge_reason,
      chargeReviewedAt: t.charge_reviewed_at,
      chargeInvoicedAt: t.charge_invoiced_at ?? null,
      chargeable: !!t.chargeable,
      clientRef: t.client_ref ?? null,
      deadlineFailedReason: t.deadline_failed_reason ?? null,
      deadlineFailedNote: t.deadline_failed_note ?? null,
      poNotRequired: !!t.po_not_required,
      poAutoAuthorised: !!t.po_auto_authorised,
      siteName: site?.name || 'Unknown site',
      clientName: client?.name || '',
      serviceName: siteServiceRow?.service_type?.name || 'Ad-hoc / reactive',
      systemName: systemRow?.name || null,
      panelName: panelNames.length > 0 ? panelNames.join(', ') : null,
      engineerName:
        t.assigned_engineer?.full_name ||
        t.assigned_engineer?.email ||
        'Unassigned',
      engineerNotes:
        (Array.isArray(t.task_result)
          ? t.task_result[0]?.engineer_notes
          : t.task_result?.engineer_notes) || null,
      reviewerName:
        t.reviewer?.full_name || t.reviewer?.email || null,
      partsCount: (t.call_parts ?? []).length,
      partsTotalPence,
      poRequests,
      hasContactEmail,
      overdueAfterDays,
      // derived
      missedDeadline,
      clientRequiresPo,
      poRequired,
      hasAuthorisedPo,
      poReadyToReview,
      followUpLogged,
    }
  })

  const [savedViews, sharedViews] = await Promise.all([
    getSavedGridViews('chargeable'),
    getSharedGridViews('chargeable'),
  ])

  return (
    <div className="space-y-6">
      <div className="no-print">
        <h1 className="text-3xl font-bold tracking-tight">Chargeable Calls</h1>
        <p className="text-muted-foreground">
          Completed calls deemed chargeable. Review, log PO requests, then mark invoiced once raised.
        </p>
      </div>

        <ChargeableCallsTable
          calls={rows}
          overdueAfterDays={overdueAfterDays}
          initialReviewId={reviewTaskId ?? null}
          savedViews={savedViews}
          sharedViews={sharedViews}
          currentUserId={user.id}
        />
    </div>
  )
}
