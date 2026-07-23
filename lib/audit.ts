import 'server-only'
import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { clientIp } from '@/lib/rate-limit'

/**
 * Append-only security audit trail.
 *
 * Writes go through the service-role client so they bypass RLS and can't be
 * tampered with by ordinary sessions (the table has no INSERT policy). Reads
 * are admin-only via RLS. Logging must NEVER break the underlying operation, so
 * every failure here is swallowed and just logged to the server console.
 */

export type AuditAction =
  | 'user.create'
  | 'user.update'
  | 'user.delete'
  | 'user.role_change'
  | 'user.status_change'
  | 'user.password_reset'
  | 'user.permission_change'
  | 'auth.login'
  | 'auth.login_failed'
  | 'client_user.create'
  | 'client_user.update'
  | 'client_user.delete'

interface AuditInput {
  action: AuditAction
  /** The kind of thing acted on, e.g. 'profile', 'client_user'. */
  entityType?: string
  /** Id of the acted-on entity. */
  entityId?: string
  /** Human-readable label (e.g. the target's email or name) for the log view. */
  targetLabel?: string
  /** Arbitrary structured detail — what changed, old/new values, etc. */
  metadata?: Record<string, unknown>
  /** Explicit actor override. When omitted we resolve the current session user. */
  actor?: { id?: string | null; email?: string | null; role?: string | null }
  /** Pass the request so we can capture IP + user-agent. */
  request?: NextRequest
}

/**
 * Record a security-relevant event. Safe to await or fire-and-forget; it never
 * throws. Resolves the acting user from the session when not supplied.
 */
export async function logAudit(input: AuditInput): Promise<void> {
  try {
    let actorId = input.actor?.id ?? null
    let actorEmail = input.actor?.email ?? null
    let actorRole = input.actor?.role ?? null

    // Resolve the current session user when the caller didn't pass one.
    if (!actorId) {
      try {
        const supabase = await createClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (user) {
          actorId = user.id
          actorEmail = actorEmail ?? user.email ?? null
          if (!actorRole) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('role')
              .eq('id', user.id)
              .single()
            actorRole = profile?.role ?? null
          }
        }
      } catch {
        // No session context available (e.g. failed-login path) — that's fine.
      }
    }

    const admin = createAdminClient()
    await admin.from('audit_logs').insert({
      actor_id: actorId,
      actor_email: actorEmail,
      actor_role: actorRole,
      action: input.action,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      target_label: input.targetLabel ?? null,
      metadata: input.metadata ?? {},
      ip_address: input.request ? clientIp(input.request) : null,
      user_agent: input.request?.headers.get('user-agent') ?? null,
    })
  } catch (err) {
    console.error('[v0] audit log write failed:', err)
  }
}
