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

const STAFF_ROLES = ['admin', 'office', 'engineer', 'subcontractor']

/**
 * Create a staff member (admin/office/engineer/subcontractor) directly.
 * The admin sets the password; no email invitation is sent and the
 * account is active immediately so the credentials can be shared manually.
 */
export async function POST(req: NextRequest) {
  try {
    const guard = await requireAdmin()
    if (guard.error) return guard.error

    const body = await req.json()
    const { email, password, fullName, role, departmentId, branchId } = body as {
      email?: string
      password?: string
      fullName?: string
      role?: string
      departmentId?: string | null
      branchId?: string | null
    }

    const trimmedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''

    if (!trimmedEmail || !password || !role) {
      return NextResponse.json(
        { error: 'Email, password, and role are required.' },
        { status: 400 },
      )
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
    }
    if (typeof password !== 'string' || password.length < 12) {
      return NextResponse.json(
        { error: 'Password must be at least 12 characters.' },
        { status: 400 },
      )
    }
    if (!STAFF_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Invalid role.' }, { status: 400 })
    }

    const adminClient = createAdminClient()

    // Create the auth user with the admin-supplied password. email_confirm
    // is set so the user can sign in straight away without confirming email.
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email: trimmedEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName || null, role },
    })

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }
    if (!authData.user) {
      return NextResponse.json({ error: 'Failed to create user.' }, { status: 500 })
    }

    const userId = authData.user.id
    const now = new Date().toISOString()

    // Upsert the profile (a DB trigger may have already inserted a base row).
    // accepted_at is stamped now because the account is active immediately.
    const { error: profileError } = await adminClient.from('profiles').upsert({
      id: userId,
      email: trimmedEmail,
      full_name: fullName || null,
      role,
      department_id: departmentId || null,
      branch_id: branchId || null,
      status: 'active',
      accepted_at: now,
      updated_at: now,
    })

    if (profileError) {
      // Roll back the auth user so we don't leave an orphan.
      await adminClient.auth.admin.deleteUser(userId)
      return NextResponse.json(
        { error: `Failed to create profile: ${profileError.message}` },
        { status: 500 },
      )
    }

    return NextResponse.json(
      { message: 'User created successfully.', userId },
      { status: 201 },
    )
  } catch (err) {
    console.error('[v0] create-user error:', err)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
