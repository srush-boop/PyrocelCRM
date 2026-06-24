import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SystemMarginsManager } from '@/components/dashboard/sales/system-margins-manager'
import type {
  Profile,
  SystemType,
  SystemWorkTypeMargin,
  WorkTypeSetting,
} from '@/lib/types/database'

export const metadata = { title: 'Set Margins | Pyrocel' }

export default async function MarginsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || !['admin', 'office'].includes((profile as Profile).role)) {
    redirect('/dashboard')
  }

  const [{ data: systemTypes }, { data: margins }, { data: settings }] = await Promise.all([
    supabase.from('system_types').select('*').eq('active', true).order('name'),
    supabase.from('system_work_type_margins').select('*'),
    supabase.from('work_type_settings').select('*'),
  ])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Set Margins</h1>
        <p className="text-muted-foreground">
          Define the gross margin applied to each system type and type of work, and choose which
          work types include a design &amp; survey section.
        </p>
      </div>
      <SystemMarginsManager
        systemTypes={(systemTypes ?? []) as SystemType[]}
        margins={(margins ?? []) as SystemWorkTypeMargin[]}
        settings={(settings ?? []) as WorkTypeSetting[]}
      />
    </div>
  )
}
