import { redirect } from 'next/navigation'
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

  const [tasksRes, formsRes, submissionsRes, approvalsRes, assetChecks] = await Promise.all([
    getMyTasks(),
    getOnDemandForms(),
    getMyFormSubmissions(),
    getPendingApprovals(),
    getMyAssetChecks(),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Tasks &amp; Forms</h1>
        <p className="text-muted-foreground">
          Complete the tasks assigned to you, submit forms, and review anything
          awaiting your approval.
        </p>
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
