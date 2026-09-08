import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ClipboardList } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/server'
import {
  getMyTasks,
  getOnDemandForms,
  getMyFormSubmissions,
  getPendingApprovals,
} from '@/lib/actions/internal-tasks'
import { getMyAssetChecks } from '@/lib/asset-checks'
import { TasksAndForms } from '@/components/dashboard/internal-tasks/tasks-and-forms'

export const metadata = {
  title: 'Tasks & Forms',
}

// Every signed-in user has a "Tasks & Forms" page: their recurring internal
// tasks (toolbox talks, vehicle checks), on-demand forms anyone can submit
// (uniform requests, expense claims), their own submissions, and — for
// approvers — an inbox of submissions awaiting a decision.
export default async function MyTasksPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [{ data: profile }, tasksRes, formsRes, submissionsRes, approvalsRes, assetChecks] =
    await Promise.all([
      supabase.from('profiles').select('role').eq('id', user.id).single(),
      getMyTasks(),
      getOnDemandForms(),
      getMyFormSubmissions(),
      getPendingApprovals(),
      getMyAssetChecks(),
    ])

  const role = (profile as { role?: string } | null)?.role
  const isManager = role === 'admin' || role === 'office'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tasks &amp; Forms</h1>
          <p className="text-muted-foreground">
            Complete the tasks assigned to you, submit forms, and review anything
            awaiting your approval.
          </p>
        </div>
        {isManager ? (
          <Button asChild variant="outline">
            <Link href="/dashboard/internal-tasks/submissions">
              <ClipboardList className="size-4" />
              All submissions
            </Link>
          </Button>
        ) : null}
      </div>

      {tasksRes.ok ? (
        <TasksAndForms
          tasks={tasksRes.instances ?? []}
          forms={formsRes.forms ?? []}
          submissions={submissionsRes.instances ?? []}
          approvals={approvalsRes.instances ?? []}
          assetChecks={assetChecks}
        />
      ) : (
        <p className="text-sm text-destructive">
          Could not load your tasks: {tasksRes.error}
        </p>
      )}
    </div>
  )
}
