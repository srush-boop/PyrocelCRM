import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types/database'
import { AuditLogView } from '@/components/dashboard/audit-log/audit-log-view'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 100

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; q?: string }>
}) {
  const { action, q } = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  // Admin-only surface. Anyone else is bounced to the dashboard.
  if ((profile as Pick<Profile, 'role'> | null)?.role !== 'admin') {
    redirect('/dashboard')
  }

  let query = supabase
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE)

  if (action && action !== 'all') query = query.eq('action', action)
  if (q && q.trim()) {
    const term = `%${q.trim()}%`
    query = query.or(
      `actor_email.ilike.${term},target_label.ilike.${term},entity_id.ilike.${term}`,
    )
  }

  const { data: logs } = await query

  // Distinct action list for the filter dropdown (small enum-like set).
  const { data: actionRows } = await supabase
    .from('audit_logs')
    .select('action')
    .limit(1000)
  const actions = Array.from(
    new Set((actionRows ?? []).map((r) => (r as { action: string }).action)),
  ).sort()

  return (
    <AuditLogView
      logs={logs ?? []}
      actions={actions}
      pageSize={PAGE_SIZE}
      activeAction={action ?? 'all'}
      query={q ?? ''}
    />
  )
}
