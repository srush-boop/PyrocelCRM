import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { RemMonTemplateManager } from '@/components/dashboard/sales/rem-mon-template-manager'
import type { Profile, RemMonFieldDef, RemMonLinkDef, SystemType } from '@/lib/types/database'

export const metadata = { title: 'Remote Monitoring | Pyrocel' }

export default async function RemMonTemplatePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || !['admin', 'office'].includes((profile as Profile).role)) {
    redirect('/dashboard')
  }

  // The section is scoped to the Remote Monitoring system type (code REM-MON).
  const { data: remMonType } = await supabase
    .from('system_types')
    .select('*')
    .eq('code', 'REM-MON')
    .maybeSingle()

  const [{ data: fields }, { data: links }] = await Promise.all([
    supabase.from('rem_mon_field_defs').select('*').order('position'),
    supabase.from('rem_mon_link_defs').select('*').order('position'),
  ])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Remote Monitoring</h1>
        <p className="text-muted-foreground text-pretty">
          Configure the master template for the Remote Monitoring section that appears on any site
          with a Remote Monitoring system. Add custom fields to capture (account numbers, receiver
          details, etc.) and link slots that each site fills in &mdash; either an online portal URL
          or a deep link to one of the site&apos;s own pages.
        </p>
      </div>
      <RemMonTemplateManager
        systemType={(remMonType as SystemType) ?? null}
        fields={(fields ?? []) as RemMonFieldDef[]}
        links={(links ?? []) as RemMonLinkDef[]}
      />
    </div>
  )
}
