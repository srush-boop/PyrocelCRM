import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getReviewQueue } from '@/lib/actions/timesheets'
import { TimesheetReview } from '@/components/dashboard/timesheets/timesheet-review'

export const dynamic = 'force-dynamic'

export default async function TimesheetReviewPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Anyone who manages at least one direct report, or is office/admin, may
  // reach this page. The queue itself is already scoped in getReviewQueue.
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single()
  const role = (profile as { role?: string } | null)?.role
  const isOfficeAdmin = role === 'admin' || role === 'office'

  const { count: reportCount } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('manager_id', user.id)

  if (!isOfficeAdmin && (reportCount ?? 0) === 0) {
    redirect('/dashboard')
  }

  const queue = await getReviewQueue()

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-balance">Timesheet review</h1>
        <p className="text-muted-foreground">
          Approve submitted timesheets or return them for changes. Late
          submissions are flagged.
        </p>
      </header>
      <TimesheetReview initialQueue={queue} />
    </div>
  )
}
