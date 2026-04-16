import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { ChecklistEditor } from '@/components/dashboard/checklists/checklist-editor'
import type { Profile, ChecklistTemplate, ServiceType } from '@/lib/types/database'

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

  return (
    <div className="space-y-6">
      <ChecklistEditor 
        checklist={checklist as ChecklistTemplate & { service_type: ServiceType }} 
      />
    </div>
  )
}
