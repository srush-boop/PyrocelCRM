import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PanelFieldsManager } from '@/components/dashboard/sales/panel-fields-manager'
import type { Profile, PanelFieldDef, SystemType } from '@/lib/types/database'

export const metadata = { title: 'Panel Fields | Pyrocel' }

export default async function PanelFieldsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || !['admin', 'office'].includes((profile as Profile).role)) {
    redirect('/dashboard')
  }

  const [{ data: fields }, { data: systemTypes }] = await Promise.all([
    supabase.from('panel_field_defs').select('*').order('position'),
    supabase.from('system_types').select('*').eq('active', true).order('name'),
  ])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Panel Fields</h1>
        <p className="text-muted-foreground">
          Define the fields captured for each panel on a system. When a system type has panel
          fields, engineers and office staff can add panels to a site&apos;s system and record
          these details. Fire Alarm is pre-configured with common fields such as location,
          manufacturer, loops and zones.
        </p>
      </div>
      <PanelFieldsManager
        fields={(fields ?? []) as PanelFieldDef[]}
        systemTypes={(systemTypes ?? []) as SystemType[]}
      />
    </div>
  )
}
