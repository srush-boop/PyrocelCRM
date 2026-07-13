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

const STAFF_ROLES = ['admin', 'office', 'engineer']

/**
 * Create a staff member (admin/office/engineer) directly.
 * The admin sets the password; no email invitation is sent and the
 * account is active immediately so the credentials can be shared manually.
 */
export async function POST(req: NextRequest) {
  try {
    const guard = await requireAdmin()
    if (guard.error) return guard.error

    const body = await req.json()
    const { email, password, fullName, role, departmentId, branchId, copyFromUserId } = body as {
      email?: string
      password?: string
      fullName?: string
      role?: string
      departmentId?: string | null
      branchId?: string | null
      // When set, clone all settings (except identity/personal/live state) from
      // this existing user onto the new account.
      copyFromUserId?: string | null
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
    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters.' },
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

    // Optionally inherit all settings from an existing user. We copy an explicit
    // whitelist of configuration columns and deliberately EXCLUDE identity
    // (email, name, employee_number), personal media (signature, avatar), home /
    // live-location, and lone-worker temporary state — those must be unique or
    // start clean on the new account. Role/department/branch already came from
    // the form (which the dialog pre-fills from the source user).
    if (copyFromUserId) {
      const { data: source } = await adminClient
        .from('profiles')
        .select('*')
        .eq('id', copyFromUserId)
        .single()

      if (source) {
        const inherited = {
          department_id: source.department_id ?? null,
          branch_id: source.branch_id ?? null,
          manager_id: source.manager_id ?? null,
          role_id: source.role_id ?? null,
          job_title: source.job_title ?? null,
          discipline: source.discipline ?? null,
          work_start_time: source.work_start_time ?? null,
          work_end_time: source.work_end_time ?? null,
          lunch_minutes: source.lunch_minutes ?? null,
          work_days: source.work_days ?? null,
          work_day_hours: source.work_day_hours ?? null,
          holiday_entitlement_days: source.holiday_entitlement_days ?? null,
          holiday_entitlement_hours: source.holiday_entitlement_hours ?? null,
          menu_permissions: source.menu_permissions ?? null,
          dashboard_tile_colors: source.dashboard_tile_colors ?? null,
          timesheet_required: source.timesheet_required ?? null,
          can_manage_lone_worker: source.can_manage_lone_worker ?? false,
          updated_at: now,
        }
        const { error: copyError } = await adminClient
          .from('profiles')
          .update(inherited)
          .eq('id', userId)
        if (copyError) {
          console.error('[v0] copy-user settings error:', copyError.message)
          // Non-fatal: the account exists with form values; report partial success.
          return NextResponse.json(
            {
              message: 'User created, but some settings could not be copied.',
              userId,
              warning: copyError.message,
            },
            { status: 201 },
          )
        }
      }
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
