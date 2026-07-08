import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getBranchScope } from '@/lib/branches'
import { getCallsMapData } from './actions'
import { CallsMap } from '@/components/dashboard/schedule/calls-map'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import type { Profile } from '@/lib/types/database'

export const metadata = {
  title: 'Calls Map | Pyrocel',
  description:
    'Plot open unbooked calls and engineer activity to dispatch efficiently.',
}

export default async function CallsMapPage({
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
  const res = await getCallsMapData({ branchId: scope.activeBranchId })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" className="-ml-2 mb-1" asChild>
            <Link href="/dashboard/schedule">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Calls
            </Link>
          </Button>
          <h1 className="text-3xl font-bold tracking-tight text-balance">Calls Map</h1>
          <p className="text-muted-foreground text-pretty">
            Open unbooked calls and live engineer positions — find the closest free engineer, or the nearest work.
          </p>
        </div>
      </div>

      <CallsMap
        initialData={res.ok && res.data ? res.data : { calls: [], engineers: [], sites: [] }}
        branches={scope.branches}
        activeBranchId={scope.activeBranchId}
        canSwitchBranch={scope.canSwitch}
        loadError={res.ok ? null : res.error ?? 'Failed to load map data'}
      />
    </div>
  )
}
