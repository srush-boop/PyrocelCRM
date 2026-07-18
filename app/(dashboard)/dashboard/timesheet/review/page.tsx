import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getReviewQueue, getProcessingQueue } from '@/lib/actions/timesheets'
import { TimesheetReview } from '@/components/dashboard/timesheets/timesheet-review'

export const dynamic = 'force-dynamic'

export default async function TimesheetReviewPage() {
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
  const role = (profile as { role?: string } | null)?.role
  const isOfficeAdmin = role === 'admin' || role === 'office'

  // The queues are already scoped to the caller. Fetch them first, then decide
  // access: office/admin, anyone with direct reports (fallback approver), and
  // anyone nominated as approver/processor will have a non-empty queue or reports.
  const [approveQueue, processQueue] = await Promise.all([
    getReviewQueue(),
    getProcessingQueue(),
  ])

  const { count: reportCount } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('manager_id', user.id)

  // Is the user nominated as an approver/processor anywhere (so they should see
  // the page even when their queues are momentarily empty)?
  const arr = `{${user.id}}`
  const [{ count: userNom }, { count: roleNom }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .or(`timesheet_approver_ids.cs.${arr},timesheet_processor_ids.cs.${arr}`),
    supabase
      .from('roles')
      .select('id', { count: 'exact', head: true })
      .or(`timesheet_approver_ids.cs.${arr},timesheet_processor_ids.cs.${arr}`),
  ])

  const allowed =
    isOfficeAdmin ||
    (reportCount ?? 0) > 0 ||
    (userNom ?? 0) > 0 ||
    (roleNom ?? 0) > 0 ||
    approveQueue.length > 0 ||
    processQueue.length > 0
  if (!allowed) redirect('/dashboard')

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-balance">Timesheet review</h1>
        <p className="text-muted-foreground">
          Approve submitted timesheets, then process approved ones for payroll.
          Late submissions are flagged.
        </p>
      </header>
      <TimesheetReview approveQueue={approveQueue} processQueue={processQueue} />
    </div>
  )
}
