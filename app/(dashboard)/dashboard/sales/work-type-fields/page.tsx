import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { WorkTypeFieldsManager } from '@/components/dashboard/sales/work-type-fields-manager'
import type { Profile, WorkTypeField } from '@/lib/types/database'

export const metadata = { title: 'Work-type Fields | Pyrocel' }

export default async function WorkTypeFieldsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || !['admin', 'office'].includes((profile as Profile).role)) {
    redirect('/dashboard')
  }

  const { data: fields } = await supabase
    .from('work_type_fields')
    .select('*')
    .order('work_type')
    .order('position')

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Work-type Fields</h1>
        <p className="text-muted-foreground">
          Define the conditional &quot;IF&quot; questions that appear on a system based on its type
          of work. For example, an install might ask for cable type; supply only asks nothing.
        </p>
      </div>
      <WorkTypeFieldsManager fields={(fields ?? []) as WorkTypeField[]} />
    </div>
  )
}
