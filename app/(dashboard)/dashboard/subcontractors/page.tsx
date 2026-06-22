import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SubcontractorsTable } from '@/components/dashboard/subcontractors/subcontractors-table'
import { AddSubcontractorDialog } from '@/components/dashboard/subcontractors/add-subcontractor-dialog'
import type { Profile, Subcontractor } from '@/lib/types/database'

export default async function SubcontractorsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile || (profile as Profile).role === 'engineer') {
    redirect('/dashboard')
  }

  const [subsResult, subServicesResult] = await Promise.all([
    supabase.from('subcontractors').select('*').order('name'),
    supabase.from('site_services').select('subcontractor_id').not('subcontractor_id', 'is', null),
  ])

  const subcontractors = (subsResult.data || []) as Subcontractor[]

  const subServices = (subServicesResult.data || []) as { subcontractor_id: string }[]
  const countBySub = subServices.reduce<Record<string, number>>((acc, row) => {
    acc[row.subcontractor_id] = (acc[row.subcontractor_id] || 0) + 1
    return acc
  }, {})

  const subsWithCounts = subcontractors.map((sub) => ({
    ...sub,
    serviceCount: countBySub[sub.id] || 0,
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Sub-contractors</h1>
          <p className="text-muted-foreground">
            Manage external parties that deliver some of your services
          </p>
        </div>
        <AddSubcontractorDialog />
      </div>

      <SubcontractorsTable subcontractors={subsWithCounts} />
    </div>
  )
}
