import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAllSubmissions, getMonthlyCompletionReport } from '@/lib/actions/internal-tasks'
import { SubmissionsAdmin } from '@/components/dashboard/internal-tasks/submissions-admin'

export const metadata = {
  title: 'Task submissions',
}

// Manager-only workspace: every user's task/form submissions in one place, plus
// the monthly completion report. Gated to admin/office (quality managers).
export default async function SubmissionsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const role = (profile as { role?: string } | null)?.role
  if (role !== 'admin' && role !== 'office') redirect('/dashboard/my-tasks')

  const [subs, report] = await Promise.all([
    getAllSubmissions({}),
    getMonthlyCompletionReport(),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Task submissions</h1>
        <p className="text-muted-foreground">
          Every team member&apos;s submitted tasks and forms, plus the monthly
          completion report.
        </p>
      </div>

      <SubmissionsAdmin
        initialInstances={subs.instances ?? []}
        templates={subs.templates ?? []}
        users={subs.users ?? []}
        initialReport={report.report ?? null}
      />
    </div>
  )
}
