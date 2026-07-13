import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { ChecklistEditor } from '@/components/dashboard/checklists/checklist-editor'
import type {
  Profile,
  ChecklistTemplate,
  ServiceType,
  ServiceVisitType,
  SystemType,
} from '@/lib/types/database'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ChecklistEditorPage({ params }: PageProps) {
  const { id } = await params
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

  const { data: checklist } = await supabase
    .from('checklist_templates')
    .select(`
      *,
      service_type:service_types(*)
    `)
    .eq('id', id)
    .single()

  if (!checklist) {
    notFound()
  }

  // Visit types for this service type, so the template can be scoped to a
  // specific visit (e.g. Annual vs Periodic) within a multi-visit service.
  const { data: visitTypes } = await supabase
    .from('service_visit_types')
    .select('*')
    .eq('service_type_id', checklist.service_type_id)
    .order('sort_order', { ascending: true })

  // All service types and system types, so the checklist can be assigned to
  // multiple service types and optionally scoped to specific systems.
  const [{ data: serviceTypes }, { data: systemTypes }] = await Promise.all([
    supabase.from('service_types').select('*').order('name', { ascending: true }),
    supabase.from('system_types').select('*').order('name', { ascending: true }),
  ])

  return (
    <div className="space-y-6">
      <ChecklistEditor 
        checklist={checklist as ChecklistTemplate & { service_type: ServiceType }} 
        visitTypes={(visitTypes || []) as ServiceVisitType[]}
        serviceTypes={(serviceTypes || []) as ServiceType[]}
        systemTypes={(systemTypes || []) as SystemType[]}
      />
    </div>
  )
}
