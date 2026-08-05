import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getVisibleLeaveRequests } from '@/lib/leave-approvals'
import { LeaveApprovals } from '@/components/dashboard/approvals/leave-approvals'
import { getReviewQueue, getProcessingQueue } from '@/lib/actions/timesheets'
import { TimesheetReview } from '@/components/dashboard/timesheets/timesheet-review'
import { getPendingApprovals, getDecidedApprovals } from '@/lib/actions/internal-tasks'
import { FormApprovals } from '@/components/dashboard/approvals/form-approvals'
import { getPurchaseInvoiceApprovals } from '@/lib/actions/purchase-invoices'
import { PurchaseInvoiceApprovals } from '@/components/dashboard/approvals/purchase-invoice-approvals'

export const dynamic = 'force-dynamic'

export default async function ApprovalsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [
    { pending, decided },
    approveQueue,
    processQueue,
    formPending,
    formDecided,
    purchaseInvoiceApprovals,
  ] = await Promise.all([
    getVisibleLeaveRequests(),
    getReviewQueue(),
    getProcessingQueue(),
    getPendingApprovals(),
    getDecidedApprovals(),
    getPurchaseInvoiceApprovals(),
  ])

  const hasTimesheets = approveQueue.length > 0 || processQueue.length > 0
  const formPendingItems = formPending.ok ? formPending.instances ?? [] : []
  const formDecidedItems = formDecided.ok ? formDecided.instances ?? [] : []
  const purchaseInvoiceItems = purchaseInvoiceApprovals.ok
    ? purchaseInvoiceApprovals.invoices ?? []
    : []

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Approvals</h1>
        <p className="text-muted-foreground">
          Review and action leave requests, timesheets, and form &amp; task
          submissions from your team
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Leave</h2>
        <LeaveApprovals pending={pending} decided={decided} />
      </section>

      <FormApprovals pending={formPendingItems} decided={formDecidedItems} />

      <PurchaseInvoiceApprovals invoices={purchaseInvoiceItems} />

      {hasTimesheets && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">Timesheets</h2>
          <TimesheetReview approveQueue={approveQueue} processQueue={processQueue} />
        </section>
      )}
    </div>
  )
}
