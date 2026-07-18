import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getMyTasks } from '@/lib/actions/internal-tasks'
import { MyTasksList } from '@/components/dashboard/internal-tasks/my-tasks-list'

export const metadata = {
  title: 'Your Tasks',
}

// Every signed-in user has a "Your Tasks" page listing their recurring internal
// quality/management tasks (toolbox talks, vehicle checks, nominations, etc.).
export default async function MyTasksPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const result = await getMyTasks()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Your Tasks</h1>
        <p className="text-muted-foreground">
          Recurring internal tasks assigned to you — complete each before its deadline.
        </p>
      </div>

      {result.ok ? (
        <MyTasksList instances={result.instances ?? []} />
      ) : (
        <p className="text-sm text-destructive">
          Could not load your tasks: {result.error}
        </p>
      )}
    </div>
  )
}
