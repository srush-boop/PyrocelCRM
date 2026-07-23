import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit, clientIp } from '@/lib/rate-limit'
import { logAudit } from '@/lib/audit'

/** Ensure the caller is an authenticated admin. Returns an error response or null. */
async function requireAdmin() {
  const serverClient = await createClient()
  const {
    data: { user },
  } = await serverClient.auth.getUser()

  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorised.' }, { status: 401 }) }
  }

  const { data: callerProfile } = await serverClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!callerProfile || callerProfile.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Forbidden.' }, { status: 403 }) }
  }

  return { error: null }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const limited = await enforceRateLimit('auth', clientIp(req))
    if (limited) return limited
    const guard = await requireAdmin()
    if (guard.error) return guard.error

    const { id } = await params
    const { password, fullName, siteIds } = await req.json()
    const adminClient = createAdminClient()

    // Optional password reset
    if (password !== undefined && password !== null && password !== '') {
      if (typeof password !== 'string' || password.length < 12) {
        return NextResponse.json(
          { error: 'Password must be at least 12 characters.' },
          { status: 400 },
        )
      }
      const { error: authError } = await adminClient.auth.admin.updateUserById(id, { password })
      if (authError) {
        return NextResponse.json({ error: authError.message }, { status: 400 })
      }
    }

    // Optional name update
    if (fullName !== undefined) {
      const { error: profileError } = await adminClient
        .from('profiles')
        .update({ full_name: fullName || null, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (profileError) {
        return NextResponse.json({ error: profileError.message }, { status: 400 })
      }
    }

    // Optional site-access replacement
    if (siteIds !== undefined) {
      if (!Array.isArray(siteIds) || siteIds.length === 0) {
        return NextResponse.json(
          { error: 'Select at least one site this login can view.' },
          { status: 400 },
        )
      }

      // The login's parent client (for the join row's client_id)
      const { data: profile } = await adminClient
        .from('profiles')
        .select('client_id')
        .eq('id', id)
        .single()

      if (!profile?.client_id) {
        return NextResponse.json(
          { error: 'This login is not linked to a client.' },
          { status: 400 },
        )
      }

      await adminClient.from('client_site_access').delete().eq('profile_id', id)

      const rows = (siteIds as string[]).map((siteId) => ({
        profile_id: id,
        site_id: siteId,
        client_id: profile.client_id,
      }))
      const { error: accessError } = await adminClient.from('client_site_access').insert(rows)
      if (accessError) {
        return NextResponse.json({ error: accessError.message }, { status: 400 })
      }
    }

    await logAudit({
      action: password ? 'user.password_reset' : 'client_user.update',
      entityType: 'client_user',
      entityId: id,
      metadata: {
        passwordReset: Boolean(password),
        nameChanged: fullName !== undefined,
        siteAccessChanged: siteIds !== undefined,
      },
      request: req,
    })

    return NextResponse.json({ message: 'Client login updated successfully.' })
  } catch (err) {
    console.error('[v0] update-client-user error:', err)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await requireAdmin()
    if (guard.error) return guard.error

    const { id } = await params
    const adminClient = createAdminClient()

    // Capture the target email/client for the audit record before removal.
    const { data: targetProfile } = await adminClient
      .from('profiles')
      .select('email, client_id')
      .eq('id', id)
      .single()

    // Remove site grants and profile first, then the auth user
    await adminClient.from('client_site_access').delete().eq('profile_id', id)
    await adminClient.from('profiles').delete().eq('id', id)

    const { error: authError } = await adminClient.auth.admin.deleteUser(id)
    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    await logAudit({
      action: 'client_user.delete',
      entityType: 'client_user',
      entityId: id,
      targetLabel: targetProfile?.email ?? undefined,
      metadata: { clientId: targetProfile?.client_id ?? null },
      request: _req,
    })

    return NextResponse.json({ message: 'Client login deleted successfully.' })
  } catch (err) {
    console.error('[v0] delete-client-user error:', err)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
