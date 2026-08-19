import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types/database'
import { AuditLogView } from '@/components/dashboard/audit-log/audit-log-view'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 200

interface AuditSearchParams {
  action?: string
  entity?: string
  actor?: string
  from?: string
  to?: string
  q?: string
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<AuditSearchParams>
}) {
  const { action, entity, actor, from, to, q } = await searchParams
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

  // Admin + office surface. Anyone else is bounced to the dashboard.
  const role = (profile as Pick<Profile, 'role'> | null)?.role
  if (role !== 'admin' && role !== 'office') {
    redirect('/dashboard')
  }

  let query = supabase
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE)

  // What was changed.
  if (action && action !== 'all') query = query.eq('action', action)
  // Where it was changed (entity type).
  if (entity && entity !== 'all') query = query.eq('entity_type', entity)
  // Which user made the change.
  if (actor && actor !== 'all') query = query.eq('actor_id', actor)
  // When it was changed — inclusive date range (yyyy-MM-dd, local dates).
  if (from) query = query.gte('created_at', `${from}T00:00:00`)
  if (to) query = query.lte('created_at', `${to}T23:59:59.999`)
  // Free-text across the human-readable columns.
  if (q && q.trim()) {
    const term = `%${q.trim()}%`
    query = query.or(
      `actor_email.ilike.${term},target_label.ilike.${term},entity_id.ilike.${term}`,
    )
  }

  const { data: logs } = await query

  // Build the distinct option lists for the filter dropdowns from a recent
  // window of rows (enum-like, small cardinality). Actor + action + entity.
  const { data: optionRows } = await supabase
    .from('audit_logs')
    .select('action, entity_type, actor_id, actor_email, actor_role')
    .order('created_at', { ascending: false })
    .limit(2000)

  const actions = Array.from(
    new Set((optionRows ?? []).map((r) => (r as { action: string }).action).filter(Boolean)),
  ).sort()

  const entities = Array.from(
    new Set(
      (optionRows ?? [])
        .map((r) => (r as { entity_type: string | null }).entity_type)
        .filter((e): e is string => Boolean(e)),
    ),
  ).sort()

  const actorMap = new Map<string, { id: string; email: string; role: string | null }>()
  for (const r of optionRows ?? []) {
    const row = r as { actor_id: string | null; actor_email: string | null; actor_role: string | null }
    if (row.actor_id && !actorMap.has(row.actor_id)) {
      actorMap.set(row.actor_id, {
        id: row.actor_id,
        email: row.actor_email ?? 'Unknown user',
        role: row.actor_role,
      })
    }
  }
  const actors = Array.from(actorMap.values()).sort((a, b) => a.email.localeCompare(b.email))

  return (
    <AuditLogView
      logs={logs ?? []}
      actions={actions}
      entities={entities}
      actors={actors}
      pageSize={PAGE_SIZE}
      activeAction={action ?? 'all'}
      activeEntity={entity ?? 'all'}
      activeActor={actor ?? 'all'}
      fromDate={from ?? ''}
      toDate={to ?? ''}
      query={q ?? ''}
    />
  )
}
