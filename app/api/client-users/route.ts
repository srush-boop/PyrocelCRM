import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

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

export async function POST(req: NextRequest) {
  try {
    const guard = await requireAdmin()
    if (guard.error) return guard.error

    const { email, password, fullName, clientId, siteIds } = await req.json()

    if (!email || !password || !clientId) {
      return NextResponse.json(
        { error: 'Email, password, and client are required.' },
        { status: 400 },
      )
    }
    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters.' },
        { status: 400 },
      )
    }
    if (!Array.isArray(siteIds) || siteIds.length === 0) {
      return NextResponse.json(
        { error: 'Select at least one site this login can view.' },
        { status: 400 },
      )
    }

    const adminClient = createAdminClient()

    // Create the auth user (email confirmation skipped — admin sets the password)
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName || null, role: 'client' },
    })

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }
    if (!authData.user) {
      return NextResponse.json({ error: 'Failed to create login.' }, { status: 500 })
    }

    const userId = authData.user.id

    // Upsert the client profile (a DB trigger may have already inserted a base row)
    const { error: profileError } = await adminClient.from('profiles').upsert({
      id: userId,
      email,
      full_name: fullName || null,
      role: 'client',
      client_id: clientId,
      accepted_at: new Date().toISOString(),
    })

    if (profileError) {
      // Roll back the auth user so we don't leave an orphan
      await adminClient.auth.admin.deleteUser(userId)
      return NextResponse.json(
        { error: `Failed to create profile: ${profileError.message}` },
        { status: 500 },
      )
    }

    // Grant the selected site permissions
    const rows = (siteIds as string[]).map((siteId) => ({
      profile_id: userId,
      site_id: siteId,
      client_id: clientId,
    }))
    const { error: accessError } = await adminClient.from('client_site_access').insert(rows)

    if (accessError) {
      await adminClient.auth.admin.deleteUser(userId)
      return NextResponse.json(
        { error: `Failed to set site access: ${accessError.message}` },
        { status: 500 },
      )
    }

    return NextResponse.json({ message: 'Client login created successfully.' }, { status: 201 })
  } catch (err) {
    console.error('[v0] create-client-user error:', err)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
