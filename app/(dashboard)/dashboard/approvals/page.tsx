import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getVisibleLeaveRequests } from '@/lib/leave-approvals'
import { LeaveApprovals } from '@/components/dashboard/approvals/leave-approvals'
import { getReviewQueue, getProcessingQueue } from '@/lib/actions/timesheets'
import { TimesheetReview } from '@/components/dashboard/timesheets/timesheet-review'

export const dynamic = 'force-dynamic'

export default async function ApprovalsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [{ pending, decided }, approveQueue, processQueue] = await Promise.all([
    getVisibleLeaveRequests(),
    getReviewQueue(),
    getProcessingQueue(),
  ])

  const hasTimesheets = approveQueue.length > 0 || processQueue.length > 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Approvals</h1>
        <p className="text-muted-foreground">
          Review and action annual leave requests and timesheets from your team
        </p>
      </div>
      <LeaveApprovals pending={pending} decided={decided} />

      {hasTimesheets && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">Timesheets</h2>
          <TimesheetReview approveQueue={approveQueue} processQueue={processQueue} />
        </section>
      )}
    </div>
  )
}
