import { notFound, redirect } from 'next/navigation'
import { getAuthContext } from '@/lib/auth'
import { RamsDetail } from '@/components/rams/rams-detail'
import type {
  RamsDocument,
  RamsEngineerConfirmation,
  RamsSignature,
  RamsRevisionSummary,
} from '@/lib/rams/types'

export const dynamic = 'force-dynamic'

export default async function RamsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { supabase, user, profile } = await getAuthContext()
  if (!user || !profile) redirect('/auth/login')

  const { data: doc } = await supabase
    .from('rams_documents')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!doc) notFound()

  const [{ data: confirmations }, { data: signatures }] = await Promise.all([
    supabase
      .from('rams_engineer_confirmations')
      .select('*')
      .eq('rams_id', id),
    supabase
      .from('rams_signatures')
      .select('*')
      .eq('rams_id', id)
      .order('signed_at', { ascending: true }),
  ])

  // Resolve display names for client / site / preparer / approver.
  const [clientRes, siteRes, preparerRes, approverRes] = await Promise.all([
    doc.client_id
      ? supabase.from('clients').select('name').eq('id', doc.client_id).maybeSingle()
      : Promise.resolve({ data: null }),
    doc.site_id
      ? supabase.from('sites').select('name').eq('id', doc.site_id).maybeSingle()
      : Promise.resolve({ data: null }),
    doc.prepared_by
      ? supabase.from('profiles').select('full_name').eq('id', doc.prepared_by).maybeSingle()
      : Promise.resolve({ data: null }),
    doc.approved_by
      ? supabase.from('profiles').select('full_name').eq('id', doc.approved_by).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  // Full revision chain: every document sharing this lineage's root id, so the
  // detail view can show and link the complete R0 → Rn history.
  const rootId = (doc.parent_rams_id as string | null) ?? doc.id
  const { data: revisionRows } = await supabase
    .from('rams_documents')
    .select('id, revision, status, created_at, is_current_revision, revision_notes')
    .or(`id.eq.${rootId},parent_rams_id.eq.${rootId}`)
    .order('revision', { ascending: false })

  const canApprove = ['admin', 'office'].includes(profile.role)
  const canManage = ['admin', 'office', 'engineer'].includes(profile.role)

  return (
    <div className="p-4 md:p-6">
      <RamsDetail
        doc={doc as RamsDocument}
        revisionHistory={(revisionRows as RamsRevisionSummary[]) ?? []}
        clientName={(clientRes.data as { name?: string } | null)?.name ?? null}
        siteName={(siteRes.data as { name?: string } | null)?.name ?? null}
        preparedByName={(preparerRes.data as { full_name?: string } | null)?.full_name ?? null}
        approvedByName={(approverRes.data as { full_name?: string } | null)?.full_name ?? null}
        confirmations={(confirmations as RamsEngineerConfirmation[]) ?? []}
        signatures={(signatures as RamsSignature[]) ?? []}
        currentUserId={user.id}
        canApprove={canApprove}
        canManage={canManage}
      />
    </div>
  )
}
