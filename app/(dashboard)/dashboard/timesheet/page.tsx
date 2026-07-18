import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isTimesheetRequired } from '@/lib/types/database'
import { getOrBuildTimesheet } from '@/lib/actions/timesheets'
import { getOutstandingTasks } from '@/lib/actions/internal-tasks'
import { TimesheetView } from '@/components/dashboard/timesheets/timesheet-view'

export const dynamic = 'force-dynamic'

export default async function TimesheetPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, role_ref:roles ( timesheet_required )')
    .eq('id', user.id)
    .single()

  if (!profile || !isTimesheetRequired(profile)) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">Timesheets not enabled</h1>
        <p className="mt-2 text-muted-foreground">
          Timesheets are only available to team members whose role or profile
          requires them. If you think this is wrong, please contact the office.
        </p>
      </div>
    )
  }

  const [view, outstandingRes] = await Promise.all([
    getOrBuildTimesheet(),
    getOutstandingTasks(),
  ])
  const outstanding = outstandingRes.ok ? (outstandingRes.instances ?? []) : []

  if (!view.ok) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">Could not load timesheet</h1>
        <p className="mt-2 text-muted-foreground">{view.error}</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-balance">Your timesheet</h1>
        <p className="text-muted-foreground">
          Review your week, add any missing time, and submit for approval before
          Monday 09:00.
        </p>
      </header>
      <TimesheetView
        initial={{
          timesheet: view.timesheet,
          summary: view.summary,
          manualEntries: view.manualEntries,
          deadline: view.deadline,
          isLocked: view.isLocked,
          canEdit: view.canEdit,
        }}
        outstandingTasks={outstanding}
      />
    </div>
  )
}
