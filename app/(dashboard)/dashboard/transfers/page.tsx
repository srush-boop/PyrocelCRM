import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TransfersList, type TransferRow } from '@/components/dashboard/nearby/transfers-list'

export default async function TransfersPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role === 'client') redirect('/dashboard')

  // RLS already restricts which rows are visible (office/admin see all; engineers
  // see their own requests + ones for calls assigned to them).
  const { data: requests } = await supabase
    .from('task_transfer_requests')
    .select(
      `id, status, message, created_at, requested_by, current_engineer_id, resolved_at,
       requester:profiles!task_transfer_requests_requested_by_fkey(id, full_name),
       current_engineer:profiles!task_transfer_requests_current_engineer_id_fkey(id, full_name),
       task:tasks(id, status, scheduled_date,
         site_service:site_services(
           service_type:service_types(name),
           site:sites(name, postcode, client:clients(name))
         )
       )`
    )
    .order('created_at', { ascending: false })

  const rows = (requests || []) as unknown as TransferRow[]
  const canApproveAll = profile.role === 'office' || profile.role === 'admin'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Call Transfers</h1>
        <p className="text-muted-foreground">
          Review engineer requests to take over calls.
        </p>
      </div>
      <TransfersList
        rows={rows}
        currentUserId={user.id}
        canApproveAll={canApproveAll}
      />
    </div>
  )
}
