import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ClientsTable } from '@/components/dashboard/clients/clients-table'
import type { Client, Profile, Site } from '@/lib/types/database'

export default async function ClientsPage() {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'office'].includes((profile as Profile).role)) {
    redirect('/dashboard')
  }

  const { data: clients } = await supabase
    .from('clients')
    .select('*')
    .order('name')

  const { data: sites } = await supabase
    .from('sites')
    .select('id, name, address, status, client_id')
    .order('name')

  // Group sites by their client_id for the expandable rows
  const sitesByClient: Record<string, Site[]> = {}
  for (const site of (sites || []) as Site[]) {
    if (!site.client_id) continue
    if (!sitesByClient[site.client_id]) sitesByClient[site.client_id] = []
    sitesByClient[site.client_id].push(site)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Clients</h1>
        <p className="text-muted-foreground">
          Manage client companies and their contact information
        </p>
      </div>

      <Suspense fallback={null}>
        <ClientsTable
          clients={(clients || []) as Client[]}
          sitesByClient={sitesByClient}
        />
      </Suspense>
    </div>
  )
}
