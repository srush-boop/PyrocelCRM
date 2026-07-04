import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ClientLoginsTable } from '@/components/dashboard/client-logins/client-logins-table'
import type { Profile, ClientLogin } from '@/lib/types/database'

export default async function ClientLoginsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile || (profile as Profile).role !== 'admin') {
    redirect('/dashboard')
  }

  const [{ data: clients }, { data: sites }, { data: logins }, { data: access }] =
    await Promise.all([
      supabase.from('clients').select('id, name, logo_url, login_tagline').order('name'),
      supabase.from('sites').select('id, name, client_id').order('name'),
      supabase
        .from('profiles')
        .select('*, clients(name)')
        .eq('role', 'client')
        .order('full_name'),
      supabase.from('client_site_access').select('profile_id, site_id'),
    ])

  // Group permitted site ids per login
  const siteIdsByProfile = new Map<string, string[]>()
  for (const row of access || []) {
    const list = siteIdsByProfile.get(row.profile_id) || []
    list.push(row.site_id)
    siteIdsByProfile.set(row.profile_id, list)
  }

  const clientLogins: ClientLogin[] = (logins || []).map((l: any) => ({
    ...l,
    client_name: l.clients?.name ?? null,
    site_ids: siteIdsByProfile.get(l.id) || [],
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Client Logins</h1>
        <p className="text-muted-foreground">
          Give clients read-only access to the service reports for their sites
        </p>
      </div>

      <ClientLoginsTable
        logins={clientLogins}
        clients={
          (clients as {
            id: string
            name: string
            logo_url: string | null
            login_tagline: string | null
          }[]) || []
        }
        sites={(sites as { id: string; name: string; client_id: string }[]) || []}
      />
    </div>
  )
}
