import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ChecklistsTable } from '@/components/dashboard/checklists/checklists-table'
import { AddChecklistDialog } from '@/components/dashboard/checklists/add-checklist-dialog'
import type { Profile, ChecklistTemplate, ServiceType, ServiceVisitType, SystemType } from '@/lib/types/database'

export default async function ChecklistsPage() {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile || (profile as Profile).role !== 'admin') {
    redirect('/dashboard')
  }

  const [checklistsResult, serviceTypesResult] = await Promise.all([
    supabase
      .from('checklist_templates')
      .select(`
        *,
        service_type:service_types(*),
        visit_type:service_visit_types(*),
        system_type:system_types(*)
      `)
      .order('name'),
    supabase.from('service_types').select('*').order('name'),
  ])

  const checklists = (checklistsResult.data || []) as (ChecklistTemplate & {
    service_type: ServiceType
    visit_type: ServiceVisitType | null
    system_type: SystemType | null
  })[]
  const serviceTypes = (serviceTypesResult.data || []) as ServiceType[]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Checklist Templates</h1>
          <p className="text-muted-foreground">
            Create and manage inspection checklists for each service type
          </p>
        </div>
        <AddChecklistDialog serviceTypes={serviceTypes} />
      </div>

      <ChecklistsTable checklists={checklists} serviceTypes={serviceTypes} />
    </div>
  )
}
