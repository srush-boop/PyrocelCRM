import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ServiceTypesTable } from '@/components/dashboard/service-types/service-types-table'
import { AddServiceTypeDialog } from '@/components/dashboard/service-types/add-service-type-dialog'
import type { Profile, ServiceType } from '@/lib/types/database'

export default async function ServiceTypesPage() {
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

  const { data: serviceTypes } = await supabase
    .from('service_types')
    .select('*')
    .order('name')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Service Types</h1>
          <p className="text-muted-foreground">
            Manage the types of services your company offers
          </p>
        </div>
        <AddServiceTypeDialog />
      </div>

      <ServiceTypesTable serviceTypes={(serviceTypes || []) as ServiceType[]} />
    </div>
  )
}
