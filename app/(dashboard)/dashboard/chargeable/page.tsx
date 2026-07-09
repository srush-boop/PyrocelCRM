import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ChargeableCallsTable, type ChargeableCall } from '@/components/dashboard/chargeable/chargeable-calls-table'
import type { Profile } from '@/lib/types/database'

export const dynamic = 'force-dynamic'

// The Chargeable Calls review queue. Completed calls become chargeable
// automatically (service-type default OR parts used) and land here for office/
// admin to review before they feed future invoicing. Managers only.
export default async function ChargeableCallsPage() {
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

  const { data } = await supabase
    .from('tasks')
    .select(
      `
      id,
      reference_number,
      completed_at,
      chargeable,
      charge_review_status,
      charge_reason,
      charge_reviewed_at,
      assigned_engineer:profiles!tasks_assigned_engineer_id_fkey(id, full_name, email),
      reviewer:profiles!tasks_charge_reviewed_by_fkey(id, full_name, email),
      direct_site:sites!tasks_site_id_fkey(id, name, client_id, clients(id, name)),
      site_service:site_services(
        id,
        sites(id, name, client_id, clients(id, name)),
        service_type:service_types(id, name)
      ),
      call_parts(quantity, unit_cost_pence)
    `,
    )
    .eq('status', 'completed')
    .eq('chargeable', true)
    .order('completed_at', { ascending: false })
    .limit(500)

  const rows: ChargeableCall[] = (data ?? []).map((t: any) => {
    const site = t.site_service?.sites || t.direct_site
    const partsTotalPence = (t.call_parts ?? []).reduce(
      (sum: number, p: { quantity: number | null; unit_cost_pence: number | null }) =>
        sum + (p.quantity ?? 0) * (p.unit_cost_pence ?? 0),
      0,
    )
    return {
      id: t.id,
      referenceNumber: t.reference_number || '-',
      completedAt: t.completed_at,
      chargeReviewStatus: t.charge_review_status,
      chargeReason: t.charge_reason,
      chargeReviewedAt: t.charge_reviewed_at,
      siteName: site?.name || 'Unknown site',
      clientName: site?.clients?.name || '',
      serviceName: t.site_service?.service_type?.name || 'Ad-hoc / reactive',
      engineerName: t.assigned_engineer?.full_name || t.assigned_engineer?.email || 'Unassigned',
      reviewerName: t.reviewer?.full_name || t.reviewer?.email || null,
      partsCount: (t.call_parts ?? []).length,
      partsTotalPence,
    }
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Chargeable Calls</h1>
        <p className="text-muted-foreground">
          Completed calls deemed chargeable (from the service type or parts used). Review each before
          it&apos;s passed for invoicing.
        </p>
      </div>

      <ChargeableCallsTable calls={rows} />
    </div>
  )
}
