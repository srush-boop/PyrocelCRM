import { redirect } from 'next/navigation'
import { getAuthContext } from '@/lib/auth'
import { RamsList } from '@/components/rams/rams-list'

export const dynamic = 'force-dynamic'

export default async function RamsPage() {
  const { supabase, user, profile } = await getAuthContext()
  if (!user || !profile) redirect('/auth/login')

  const { data: docs } = await supabase
    .from('rams_documents')
    .select(
      'id, rams_number, title, status, revision, work_location, planned_start_date, created_at, updated_at, client_id, prepared_by',
    )
    .eq('is_current_revision', true)
    .order('created_at', { ascending: false })

  const documents = docs ?? []

  // Resolve client + preparer display names in a couple of batched lookups.
  const clientIds = [...new Set(documents.map((d) => d.client_id).filter(Boolean))] as string[]
  const preparerIds = [...new Set(documents.map((d) => d.prepared_by).filter(Boolean))] as string[]

  const [{ data: clients }, { data: preparers }] = await Promise.all([
    clientIds.length
      ? supabase.from('clients').select('id, name').in('id', clientIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    preparerIds.length
      ? supabase.from('profiles').select('id, full_name').in('id', preparerIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
  ])

  const clientMap = new Map((clients ?? []).map((c) => [c.id, c.name]))
  const preparerMap = new Map((preparers ?? []).map((p) => [p.id, p.full_name]))

  const enriched = documents.map((d) => ({
    ...d,
    client_name: d.client_id ? clientMap.get(d.client_id) ?? null : null,
    prepared_by_name: d.prepared_by ? preparerMap.get(d.prepared_by) ?? null : null,
  }))

  const canManage = ['admin', 'office', 'engineer'].includes(profile.role)

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          Risk Assessments &amp; Method Statements
        </h1>
        <p className="text-sm text-muted-foreground">
          Create, review, and issue RAMS documents for planned works.
        </p>
      </div>
      {/* Enriched rows carry extra display fields the list renders. */}
      <RamsList documents={enriched as never} canManage={canManage} />
    </div>
  )
}
