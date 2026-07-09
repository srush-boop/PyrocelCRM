import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { RequestsInbox } from '@/components/dashboard/requests/requests-inbox'
import type {
  Profile,
  Site,
  ServiceType,
  SystemType,
  InboundRequest,
} from '@/lib/types/database'

export const dynamic = 'force-dynamic'

// AI-triaged inbound request inbox. Forwarded / pasted client emails are matched
// to an existing site/client/service and surfaced here with suggested actions a
// manager approves. Admin + office only.
export default async function RequestsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const role = (profile as Profile | null)?.role
  if (role !== 'admin' && role !== 'office') {
    redirect('/dashboard')
  }

  // Requests (flat) + the lookups needed to resolve matched names and to power
  // the approve-call dialog. Matched names are resolved client-side from these
  // lists to avoid ambiguous embeds.
  const [requestsResult, sitesResult, clientsResult, serviceTypesResult, systemTypesResult, engineersResult] =
    await Promise.all([
      supabase
        .from('inbound_requests')
        .select('*')
        .order('received_at', { ascending: false })
        .limit(500),
      supabase.from('sites').select('*').order('name'),
      supabase.from('clients').select('id, name').order('name'),
      supabase.from('service_types').select('*, system_type:system_types(*)').order('name'),
      supabase.from('system_types').select('*').order('name'),
      supabase.from('profiles').select('*').eq('role', 'engineer').order('full_name'),
    ])

  const requests = (requestsResult.data ?? []) as InboundRequest[]
  const sites = (sitesResult.data ?? []) as Site[]
  const clients = (clientsResult.data ?? []) as { id: string; name: string }[]
  const reactiveServiceTypes = ((serviceTypesResult.data ?? []) as ServiceType[]).filter(
    (st) => st.is_recurring === false && (st.status || 'live') !== 'dead',
  )
  const systemTypes = (systemTypesResult.data ?? []) as SystemType[]
  const engineers = (engineersResult.data ?? []) as Profile[]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Requests</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          Forwarded and pasted client emails, read by AI and matched to a site so you can action them
          in one click. Nothing is created until you approve it.
        </p>
      </div>

      <RequestsInbox
        requests={requests}
        sites={sites}
        clients={clients}
        reactiveServiceTypes={reactiveServiceTypes}
        systemTypes={systemTypes}
        engineers={engineers}
      />
    </div>
  )
}
