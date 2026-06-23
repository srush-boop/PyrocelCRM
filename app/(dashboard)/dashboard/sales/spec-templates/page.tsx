import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SpecTemplatesManager } from '@/components/dashboard/sales/spec-templates-manager'
import type { Profile, ServiceType, SystemSpecTemplate } from '@/lib/types/database'

export const metadata = { title: 'Spec Templates | Pyrocel' }

export default async function SpecTemplatesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || !['admin', 'office'].includes((profile as Profile).role)) {
    redirect('/dashboard')
  }

  const [{ data: serviceTypes }, { data: templates }] = await Promise.all([
    supabase.from('service_types').select('id, name, code').eq('status', 'live').order('name'),
    supabase.from('system_spec_templates').select('*'),
  ])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Specification Templates</h1>
        <p className="text-muted-foreground">
          Master specifications keyed by system (service type) and type of work. These pre-fill a
          system&apos;s specification when it is added to a quote, and remain editable per quote.
        </p>
      </div>
      <SpecTemplatesManager
        serviceTypes={(serviceTypes ?? []) as ServiceType[]}
        templates={(templates ?? []) as SystemSpecTemplate[]}
      />
    </div>
  )
}
