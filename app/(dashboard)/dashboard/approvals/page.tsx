import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getVisibleLeaveRequests } from '@/lib/leave-approvals'
import { LeaveApprovals } from '@/components/dashboard/approvals/leave-approvals'
import { getReviewQueue, getProcessingQueue } from '@/lib/actions/timesheets'
import { TimesheetReview } from '@/components/dashboard/timesheets/timesheet-review'
import {
  getPendingApprovals,
  getDecidedApprovals,
  getMissedTaskEscalations,
} from '@/lib/actions/internal-tasks'
import { FormApprovals } from '@/components/dashboard/approvals/form-approvals'
import { MissedTaskEscalations } from '@/components/dashboard/approvals/missed-task-escalations'
import { getPurchaseInvoiceApprovals } from '@/lib/actions/purchase-invoices'
import { PurchaseInvoiceApprovals } from '@/components/dashboard/approvals/purchase-invoice-approvals'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'

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
    missedTasks,
  ] = await Promise.all([
    getVisibleLeaveRequests(),
    getReviewQueue(),
    getProcessingQueue(),
    getPendingApprovals(),
    getDecidedApprovals(),
    getPurchaseInvoiceApprovals(),
    getMissedTaskEscalations(),
  ])

  const hasTimesheets = approveQueue.length > 0 || processQueue.length > 0
  const formPendingItems = formPending.ok ? formPending.instances ?? [] : []
  const formDecidedItems = formDecided.ok ? formDecided.instances ?? [] : []
  const purchaseInvoiceItems = purchaseInvoiceApprovals.ok
    ? purchaseInvoiceApprovals.invoices ?? []
    : []
  const missedTaskItems = missedTasks.ok ? missedTasks.instances ?? [] : []
  const hasMissedTasks = missedTaskItems.length > 0

  // Each tab shows a badge with the number of items still awaiting action so it
  // is obvious where work is outstanding without opening every section.
  const leavePendingCount = pending.length
  const formPendingCount = formPendingItems.length
  // The action only returns invoices in the 'awaiting_approval' state.
  const purchaseInvoicePendingCount = purchaseInvoiceItems.length
  const timesheetPendingCount = approveQueue.length

  // Tab definitions, in display order. Missed-tasks and timesheets tabs only
  // appear when they have content (matching the previous conditional sections).
  const tabs = [
    { value: 'leave', label: 'Leave', count: leavePendingCount, show: true },
    { value: 'forms', label: 'Forms & Tasks', count: formPendingCount, show: true },
    {
      value: 'missed',
      label: 'Missed tasks',
      count: missedTaskItems.length,
      show: hasMissedTasks,
    },
    {
      value: 'purchase-invoices',
      label: 'Purchase invoices',
      count: purchaseInvoicePendingCount,
      show: true,
    },
    {
      value: 'timesheets',
      label: 'Timesheets',
      count: timesheetPendingCount,
      show: hasTimesheets,
    },
  ].filter((t) => t.show)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Approvals</h1>
        <p className="text-muted-foreground">
          Review and action leave requests, timesheets, and form &amp; task
          submissions from your team
        </p>
      </div>

      <Tabs defaultValue={tabs[0]?.value ?? 'leave'} className="space-y-6">
        <TabsList className="flex h-auto flex-wrap justify-start gap-1">
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="gap-2">
              {t.label}
              {t.count > 0 && (
                <Badge
                  variant="secondary"
                  className="h-5 min-w-5 justify-center px-1.5 text-xs"
                >
                  {t.count}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="leave">
          <LeaveApprovals pending={pending} decided={decided} />
        </TabsContent>

        <TabsContent value="forms">
          <FormApprovals pending={formPendingItems} decided={formDecidedItems} />
        </TabsContent>

        {hasMissedTasks && (
          <TabsContent value="missed">
            <MissedTaskEscalations instances={missedTaskItems} />
          </TabsContent>
        )}

        <TabsContent value="purchase-invoices">
          {purchaseInvoiceItems.length > 0 ? (
            <PurchaseInvoiceApprovals invoices={purchaseInvoiceItems} />
          ) : (
            <p className="text-sm text-muted-foreground">
              No purchase invoices awaiting approval.
            </p>
          )}
        </TabsContent>

        {hasTimesheets && (
          <TabsContent value="timesheets">
            <TimesheetReview approveQueue={approveQueue} processQueue={processQueue} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
