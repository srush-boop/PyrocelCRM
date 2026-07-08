import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BranchFilter } from '@/components/dashboard/branch-filter'
import { JobsTable } from '@/components/dashboard/jobs/jobs-table'
import { getBranchScope } from '@/lib/branches'
import { getJobs } from '@/lib/jobs/queries'
import type { Profile } from '@/lib/types/database'

export const metadata = {
  title: 'All Jobs | Pyrocel',
  description: 'Every job in delivery, filterable by stage, status, PM and branch.',
}

export default async function JobsListPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || !['admin', 'office'].includes((profile as Profile).role)) {
    redirect('/dashboard')
  }

  const { branch } = await searchParams
  const scope = await getBranchScope(profile as Profile, branch)
  const jobs = await getJobs(supabase, scope.activeBranchId)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-balance">All Jobs</h1>
          <p className="text-muted-foreground">
            Won work in delivery. Jobs are created automatically when a quote is accepted.
          </p>
        </div>
        <BranchFilter branches={scope.branches} activeBranchId={scope.activeBranchId} />
      </div>

      <JobsTable jobs={jobs} />
    </div>
  )
}
