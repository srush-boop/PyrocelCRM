import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

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
