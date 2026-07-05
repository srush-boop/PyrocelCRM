import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { password } = await req.json()

    if (!password || typeof password !== 'string' || password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters.' },
        { status: 400 },
      )
    }

    // Verify the caller is an authenticated admin
    const serverClient = await createClient()
    const {
      data: { user },
    } = await serverClient.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })
    }

    const { data: callerProfile } = await serverClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!callerProfile || callerProfile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
    }

    const adminClient = createAdminClient()
    const { error: authError } = await adminClient.auth.admin.updateUserById(id, { password })

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    return NextResponse.json({ message: 'Password updated successfully.' })
  } catch (err) {
    console.error('[v0] update-password error:', err)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await req.json()
    const {
      full_name,
      email,
      role,
      department_id,
      branch_id,
      status,
      manager_id,
      employee_number,
      holiday_entitlement_days,
      holiday_entitlement_hours,
      role_id,
      job_title,
      timesheet_required,
    } = body as {
      full_name?: string
      email?: string
      role?: string
      department_id?: string | null
      branch_id?: string | null
      status?: string
      manager_id?: string | null
      employee_number?: string | null
      holiday_entitlement_days?: number | null
      holiday_entitlement_hours?: number | null
      role_id?: string | null
      job_title?: string | null
      timesheet_required?: boolean | null
    }

    // Verify the caller is an authenticated admin
    const serverClient = await createClient()
    const {
      data: { user },
    } = await serverClient.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })
    }

    const { data: callerProfile } = await serverClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!callerProfile || callerProfile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
    }

    const validRoles = ['admin', 'office', 'engineer', 'client']
    if (role && !validRoles.includes(role)) {
      return NextResponse.json({ error: 'Invalid role.' }, { status: 400 })
    }
    if (status && !['active', 'inactive'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status.' }, { status: 400 })
    }
    const trimmedEmail = typeof email === 'string' ? email.trim().toLowerCase() : undefined
    if (trimmedEmail !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
    }

    const adminClient = createAdminClient()

    // Update the auth email first (if changed); profile email mirrors it.
    if (trimmedEmail) {
      const { error: authError } = await adminClient.auth.admin.updateUserById(id, {
        email: trimmedEmail,
      })
      if (authError) {
        return NextResponse.json({ error: authError.message }, { status: 400 })
      }
    }

    // Build the profile patch from provided fields only.
    const profilePatch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (full_name !== undefined) profilePatch.full_name = full_name
    if (trimmedEmail) profilePatch.email = trimmedEmail
    if (role !== undefined) profilePatch.role = role
    if (department_id !== undefined) profilePatch.department_id = department_id || null
    if (branch_id !== undefined) profilePatch.branch_id = branch_id || null
    if (status !== undefined) profilePatch.status = status
    // A user cannot be their own manager.
    if (manager_id !== undefined) {
      profilePatch.manager_id = manager_id && manager_id !== id ? manager_id : null
    }
    if (employee_number !== undefined) {
      const trimmed = typeof employee_number === 'string' ? employee_number.trim() : ''
      profilePatch.employee_number = trimmed || null
    }
    // Assigned descriptive role (managed in Settings > Roles). Empty = unassign.
    if (role_id !== undefined) profilePatch.role_id = role_id || null
    if (job_title !== undefined) {
      const trimmed = typeof job_title === 'string' ? job_title.trim() : ''
      profilePatch.job_title = trimmed || null
    }
    // Per-user timesheet override. null = inherit from role; boolean = explicit.
    if (timesheet_required !== undefined) {
      profilePatch.timesheet_required =
        timesheet_required === null ? null : Boolean(timesheet_required)
    }
    // Holiday entitlement: accept a non-negative number or null to clear.
    const parseEntitlement = (v: unknown): number | null => {
      if (v === null || v === undefined || v === '') return null
      const n = Number(v)
      return Number.isFinite(n) && n >= 0 ? n : null
    }
    if (holiday_entitlement_days !== undefined) {
      profilePatch.holiday_entitlement_days = parseEntitlement(holiday_entitlement_days)
    }
    if (holiday_entitlement_hours !== undefined) {
      profilePatch.holiday_entitlement_hours = parseEntitlement(holiday_entitlement_hours)
    }

    const { error: profileError } = await adminClient
      .from('profiles')
      .update(profilePatch)
      .eq('id', id)

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 })
    }

    return NextResponse.json({ message: 'Profile updated successfully.' })
  } catch (err) {
    console.error('[v0] update-profile error:', err)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    // Verify the caller is an authenticated admin
    const serverClient = await createClient()
    const {
      data: { user },
    } = await serverClient.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })
    }

    const { data: callerProfile } = await serverClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!callerProfile || callerProfile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
    }

    // Prevent self-deletion
    if (id === user.id) {
      return NextResponse.json(
        { error: 'You cannot delete your own account.' },
        { status: 400 },
      )
    }

    const adminClient = createAdminClient()

    // Delete from Supabase Auth — this cascades to the profiles row
    // via the on-delete trigger / FK, depending on schema setup.
    // We also explicitly delete the profile to be safe.
    await adminClient.from('profiles').delete().eq('id', id)

    const { error: authError } = await adminClient.auth.admin.deleteUser(id)

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    return NextResponse.json({ message: 'User deleted successfully.' })
  } catch (err) {
    console.error('[v0] delete-user error:', err)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
